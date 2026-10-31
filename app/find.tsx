import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  FlatList,
  InteractionManager,
  Keyboard,
  ScrollView,
  StyleSheet,
  Text,
  type TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { router, Stack, useFocusEffect } from '../src/navigation/router';

import { listBooks, type BookListItem } from '../src/db/repo';
import { addCandidate, addChoice, addTyped } from '../src/books/add';
import {
  findBook,
  isIsbn,
  type Candidate,
  type CatalogReport,
  type Lookup,
} from '../src/sources/identify';
import { googleBooksKey } from '../src/sources/googleBooksKey';
import { rememberSeen, seenCandidate, SEEN } from '../src/sources/seen';
import { NO_RESULTS, rankBook, searchLibrary, type LibraryResults } from '../src/search/library';
import { oneAtATime } from '../src/search/oneAtATime';
import { newestOnly } from '../src/search/newestOnly';
import { searchIndex, type IndexedBook } from '../src/sources/catalog';
import { publicSources } from '../src/sources/registry';
import { choiceFromIndex, takeChoice, type Choice } from '../src/sources/chosen';
import { searchLicensed, searchSpecial } from '../src/sources/special';
import { forgetSearches, recentSearches, remember } from '../src/search/history';

import { offers } from '../src/store/scope';
import { ConfirmAdd } from '../src/ui/AddSheets';
import { BookLine } from '../src/ui/BookLine';
import { HitCard, toRow, type ResultRow } from '../src/ui/HitCard';
import { Row, Section } from '../src/ui/primitives';
import { SearchBar, SearchGlass, SEARCH_BAR_HEIGHT, searchBarOffset } from '../src/ui/SearchBar';
import { useSourceBoard } from '../src/ui/BookSources';
import { useKeyboardHeight, useKeyboardLift } from '../src/ui/keyboard';
import { radius, space, usePalette } from '../src/theme';

/**
 * Adding a book and finding one are the same errand, and this is it.
 *
 * There is no add menu any more. There was: three levels deep, and the first
 * question it asked was what kind of book this is — before the title, before
 * the source, before the reader had said the one thing they actually knew.
 *
 * What replaced it is a field. Type a title and it goes to everything at once:
 * the shelf, the words inside it, every list kept on the device. Tap a result
 * and the book is yours.
 *
 * With the field empty the page is the sources themselves — which lists this
 * device holds, how old each one is, and which ones are not here yet. That is
 * the honest answer to "why did my search find nothing", and it is the only
 * thing a search box can usefully say before it has been typed into.
 *
 * Nothing here takes a file. That is on the shelf, above Settings: a
 * manuscript already on the phone needs no search.
 */

type Line =
  | { key: string; kind: 'head'; title: string; note?: string }
  | { key: string; kind: 'note'; title: string; body: string }
  | { key: string; kind: 'book'; book: BookListItem }
  | { key: string; kind: 'hit'; row: ResultRow }
  | { key: string; kind: 'row'; label: string; detail?: string; value?: string; onPress: () => void };

/**
 * Long enough that a scan of every manuscript is worth starting, short enough
 * that the answer feels like it was already there. It was 220 when that scan
 * lowercased the whole library; it no longer does.
 */
const SETTLE = 140;

/**
 * And longer again before anybody's server is asked — long enough that typing
 * a title does not fire a request per word. The lists on the device answer
 * while this is still waiting, which is the order a reader wants anyway: what
 * you have, then what exists.
 *
 * Nothing on screen waits for it. The shelf answers from memory on the
 * keystroke itself, the kept lists a breath later, and the catalogs fill in
 * underneath as they reply.
 */
const REACH = 300;

/** What a section of hits is titled, in the order somebody means them. */
const SECTIONS: { id: string; title: string }[] = [
  { id: 'chapters', title: 'shelf.inChapters' },
  { id: 'cast', title: 'shelf.inCast' },
  { id: 'terms', title: 'shelf.inTerms' },
  { id: 'notes', title: 'shelf.inNotes' },
  { id: 'text', title: 'shelf.inTheText' },
];

export default function Find() {
  const { t } = useTranslation();
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const lift = useKeyboardLift({ native: true });
  /**
   * How far the keyboard comes up, as a number rather than the animated value
   * the search pill rides: this is padding at the foot of a list, and a list
   * that is not tall enough to scroll cannot be scrolled out from under it.
   */
  const keyboard = useKeyboardHeight({ settled: true });

  const [query, setQuery] = useState('');
  const [books, setBooks] = useState<BookListItem[] | null>(null);
  const [results, setResults] = useState<LibraryResults>(NO_RESULTS);
  const [hits, setHits] = useState<IndexedBook[]>([]);
  const [choice, setChoice] = useState<Choice | null>(null);
  /** What the catalogs say the book *is*, as opposed to where to get it. */
  const [named, setNamed] = useState<Candidate[]>([]);
  const [catalogs, setCatalogs] = useState<CatalogReport[]>([]);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  /** What has been looked for before. */
  const [recent, setRecent] = useState<string[]>([]);

  const { kept, readSources, update, waiting, sheet } = useSourceBoard();

  const load = useCallback(() => {
    listBooks().then(setBooks).catch(() => setBooks([]));
    readSources();
    // A catalog with a page of its own — Open Library, arXiv, the bible
    // editions — hands its pick back by leaving it here on the way out.
    const taken = takeChoice();
    if (taken) setChoice(taken);
    recentSearches().then(setRecent).catch(() => undefined);
  }, [readSources]);

  /**
   * Nothing above happens until the page is actually on screen.
   *
   * Opening this page used to take a visible second, and none of it was the
   * work: it was the work being started on the same frames the push animation
   * needed. Four reads — the shelf, the kept lists, two keychain lookups —
   * and a keyboard being raised, all while the screen was still sliding in.
   * The keychain is the worst of them; it is a trip out to another process.
   *
   * So the reads wait for the page. The keyboard does not: there is no slide
   * any more, and the field raises it itself — see `autoFocus` below.
   */
  const field = useRef<TextInput | null>(null);

  useFocusEffect(
    useCallback(() => {
      const task = InteractionManager.runAfterInteractions(() => {
        load();
      });
      return () => task.cancel();
    }, [load])
  );

  const online = useMemo(
    () =>
      publicSources().flatMap((source) =>
        source.remote && source.find ? [{ id: source.id, page: source.find }] : []
      ),
    []
  );

  // The shelf is in memory, so it answers the keystroke itself — and in the
  // order asked for: the book named, then the one by that author.
  const shelf = useMemo(() => {
    const term = query.trim();
    if (!term) return [];
    const ranked: { book: BookListItem; rank: number }[] = [];
    for (const book of books ?? []) {
      const rank = rankBook(book, term);
      if (rank !== null) ranked.push({ book, rank });
    }
    return ranked.sort((a, b) => a.rank - b.rank).map((entry) => entry.book);
  }, [books, query]);

  const specials = useMemo(() => (offers('scripture') ? searchSpecial(query) : []), [query]);

  /**
   * A kept list either records what a book is or hands over its words, and
   * those are different answers to different questions. Open Library is the
   * first; everything else kept here is the second.
   */
  const works = useMemo(
    () =>
      hits.filter((hit) => {
        const base = hit.source.split(':')[0];
        return base === 'openlibrary' || base === SEEN;
      }),
    [hits]
  );
  const texts = useMemo(
    () =>
      hits.filter((hit) => {
        const base = hit.source.split(':')[0];
        return base !== 'openlibrary' && base !== SEEN;
      }),
    [hits]
  );
  /** Named, and not ours to give — see `licensedEditions`. */
  const licensed = useMemo(() => (offers('scripture') ? searchLicensed(query) : null), [query]);
  /**
   * Not one catalog answered — no signal, or every door refusing at once.
   *
   * Worth its own word because the page did nothing at all about it: the
   * published-books section is drawn only when it has rows or is waiting for
   * some, so a lookup that failed removed the section, and a reader saw their
   * shelf and then nothing, with no indication that half the search had not
   * run. Below, this is what puts the lists on the device in its place.
   */
  const quiet = useMemo(
    () => catalogs.length > 0 && catalogs.every((report) => !report.answered),
    [catalogs]
  );
  /**
   * Which lists a query goes to, as a value rather than an array — the search
   * below depends on it, and a fresh array of the same names every time the
   * catalogs are re-read would re-run a scan of every manuscript for nothing.
   */
  const sourceKey = useMemo(() => kept.map((row) => row.source).sort().join(','), [kept]);
  const sources = useMemo(() => (sourceKey ? sourceKey.split(',') : []), [sourceKey]);

  // Everything else is a query per keystroke, so it waits for a pause: one is
  // a scan of every short column in the library, the other of every word of
  // every manuscript on the device.
  //
  // A pause between two letters is often longer than that wait, so each letter
  // would start a scan and the last one's answer queued behind all of them.
  // Now one runs at a time and only the newest term waits. A term that only
  // adds letters to one that found nothing finds nothing too, so it is not asked.
  const sourcesNow = useRef(sources);
  const nothingUnder = useRef<{ library: string | null; index: string | null; sources: string }>({
    library: null,
    index: null,
    sources: sourceKey,
  });
  const local = useMemo(
    () =>
      newestOnly(
        async (term) => {
          const none = nothingUnder.current;
          const extends_ = (empty: string | null) => empty !== null && term.startsWith(empty);
          const [library, index] = await Promise.all([
            extends_(none.library) ? NO_RESULTS : searchLibrary(term).catch(() => NO_RESULTS),
            extends_(none.index) ? [] : searchIndex(term, sourcesNow.current).catch(() => []),
          ]);
          // Content search starts at two letters, so one letter's nothing proves nothing.
          if (!library.meta.length && !library.text.length && term.length >= 2) none.library ??= term;
          if (!index.length) none.index ??= term;
          return { library, index };
        },
        (_term, { library, index }) => {
          setResults(library);
          setHits(index);
        }
      ),
    []
  );

  useEffect(() => {
    sourcesNow.current = sources;
    const none = nothingUnder.current;
    if (none.sources !== sourceKey) Object.assign(none, { index: null, sources: sourceKey });
  }, [sources, sourceKey]);

  useEffect(() => {
    const term = query.trim().toLowerCase();
    const none = nothingUnder.current;
    if (none.library && !term.startsWith(none.library)) none.library = null;
    if (none.index && !term.startsWith(none.index)) none.index = null;
    if (!term) {
      local.stop();
      setResults(NO_RESULTS);
      setHits([]);
      return;
    }
    const timer = setTimeout(() => local.ask(term), SETTLE);
    return () => clearTimeout(timer);
  }, [query, sources, local]);

  useEffect(() => () => local.stop(), [local]);

  /**
   * Published books of this name, asked of the catalogs that record them.
   *
   * This is the front door of adding a book now. What a reader types is a
   * name, and what should come back is the work — the book as published,
   * whoever wrote it and whenever it came out — rather than a file somebody
   * happens to be able to supply. Those are two different questions and only
   * this one has an answer for every book.
   *
   * A number typed instead of a name is the same question with no ambiguity
   * in it, so it goes straight out rather than waiting for the pause that
   * guards against searching on a half-typed word.
   */
  const lookup = useMemo(
    () =>
      oneAtATime<Lookup>(
        (term, { signal, partial }) =>
          googleBooksKey()
            .catch(() => null)
            // Each catalog paints as it lands. Open Library usually answers
            // in well under a second; the old Google feed sometimes never
            // does, and there is no reason the first should wait for it.
            .then((googleKey) => findBook(term, { googleKey, signal, onPartial: partial })),
        {
          answer: (_term, found, settled) => {
            setNamed(found.candidates);
            setCatalogs(found.catalogs);
            // Written down on the way past, so the same book answers without a
            // request next time — and on a plane.
            //
            // Nothing is re-read afterwards, deliberately. Refreshing the kept
            // lists here changed `sources`, which is what the local search
            // depends on, which re-ran a scan of every manuscript on the device
            // a second after the first one finished. The cache is for the next
            // query; this one already has its answer on screen.
            if (settled) void rememberSeen(found.candidates).catch(() => undefined);
          },
          // Both catalogs unreachable. Keeping that as a report rather than an
          // empty list is the difference between "no such book" and "no
          // signal", and offline they are very different sentences.
          failed: () => {
            setNamed([]);
            setCatalogs([
              { source: 'openlibrary', answered: false, found: 0 },
              { source: 'google', answered: false, found: 0 },
            ]);
          },
          waiting: setAsking,
        }
      ),
    []
  );

  useEffect(() => {
    const term = query.trim();
    if (term.length < 3) {
      lookup.stop();
      setNamed([]);
      setCatalogs([]);
      return;
    }
    // Not before the request exists. Setting `asking` at the keystroke put
    // "Looking up published books…" on screen for the whole of the pause that
    // guards against searching a half-typed word — most of the wait anybody
    // complained about was this app deciding not to ask yet. It is the lookup
    // itself that says when it is busy now.
    const timer = setTimeout(() => lookup.ask(term), isIsbn(term) ? 0 : REACH);
    return () => clearTimeout(timer);
  }, [query, lookup]);

  // Leaving the screen is a good enough reason to stop asking about a book
  // nobody is looking for any more.
  useEffect(() => () => lookup.stop(), [lookup]);

  /** A work chosen by name: the record goes on the shelf, the words follow. */
  async function name(candidate: Candidate) {
    setBusy(true);
    keep();
    try {
      const route = await addCandidate(candidate);
      setBusy(false);
      router.back();
      router.push(route);
    } catch (problem) {
      setBusy(false);
      Alert.alert(t('import.failed'), String(problem));
    }
  }

  /**
   * A query somebody did something with, which is the only kind worth
   * keeping. Recording every settled keystroke would fill the list with the
   * prefixes of one search.
   */
  function keep() {
    const asked = query.trim();
    if (asked) void remember(asked).then(setRecent);
  }

  /**
   * Onto the shelf, and out of the way: the page that follows is the answer,
   * so this one goes. A frame first — this is called from inside a native
   * modal, and popping the screen under one in the same frame it is told to
   * close leaves the sheet up over whatever arrives next.
   */
  function leaveFor(route: string) {
    setChoice(null);
    setBusy(false);
    requestAnimationFrame(() => {
      router.back();
      router.push(route);
    });
  }

  /** A catalog hit, taken up — as a choice, which is what every source hands over. */
  function take(hit: IndexedBook) {
    const picked = choiceFromIndex(hit);
    if (!picked) {
      // The index knows this edition and the file describing it is gone — a
      // restore can bring one back without the other. Fetching the list again
      // writes both.
      return update('ebible');
    }
    setChoice(picked);
    Keyboard.dismiss();
    keep();
  }

  async function confirm(picked: Choice, options: { apocrypha: boolean }) {
    setBusy(true);
    try {
      leaveFor(await addChoice(picked, options));
    } catch (problem) {
      setBusy(false);
      Alert.alert(t('import.failed'), String(problem));
    }
  }

  /** The sources a search went to, named, for the line that says so. */
  const searchedNames = useMemo(
    () =>
      [...new Set(sources.map((id) => id.split(':')[0]))]
        .map((id) => t(`source.${id}`))
        .join(' · '),
    [sources, t]
  );

  const lines = useMemo<Line[]>(() => {
    const term = query.trim();
    if (!term) return [];
    const flat: Line[] = [];
    const head = (key: string, title: string, note?: string) =>
      flat.push({ key: `head-${key}`, kind: 'head', title, note });

    if (shelf.length) {
      head('shelf', t('find.onShelf', { count: shelf.length }));
      for (const book of shelf) flat.push({ key: `book-${book.id}`, kind: 'book', book });
    }

    /**
     * What the book *is*, before what is inside anything. Somebody typing a
     * title is naming a work, and the catalogs of published books are who
     * knows works.
     *
     * Two sources, one tier. A subject list kept on this device is a list of
     * published records — the same kind of thing the network returns, only
     * already here — so it answers instantly and without a request, and what
     * comes back over the wire fills in behind it. These were separate
     * sections until now, with the local ones filed under "text from Open
     * Library", which is a heading for a catalog that hands over no text.
     */
    // One catalog writes "Jane Austen" and the other "Austen, Jane", so the
    // author's words are sorted before they are compared and the punctuation
    // between them is dropped. An ISBN, where both have one, is better than
    // any of that and is checked first.
    const already = new Set(works.map(sameBook));
    const numbers = new Set(
      works.map((row) => seenCandidate(row)?.isbn).filter((isbn): isbn is string => Boolean(isbn))
    );
    const fresh = named.filter(
      (candidate) =>
        !(candidate.isbn && numbers.has(candidate.isbn)) && !already.has(sameBook(candidate))
    );
    /**
     * Nothing answered, so the lists on this device answer instead.
     *
     * A Gutenberg or eBible row is a published record like any other — it is
     * simply one that is already here. Filed under "text from Project
     * Gutenberg" it reads as a download rather than as the book somebody was
     * looking for, and with the catalogs quiet it is the only answer there is,
     * so it moves up here and out of the per-source sections below.
     */
    const standIn = quiet && !asking
      ? texts.filter((row) => !already.has(sameBook(row)))
      : [];
    if (works.length || fresh.length || standIn.length || asking || quiet) {
      // A heading reading "Published books (0)" over nothing, for the second
      // the catalogs take to answer, is a section saying it found none — and
      // then contradicting itself. While there is nothing yet it says what it
      // is doing instead of counting it.
      const shown = works.length + fresh.length + standIn.length;
      const none = shown === 0;
      head(
        'named',
        none && asking ? t('find.lookingUp') : t('find.named', { count: shown }),
        none && asking
          ? undefined
          : asking
            ? t('find.asking')
            : quiet
              ? t('find.catalogsQuiet')
              : refused(catalogs, t)
      );
      for (const row of works) {
        const remembered = row.source === SEEN ? seenCandidate(row) : null;
        flat.push({
          key: `work-${row.source}-${row.extId}`,
          kind: 'row',
          label: row.title,
          detail:
            [row.author, remembered?.year, remembered?.isbn ?? row.language]
              .filter(Boolean)
              .join(' · ') || undefined,
          value: t('find.add'),
          onPress: () => (remembered ? void name(remembered) : take(row)),
        });
      }
      for (const hit of standIn) {
        flat.push({
          key: `hit-${hit.source}-${hit.extId}`,
          kind: 'row',
          label: hit.title,
          detail: [hit.author, hit.language].filter(Boolean).join(' · ') || undefined,
          value: t('find.add'),
          onPress: () => take(hit),
        });
      }
      for (const candidate of fresh) {
        flat.push({
          key: `named-${candidate.id}`,
          kind: 'row',
          label: candidate.title,
          detail:
            [candidate.author, candidate.year, candidate.isbn].filter(Boolean).join(' · ') ||
            undefined,
          value: t('find.add'),
          onPress: () => void name(candidate),
        });
      }
    }

    const found: Record<string, ResultRow[]> = {
      chapters: results.meta.filter((h) => h.kind === 'chapter').map(toRow),
      cast: results.meta.filter((h) => h.kind === 'character' || h.kind === 'place').map(toRow),
      terms: results.meta.filter((h) => h.kind === 'term' || h.kind === 'card').map(toRow),
      notes: results.meta.filter((h) => h.kind === 'note').map(toRow),
      text: results.text.map((h) => ({
        key: `text-${h.bookId}-${h.offset}`,
        context: h.title,
        label: h.excerpt,
        onPress: () => router.push(`/reader/${h.bookId}?at=${h.offset}`),
      })),
    };
    for (const section of SECTIONS) {
      const rows = found[section.id];
      if (!rows.length) continue;
      head(section.id, t(section.title, { count: rows.length }));
      for (const row of rows) flat.push({ key: row.key, kind: 'hit', row });
    }

    // Why this one cannot be here, before the list of what can. Somebody who
    // typed `NIV` is owed the licence, not a shorter list of other books.
    if (licensed) {
      flat.push({
        key: `licensed-${licensed.id}`,
        kind: 'note',
        title: t('find.licensedTitle', { title: licensed.title }),
        body: t('find.licensedWhy', { title: licensed.title, holder: licensed.holder }),
      });
    }

    if (specials.length) {
      head('editions', t('find.otherEditions'));
      for (const edition of specials) {
        flat.push({
          key: `special-${edition.id}`,
          kind: 'row',
          label: edition.title,
          detail: edition.author,
          value: t('find.setUp'),
          onPress: () => router.push(edition.page),
        });
      }
    }

    // A heading per source rather than one list of everything. With four
    // catalogs on the device, "not on your shelf" is a pile; the source is
    // what tells you whether a row is a book you can read or a record to
    // keep notes on.
    const byCatalog = new Map<string, IndexedBook[]>();
    for (const hit of quiet && !asking ? [] : texts) {
      const base = hit.source.split(':')[0];
      const found = byCatalog.get(base);
      if (found) found.push(hit);
      else byCatalog.set(base, [hit]);
    }
    for (const [base, rows] of byCatalog) {
      head(`catalog-${base}`, t('find.textFrom', { source: t(`source.${base}`) , count: rows.length }));
      for (const hit of rows) {
        flat.push({
          key: `hit-${hit.source}-${hit.extId}`,
          kind: 'row',
          label: hit.title,
          detail: [hit.author, hit.language].filter(Boolean).join(' · ') || undefined,
          value: t('find.add'),
          onPress: () => take(hit),
        });
      }
    }

    // What to do when none of it was the book.
    head('more', t('find.notFound'));
    flat.push({
      key: 'keep-typed',
      kind: 'row',
      label: t('find.keepTyped', { title: term }),
      detail: t('find.keepTypedWhy'),
      value: '›',
      onPress: () => {
        keep();
        void addTyped(term).then(leaveFor);
      },
    });
    for (const source of online) {
      flat.push({
        key: `online-${source.id}`,
        kind: 'row',
        label: t('find.searchAt', { source: t(`source.${source.id}`) }),
        detail: t(`source.${source.id}Detail`),
        value: '›',
        onPress: () => router.push({ pathname: source.page, params: { q: term } }),
      });
    }
    // A source that cannot answer yet is raised here rather than on the board:
    // it is only worth mentioning to somebody who has just looked for
    // something and not found it.
    for (const card of waiting) {
      flat.push({
        key: `waiting-${card.id}`,
        kind: 'row',
        label: card.label,
        detail: card.detail,
        value: card.value,
        onPress: card.onPress,
      });
    }
    return flat;
    // The handlers read only state these already depend on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shelf, named, asking, quiet, catalogs, results, works, texts, specials, licensed, online, waiting, query, t]);

  const typed = query.trim().length > 0;

  /**
 * Whether two rows are the same book, across catalogs that disagree about how
 * to write a name. Not an identity — two editions of one work collapse into
 * one row here, which in a list of works is the right answer anyway.
 */
function sameBook(row: { title: string; author?: string | null }): string {
  const words = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter(Boolean);
  return `${words(row.title).join(' ')}|${words(row.author ?? '').sort().join(' ')}`;
}

/**
 * A catalog that refused, said out loud. Both of them answering with nothing
 * means the book is not in either; one of them refusing means half the search
 * did not run, and "no results" would be a lie about a book that is in there.
 */
function refused(catalogs: CatalogReport[], t: TFunction): string | undefined {
  const quiet = catalogs.filter((report) => !report.answered);
  if (!quiet.length || quiet.length === catalogs.length) return undefined;
  return t('find.catalogQuiet', {
    catalogs: quiet.map((report) => t(`identify.catalog_${report.source}`)).join(' · '),
  });
}

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <Stack.Screen options={{ title: typed ? t('find.title') : '', headerBackTitle: ' ' }} />

      {typed ? (
        <FlatList
          style={{ flex: 1 }}
          data={lines}
          keyExtractor={(line) => line.key}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ padding: space.lg, paddingBottom: SEARCH_BAR_HEIGHT + space.xxl }}
          renderItem={({ item }) =>
            item.kind === 'note' ? (
              <View
                style={[
                  styles.card,
                  styles.note,
                  { backgroundColor: palette.surface, borderColor: palette.border },
                ]}
              >
                <Text style={{ color: palette.text, fontSize: 15, fontWeight: '600' }}>
                  {item.title}
                </Text>
                <Text style={{ color: palette.dim, fontSize: 13, lineHeight: 19, marginTop: 4 }}>
                  {item.body}
                </Text>
              </View>
            ) : item.kind === 'head' ? (
              <View>
                <Text style={[styles.head, { color: palette.dim }]}>{item.title}</Text>
                {item.note ? (
                  <Text style={{ color: palette.faint, fontSize: 12, marginBottom: space.sm }}>
                    {item.note}
                  </Text>
                ) : null}
              </View>
            ) : item.kind === 'hit' ? (
              <HitCard row={item.row} />
            ) : (
              <View
                style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}
              >
                {item.kind === 'book' ? (
                  <BookLine
                    book={item.book}
                    last
                    onPress={() => {
                      keep();
                      router.push(`/book/${item.book.id}`);
                    }}
                  />
                ) : (
                  <Row
                    label={item.label}
                    detail={item.detail}
                    value={item.value}
                    onPress={item.onPress}
                    last
                  />
                )}
              </View>
            )
          }
        />
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          /**
           * The keyboard's height is part of the padding, because this page
           * opens with the field focused and the list runs full height behind
           * the keyboard. Shorter than the screen, it was never scrollable —
           * so everything below the fold, the recent searches included, sat
           * under the keyboard with no way to reach it.
           */
          contentContainerStyle={{
            padding: space.lg,
            paddingBottom: SEARCH_BAR_HEIGHT + space.xxl + keyboard,
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {/* What the box does, said once and plainly. This page is empty
              until somebody types, and an empty page that explains itself is
              worth more than one listing machinery nobody came for. */}
          <View style={[styles.tip, { backgroundColor: palette.soft }]}>
            <SearchGlass color={palette.accent} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: palette.accent, fontSize: 16, fontWeight: '600' }}>
                {t('find.tipTitle')}
              </Text>
              <Text style={{ color: palette.dim, fontSize: 13, lineHeight: 19, marginTop: 4 }}>
                {t('find.tipBody')}
              </Text>
            </View>
          </View>

          {recent.length ? (
            <Section
              title={t('find.recent')}
              action={{
                label: t('find.forget'),
                onPress: () => void forgetSearches().then(() => setRecent([])),
              }}
            >
              {recent.map((asked, index) => (
                <Row
                  key={asked}
                  label={asked}
                  value="↖"
                  onPress={() => setQuery(asked)}
                  last={index === recent.length - 1}
                />
              ))}
            </Section>
          ) : null}
        </ScrollView>
      )}

      {/* It rides the keyboard up rather than being covered by it: the same
          gap it already keeps off the bottom edge, plus however far the
          keyboard has come. */}
      <SearchBar
        value={query}
        onChange={setQuery}
        placeholder={t('find.placeholder')}
        onSubmit={keep}
        bottom={searchBarOffset(insets.bottom)}
        lift={lift}
        field={field}
        // The field raises its own keyboard once it is in the window. A
        // focus() from here landed a frame early, and iOS built a keyboard,
        // threw it away and built another: half a second, every time.
        autoFocus
      />

      {choice ? (
        <ConfirmAdd
          choice={choice}
          busy={busy}
          onAdd={(options) => void confirm(choice, options)}
          onClose={() => setChoice(null)}
        />
      ) : null}

    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: space.lg,
    marginBottom: space.sm,
  },
  tip: {
    flexDirection: 'row',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    marginBottom: space.lg,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    overflow: 'hidden',
    marginBottom: space.xs,
  },
  note: { padding: space.md, marginTop: space.lg },
});
