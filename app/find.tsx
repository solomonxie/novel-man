import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Animated,
  FlatList,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { router, Stack, useFocusEffect } from '../src/navigation/router';

import { listBooks, type BookListItem } from '../src/db/repo';
import { addCandidate, addChoice, addTyped } from '../src/books/add';
import { findBook, isIsbn, type Candidate, type CatalogReport } from '../src/sources/identify';
import { googleBooksKey } from '../src/sources/googleBooksKey';
import { rememberSeen, seenCandidate, SEEN } from '../src/sources/seen';
import { NO_RESULTS, rankBook, searchLibrary, type LibraryResults } from '../src/search/library';
import { keptCatalogs, searchIndex, type IndexedBook } from '../src/sources/catalog';
import { publicSources, type PublicSource } from '../src/sources/registry';
import { choiceFromIndex, takeChoice, type Choice } from '../src/sources/chosen';
import { ESV_TITLE, searchLicensed, searchSpecial } from '../src/sources/special';
import { forgetSearches, recentSearches, remember } from '../src/search/history';

import { esvKey } from '../src/sources/esvKey';
import { standardEbooksEmail } from '../src/sources/standardEbooksEmail';
import {
  activeCount,
  enqueueCatalogs,
  subscribeToQueue,
  type CatalogSource,
} from '../src/import/queue';
import { ConfirmAdd } from '../src/ui/AddSheets';
import { BookLine } from '../src/ui/BookLine';
import { HitCard, toRow, type ResultRow } from '../src/ui/HitCard';
import { Row, Section } from '../src/ui/primitives';
import { SearchBar, SearchGlass, SEARCH_BAR_HEIGHT, searchBarOffset } from '../src/ui/SearchBar';
import { SourceRows } from '../src/ui/SourceRows';
import { useKeyboardLift } from '../src/ui/keyboard';
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
 * Nothing here takes a file or a link. A book arrives as a record first —
 * found in a catalog or typed from memory — and gets its words afterwards,
 * from its own page, where there is already a book for them to belong to.
 */

type Line =
  | { key: string; kind: 'head'; title: string; note?: string }
  | { key: string; kind: 'note'; title: string; body: string }
  | { key: string; kind: 'book'; book: BookListItem }
  | { key: string; kind: 'hit'; row: ResultRow }
  | { key: string; kind: 'row'; label: string; detail?: string; value?: string; onPress: () => void };

/**
 * Long enough that a scan of every manuscript on the device is worth starting.
 */
const SETTLE = 220;

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
const REACH = 650;

/** Past this, a kept list has had time to fall behind what the source publishes. */
const STALE_DAYS = 90;

/** What a section of hits is titled, in the order somebody means them. */
const SECTIONS: { id: string; title: string }[] = [
  { id: 'chapters', title: 'shelf.inChapters' },
  { id: 'cast', title: 'shelf.inCast' },
  { id: 'terms', title: 'shelf.inTerms' },
  { id: 'notes', title: 'shelf.inNotes' },
  { id: 'text', title: 'shelf.inTheText' },
];

/** A source as the board shows it: one line, one tap, one thing it does. */
type SourceCard = {
  id: string;
  label: string;
  detail: string;
  value: string;
  /** Ready to answer a search right now, or still waiting for something. */
  ready: boolean;
  onPress: () => void;
};

export default function Find() {
  const { t, i18n } = useTranslation();
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const lift = useKeyboardLift();

  const [query, setQuery] = useState('');
  const [books, setBooks] = useState<BookListItem[] | null>(null);
  const [results, setResults] = useState<LibraryResults>(NO_RESULTS);
  const [hits, setHits] = useState<IndexedBook[]>([]);
  const [kept, setKept] = useState<{ source: string; fetchedAt: number; count: number }[]>([]);
  const [emailed, setEmailed] = useState(false);
  const [keyed, setKeyed] = useState(false);
  const [choice, setChoice] = useState<Choice | null>(null);
  /** What the catalogs say the book *is*, as opposed to where to get it. */
  const [named, setNamed] = useState<Candidate[]>([]);
  const [catalogs, setCatalogs] = useState<CatalogReport[]>([]);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  /** Queued for an update, until the queue says otherwise. */
  const [updating, setUpdating] = useState<string[]>([]);
  /** The one source that wants a credential before its list is worth fetching. */
  const [settingUp, setSettingUp] = useState<PublicSource | null>(null);
  /** What has been looked for before, and which shelf of sources is open. */
  const [recent, setRecent] = useState<string[]>([]);
  const [opened, setOpened] = useState<'available' | 'waiting' | null>(null);

  const readSources = useCallback(() => {
    keptCatalogs().then(setKept).catch(() => undefined);
    standardEbooksEmail().then((email) => setEmailed(Boolean(email))).catch(() => undefined);
    esvKey().then((key) => setKeyed(Boolean(key))).catch(() => undefined);
  }, []);

  const load = useCallback(() => {
    listBooks().then(setBooks).catch(() => setBooks([]));
    readSources();
    // A catalog with a page of its own — Open Library, arXiv, the bible
    // editions — hands its pick back by leaving it here on the way out.
    const taken = takeChoice();
    if (taken) setChoice(taken);
    recentSearches().then(setRecent).catch(() => undefined);
  }, [readSources]);

  useFocusEffect(load);

  // A list is fetched in the queue with everything else, so the page learns it
  // finished the way the shelf does: by being told the queue went quiet.
  useEffect(
    () =>
      subscribeToQueue(() => {
        if (activeCount() > 0) return;
        setUpdating((was) => (was.length ? [] : was));
        readSources();
      }),
    [readSources]
  );

  const keptBy = useMemo(() => {
    const byId = new Map<string, { fetchedAt: number; count: number }>();
    // Open Library keeps a list per category — `openlibrary:fiction` and a
    // dozen siblings — and to the board they are one source with one total.
    for (const row of kept) {
      if (row.source === SEEN) continue;
      const base = row.source.split(':')[0];
      const found = byId.get(base);
      byId.set(base, {
        fetchedAt: Math.max(found?.fetchedAt ?? 0, row.fetchedAt),
        count: (found?.count ?? 0) + row.count,
      });
    }
    return byId;
  }, [kept]);

  const held = useMemo(
    () =>
      kept
        .filter((row) => row.source !== SEEN)
        .reduce((total, row) => total + row.count, 0),
    [kept]
  );

  /** Everything a search could reach, each as the one row that says where it stands. */
  const cards = useMemo<SourceCard[]>(() => {
    const made: SourceCard[] = [];
    const dated = (at: number) => new Date(at).toLocaleDateString(i18n.language);

    for (const source of publicSources) {
      if (source.indexed) {
        const state = keptBy.get(source.id);
        const stale = state ? Date.now() - state.fetchedAt > STALE_DAYS * 86400000 : false;
        const locked = Boolean(source.credential) && !emailed;
        const running = updating.includes(source.id);
        made.push({
          id: source.id,
          label: t(`source.${source.id}`),
          detail: locked
            ? t('add.seWhy')
            : state
              ? t('add.indexAsOf', { count: state.count, date: dated(state.fetchedAt) })
              : t('add.indexMissing'),
          value: running
            ? t('add.updating')
            : locked
              ? t('find.setUp')
              : state
                ? t('add.update')
                : t('add.getList'),
          ready: Boolean(state) && !stale && !locked,
          onPress: () =>
            running
              ? undefined
              : locked
                ? setSettingUp(source)
                : update(source.id as CatalogSource),
        });
        continue;
      }
      if (source.remote && source.find) {
        const page = source.find;
        made.push({
          id: source.id,
          label: t(`source.${source.id}`),
          detail: t(`source.${source.id}Detail`),
          value: t('find.onlineOnly'),
          ready: true,
          onPress: () => router.push(page),
        });
      }
    }

    // The one edition that is its own catalog. It has no list to fetch; what
    // it has instead is a key, and without one it answers nothing.
    made.push({
      id: 'esv',
      label: ESV_TITLE,
      detail: t('add.esvWhy'),
      value: keyed ? t('find.ready') : t('find.setUp'),
      ready: keyed,
      onPress: () => router.push('/source/esv'),
    });
    return made;
  }, [keptBy, emailed, keyed, updating, t, i18n.language]);

  const online = useMemo(
    () =>
      publicSources.flatMap((source) =>
        source.remote && source.find ? [{ id: source.id, page: source.find }] : []
      ),
    []
  );

  // Memoised, both of them: `waiting` is a dependency of the result list, and
  // a fresh array every render would rebuild every row on the page on every
  // keystroke.
  const available = useMemo(() => cards.filter((card) => card.ready), [cards]);
  const waiting = useMemo(() => cards.filter((card) => !card.ready), [cards]);

  function update(source: CatalogSource) {
    enqueueCatalogs([source], () => t(`source.${source}`));
    setUpdating((was) => [...was, source]);
  }

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

  const specials = useMemo(() => searchSpecial(query), [query]);

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
  const licensed = useMemo(() => searchLicensed(query), [query]);
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
  useEffect(() => {
    const term = query.trim();
    if (!term) {
      setResults(NO_RESULTS);
      setHits([]);
      return;
    }
    const timer = setTimeout(() => {
      searchLibrary(term).then(setResults).catch(() => setResults(NO_RESULTS));
      searchIndex(term, sources).then(setHits).catch(() => setHits([]));
    }, SETTLE);
    return () => clearTimeout(timer);
  }, [query, sources]);

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
  useEffect(() => {
    const term = query.trim();
    if (term.length < 3) {
      setNamed([]);
      setCatalogs([]);
      return;
    }
    let live = true;
    setAsking(true);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const found = await findBook(term, { googleKey: await googleBooksKey() });
          if (!live) return;
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
          void rememberSeen(found.candidates).catch(() => undefined);
        } catch {
          // Both catalogs unreachable. Keeping that as a report rather than
          // an empty list is the difference between "no such book" and "no
          // signal", and offline they are very different sentences.
          if (live) {
            setNamed([]);
            setCatalogs([
              { source: 'openlibrary', answered: false, found: 0 },
              { source: 'google', answered: false, found: 0 },
            ]);
          }
        } finally {
          if (live) setAsking(false);
        }
      })();
    }, isIsbn(term) ? 0 : REACH);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query]);

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
    if (works.length || fresh.length || asking) {
      // A heading reading "Published books (0)" over nothing, for the second
      // the catalogs take to answer, is a section saying it found none — and
      // then contradicting itself. While there is nothing yet it says what it
      // is doing instead of counting it.
      const none = works.length + fresh.length === 0;
      head(
        'named',
        none && asking ? t('find.lookingUp') : t('find.named', { count: works.length + fresh.length }),
        none && asking ? undefined : asking ? t('find.asking') : refused(catalogs, t)
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
          value: t('find.keepIt'),
          onPress: () => (remembered ? void name(remembered) : take(row)),
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
          value: t('find.keepIt'),
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
    for (const hit of texts) {
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
  }, [shelf, named, asking, catalogs, results, works, texts, specials, licensed, online, waiting, query, t]);

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

/** The rows inside a folded group; the group owns the card around them. */
  function rows(cards: SourceCard[]) {
    return cards.map((card) => (
      <Row
        key={card.id}
        label={card.label}
        detail={card.detail}
        value={card.value}
        onPress={card.onPress}
      />
    ));
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
          contentContainerStyle={{ padding: space.lg, paddingBottom: SEARCH_BAR_HEIGHT + space.xxl }}
          keyboardShouldPersistTaps="handled"
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

          {/* Folded. These are the plumbing behind the box, and most openings
              of this page want nothing to do with them — but the count on the
              row is the answer to "why did my search find nothing", so it is
              said without having to be opened for. */}
          <Section flush>
            <Row
              label={t('find.availableSources')}
              detail={held ? t('find.sourcesHeld', { count: held }) : t('find.sourcesNone')}
              value={`${available.length}  ${opened === 'available' ? '⌃' : '⌄'}`}
              onPress={() => setOpened(opened === 'available' ? null : 'available')}
              last={opened !== 'available' && waiting.length === 0}
            />
            {opened === 'available' ? rows(available) : null}
            {waiting.length ? (
              <>
                <Row
                  label={t('find.toUpdateSources')}
                  detail={t('find.toUpdateWhy')}
                  value={`${waiting.length}  ${opened === 'waiting' ? '⌃' : '⌄'}`}
                  onPress={() => setOpened(opened === 'waiting' ? null : 'waiting')}
                  last={opened !== 'waiting'}
                />
                {opened === 'waiting' ? rows(waiting) : null}
              </>
            ) : null}
          </Section>

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
        bottom={Animated.add(lift, searchBarOffset(insets.bottom))}
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

      {/* A credential is the one thing a source can want that a queued job
          cannot supply, so it is asked for here and nowhere else. */}
      {settingUp ? (
        <Modal visible transparent animationType="fade" onRequestClose={() => setSettingUp(null)}>
          <Pressable
            style={[styles.scrim, { backgroundColor: palette.scrim }]}
            onPress={() => setSettingUp(null)}
          >
            <Pressable
              onPress={(event) => event.stopPropagation()}
              style={[
                styles.sheet,
                {
                  backgroundColor: palette.bg,
                  borderColor: palette.border,
                  paddingBottom: Math.max(insets.bottom, space.md) + space.lg,
                },
              ]}
            >
              <View style={[styles.grabber, { backgroundColor: palette.faint }]} />
              <ScrollView bounces={false} keyboardShouldPersistTaps="handled">
                <SourceRows source={settingUp} onUpdated={readSources} />
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>
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
  scrim: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    maxHeight: '85%',
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: space.sm,
    opacity: 0.5,
  },
});
