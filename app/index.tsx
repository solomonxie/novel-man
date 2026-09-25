import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from '../src/navigation/router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import { listBooks, type BookListItem } from '../src/db/repo';
import { bookKinds, kindOf } from '../src/books/kinds';
import { enqueueImport, subscribeToQueue, type ImportJob } from '../src/import/queue';
import { supportedExtensions } from '../src/import/registry';
import { Row, Section } from '../src/ui/primitives';
import { BookTile } from '../src/ui/BookTile';
import { hueFrom } from '../src/ui/fields';
import { Chip, ChipRow } from '../src/ui/detail';
import { coversByList, listBookLists, listTags, type BookList, type Face } from '../src/db/shelves';
import { ListAlbum } from '../src/ui/ListAlbum';
import { AiKeysSettings } from '../src/settings/AiKeys';
import { BackupSettings } from '../src/settings/Backup';
import { CloudSettings } from '../src/settings/Cloud';
import { setUiLanguage, SUPPORTED, type UiLanguage } from '../src/i18n';
import { QueueSheet, QueueStrip } from '../src/ui/ImportQueue';
import { PickerSheet } from '../src/ui/PickerSheet';
import { AddFlow } from '../src/ui/AddFlow';
import { openWorkQueue, useWorkFeed } from '../src/ui/WorkQueue';
import { resumeWorkOnLaunch } from '../src/work/queue';
import { useWorkRefresh } from '../src/work/refresh';
import {
  NO_RESULTS,
  rankBook,
  searchLibrary,
  type LibraryResults,
  type MetaHit,
} from '../src/search/library';
import { backUpIfAuto, restoreOnLaunch } from '../src/backup/icloud';
import { subscribeToRestores } from '../src/backup/changes';
import { syncOnLaunch } from '../src/cloud/sync';
import { radius, space, usePalette } from '../src/theme';
import { appearances, setAppearance, useAppearance, type Appearance } from '../src/theme/appearance';

/** Three across and a sliver of a fourth — the sliver is what says it scrolls. */
const PER_SCREEN = 3.2;
const LANGUAGE_LABELS: Record<UiLanguage, string> = { en: 'English', 'zh-Hans': '简体中文' };

export default function Home() {
  const { t, i18n } = useTranslation();
  const palette = usePalette();
  const appearance = useAppearance();
  const { width, height } = useWindowDimensions();
  const [books, setBooks] = useState<BookListItem[] | null>(null);
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [queueOpen, setQueueOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [languageOpen, setLanguageOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  /** The way in: the whole of adding a book, unfolded on this page. */
  const [addOpen, setAddOpen] = useState(false);
  const scroller = useRef<ScrollView>(null);
  /** 0 is a ＋, 1 is an ✕; everything between is the turn from one to the other. */
  const addTurn = useRef(new Animated.Value(0)).current;
  /** Where the button sits in the page, so the menu it opens can be shown whole. */
  const addY = useRef(0);

  /**
   * A menu that unfolds below the fold is a menu with an invisible bottom, so
   * opening it — and every level after — brings the whole of it into view. Not
   * flush to the top: a card jammed against the status bar reads as a new
   * screen that has replaced the shelf, and the shelf is still there.
   */
  const HEADROOM = Math.round(height * 0.12);
  const showAdd = useCallback(() => {
    requestAnimationFrame(() =>
      scroller.current?.scrollTo({ y: Math.max(0, addY.current - HEADROOM), animated: true })
    );
  }, [HEADROOM]);
  const [results, setResults] = useState<LibraryResults>(NO_RESULTS);
  /** The two ways the shelf is grouped without moving anything. */
  const [lists, setLists] = useState<BookList[]>([]);
  const [tags, setTags] = useState<{ tag: string; books: number }[]>([]);
  const [faces, setFaces] = useState<Map<string, Face[]>>(new Map());
  /** A shelf that cannot be read is not an empty shelf, and must not say it is. */
  const [broken, setBroken] = useState<string | null>(null);
  const work = useWorkFeed();

  const refresh = useCallback(() => {
    listBooks()
      .then((found) => {
        setBooks(found);
        setBroken(null);
      })
      .catch((problem) => {
        setBooks([]);
        setBroken(String(problem));
      });
    listBookLists().then(setLists).catch(() => undefined);
    coversByList().then(setFaces).catch(() => undefined);
    listTags().then(setTags).catch(() => undefined);
  }, []);

  useFocusEffect(refresh);

  useEffect(() => {
    void (async () => {
      // Pull back before pushing up. Backing an empty shelf over a good
      // backup is exactly how a reinstall would lose what it came for.
      const restored = await restoreOnLaunch().catch(() => null);
      if (restored) refresh();
      await backUpIfAuto().catch(() => undefined);
    })();
    syncOnLaunch().catch(() => undefined);
    resumeWorkOnLaunch().catch(() => undefined);
  }, [refresh]);

  // A finished task usually changed something on the shelf.
  useWorkRefresh(refresh);

  // Settings are sections of this page, so a restore done there never costs
  // the shelf its focus — it has to be told.
  useEffect(() => subscribeToRestores(refresh), [refresh]);

  useEffect(() => {
    Animated.timing(addTurn, {
      toValue: addOpen ? 1 : 0,
      duration: 160,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [addOpen, addTurn]);

  useEffect(() => subscribeToQueue((next) => {
    setJobs((previous) => {
      const done = next.filter((job) => job.status === 'done').length;
      if (done !== previous.filter((job) => job.status === 'done').length) refresh();
      return next;
    });
  }), [refresh]);

  // The shelf is in memory, so it answers the keystroke itself — and in the
  // order asked for: the book named, then the one by that author.
  const library = useMemo(() => {
    const all = books ?? [];
    if (!query.trim()) return all;
    const ranked: Array<{ book: BookListItem; rank: number }> = [];
    for (const book of all) {
      const rank = rankBook(book, query);
      if (rank !== null) ranked.push({ book, rank });
    }
    return ranked.sort((a, b) => a.rank - b.rank).map((entry) => entry.book);
  }, [books, query]);

  // One shelf per kind, in the order the kinds are declared — a shelf appears
  // the moment a book of that kind does, and never before.
  const shelves = useMemo(() => {
    const byKind = new Map<string, BookListItem[]>();
    for (const book of library) {
      const id = kindOf(book.kind).id;
      const found = byKind.get(id);
      if (found) found.push(book);
      else byKind.set(id, [book]);
    }
    return bookKinds
      .filter((kind) => byKind.has(kind.id))
      .map((kind) => ({ kind, books: byKind.get(kind.id) as BookListItem[] }));
  }, [library]);

  // Everything else is a query per keystroke, so it waits for a pause.
  useEffect(() => {
    if (!query.trim()) {
      setResults(NO_RESULTS);
      return;
    }
    const timer = setTimeout(() => {
      searchLibrary(query).then(setResults).catch(() => setResults(NO_RESULTS));
    }, 220);
    return () => clearTimeout(timer);
  }, [query]);

  const chapters = useMemo(
    () => results.meta.filter((hit) => hit.kind === 'chapter').map(toRow),
    [results]
  );
  const cast = useMemo(
    () => results.meta.filter((hit) => hit.kind === 'character' || hit.kind === 'place').map(toRow),
    [results]
  );
  const notes = useMemo(
    () => results.meta.filter((hit) => hit.kind === 'note').map(toRow),
    [results]
  );
  const passages = useMemo(
    () => results.text.map((hit) => ({
      key: `${hit.bookId}-${hit.offset}`,
      context: hit.title,
      label: hit.excerpt,
      onPress: () => router.push(`/reader/${hit.bookId}?at=${hit.offset}`),
    })),
    [results]
  );

  const tileWidth = Math.floor((width - space.lg * 2 - space.md * 2) / PER_SCREEN);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.bg }} edges={['top']}>
      <ScrollView
        ref={scroller}
        contentContainerStyle={{ paddingBottom: space.xxl * 2 }}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        {/* The page says what it is before it asks anything. A search field as
            the first thing on screen reads as a tool; a shelf should read as a
            place you keep something. */}
        <View style={styles.masthead}>
          <Text style={[styles.appName, { color: palette.text }]}>{t('app.name')}</Text>
          {books !== null ? (
            <Text style={{ color: palette.dim, fontSize: 14, marginTop: 2 }}>
              {t('shelf.count', { count: library.length })}
            </Text>
          ) : null}
        </View>

        <View style={[styles.search, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Text style={{ color: palette.faint, fontSize: 15 }}>🔍</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('shelf.search')}
            placeholderTextColor={palette.faint}
            style={{ flex: 1, color: palette.text, fontSize: 16 }}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Text style={{ color: palette.faint, fontSize: 16 }}>✕</Text>
            </Pressable>
          )}
        </View>

        <QueueStrip jobs={jobs} onPress={() => setQueueOpen(true)} />

        {books === null ? (
          <View style={styles.center}><ActivityIndicator /></View>
        ) : (
          <>
            <View style={{ marginTop: space.lg }}>
              {broken ? (
                // Books are not lost when the database will not open, and the
                // difference is the whole distance between a bad morning and a
                // calm one.
                <View style={{ paddingHorizontal: space.lg }}>
                  <Text style={{ color: palette.danger, fontSize: 16 }}>{t('shelf.unreadable')}</Text>
                  <Text style={{ color: palette.dim, marginTop: space.xs, fontSize: 13 }}>
                    {broken}
                  </Text>
                </View>
              ) : books.length === 0 ? (
                <View style={{ paddingHorizontal: space.lg }}>
                  <Text style={{ color: palette.text, fontSize: 16 }}>{t('shelf.empty')}</Text>
                  <Text style={{ color: palette.dim, marginTop: space.xs }}>{t('shelf.emptyHint')}</Text>
                  <Text style={{ color: palette.faint, marginTop: space.xs, fontSize: 12 }}>
                    {supportedExtensions.map((extension) => `.${extension}`).join('  ')}
                  </Text>
                </View>
              ) : library.length === 0 ? (
                <Text style={{ color: palette.dim, paddingHorizontal: space.lg }}>
                  {t('shelf.noMatches')}
                </Text>
              ) : (
                /* A shelf per kind of book, and a kind nobody owns has no
                   shelf. What the reader keeps is a few novels and a bible,
                   not "the library" — so the page is the answer to "what do I
                   have", grouped the way the app already thinks of a book.
                   Each runs off the edge and virtualises, because any one of
                   them can grow without a ceiling. */
                shelves.map(({ kind, books: shelf }, index) => (
                  <View key={kind.id} style={index > 0 ? { marginTop: space.xl } : undefined}>
                    <View style={styles.shelfHead}>
                      <Text style={[styles.shelfTitle, { color: palette.dim }]}>
                        {t(`kind.${kind.id}Plural`)}
                      </Text>
                      <Text style={{ color: palette.faint, fontSize: 12 }}>{shelf.length}</Text>
                    </View>
                    <FlatList
                      horizontal
                      data={shelf}
                      keyExtractor={(book) => book.id}
                      renderItem={({ item }) => <BookTile book={item} width={tileWidth} />}
                      showsHorizontalScrollIndicator={false}
                      keyboardShouldPersistTaps="handled"
                      contentContainerStyle={styles.shelfRow}
                    />
                  </View>
                ))
              )}
            </View>

            {/* What the reader grouped for themselves, under the shelf that
                holds everything. Lists are chosen and tags are said, so both
                are read sideways like the shelf is — and both step aside
                while searching, when the page is about hits. */}
            {!query.trim() ? (
              <View style={{ marginTop: space.xl }}>
                <View style={styles.shelfHead}>
                  <Text style={[styles.shelfTitle, { color: palette.dim }]}>
                    {t('shelf.sectionLists')}
                  </Text>
                </View>
                {/* Read sideways like the shelf above it, and drawn like a
                    record sleeve: a list is recognised by what is in it. */}
                <FlatList
                  horizontal
                  data={lists}
                  keyExtractor={(list) => list.id}
                  renderItem={({ item }) => (
                    <ListAlbum
                      name={item.system ? t('lists.favorites') : item.name}
                      detail={t('lists.count', { count: item.books })}
                      faces={faces.get(item.id) ?? []}
                      glyph={item.system ? '♥' : undefined}
                      width={tileWidth}
                      onPress={() => router.push(`/list/${item.id}`)}
                    />
                  )}
                  showsHorizontalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={styles.shelfRow}
                />
              </View>
            ) : null}

            {!query.trim() && tags.length > 0 ? (
              <View style={{ marginTop: space.xl }}>
                <View style={styles.shelfHead}>
                  <Text style={[styles.shelfTitle, { color: palette.dim }]}>
                    {t('shelf.sectionTags')}
                  </Text>
                </View>
                <ChipRow>
                  {tags.map((entry) => (
                    <Chip
                      key={entry.tag}
                      label={entry.tag}
                      detail={t('lists.count', { count: entry.books })}
                      hue={hueFrom(entry.tag)}
                      onPress={() => router.push(`/tag/${encodeURIComponent(entry.tag)}`)}
                    />
                  ))}
                </ChipRow>
              </View>
            ) : null}

            {/* The way in. A ＋ in the corner of a section header is a 26px
                glyph for the second thing anybody does with this app — so the
                button says what it does, and unfolds the one question that has
                to be answered before the page it opens can be any use.
                Out of the way while searching: the page is about hits then. */}
            {!query.trim() ? (
              <View
                onLayout={(event) => {
                  addY.current = event.nativeEvent.layout.y;
                }}
                style={{ paddingHorizontal: space.lg, marginTop: space.xl }}
              >
                <Pressable
                  onPress={() => {
                    setAddOpen((was) => !was);
                    if (!addOpen) showAdd();
                  }}
                  style={({ pressed }) => [
                    styles.add,
                    { backgroundColor: palette.accent, opacity: pressed ? 0.85 : 1 },
                  ]}
                >
                  {/* The ＋ is the state as well as the invitation: it turns
                      a corner into an ✕ when the panel is open. A chevron
                      beside it was a second glyph saying the same thing, and
                      saying it in the typeface's ugliest character. */}
                  <Animated.Text
                    style={{
                      color: palette.onAccent,
                      fontSize: 20,
                      transform: [
                        { rotate: addTurn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] }) },
                      ],
                    }}
                  >
                    ＋
                  </Animated.Text>
                  <Text style={{ color: palette.onAccent, fontSize: 17, fontWeight: '600' }}>
                    {t('shelf.addBook')}
                  </Text>
                </Pressable>
                {addOpen ? (
                  <View
                    style={[
                      styles.addPanel,
                      { backgroundColor: palette.surface, borderColor: palette.border },
                    ]}
                  >
                    {/* The whole flow, here. A book is added without ever
                        leaving the shelf unless a catalog has to be searched. */}
                    <AddFlow onStep={showAdd} onDone={() => setAddOpen(false)} />
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* What the query found that isn't a book, in the order someone
                means it: the chapter, then the person or place, then the
                sentence it is all made of. */}
            <Results title={t('shelf.inChapters', { count: chapters.length })} rows={chapters} />
            <Results title={t('shelf.inCast', { count: cast.length })} rows={cast} />
            <Results title={t('shelf.inNotes', { count: notes.length })} rows={notes} />
            <Results title={t('shelf.inTheText', { count: passages.length })} rows={passages} />

            {/* Settings are sections of this page, not destinations behind it.
                A page whose only job is holding four rows gets deleted. */}
            <View style={{ paddingHorizontal: space.lg }}>
              <Text style={[styles.shelfTitle, { color: palette.dim, marginTop: space.xxl }]}>
                {t('settings.title')}
              </Text>

              <Section title={t('settings.general')}>
                {/* Work is started from a book's own pages and then watched
                    from wherever you are — so it needs a door that is always
                    in the same place, not only a strip that appears mid-run.
                    It leads the section because it is the only row that is ever
                    doing something: language and appearance are set once. */}
                <Row
                  label={t('work.open')}
                  value={
                    work.counts.pending + work.counts.running > 0
                      ? t('work.busy', { count: work.counts.pending + work.counts.running })
                      : t('work.idle')
                  }
                  onPress={openWorkQueue}
                />
                <Row
                  label={t('settings.language')}
                  value={LANGUAGE_LABELS[i18n.language as UiLanguage] ?? 'English'}
                  onPress={() => setLanguageOpen(true)}
                />
                <Row
                  label={t('settings.appearance')}
                  value={t(`settings.appearance_${appearance}`)}
                  onPress={() => setAppearanceOpen(true)}
                  last
                />
              </Section>

              <AiKeysSettings />
              <CloudSettings />
              <BackupSettings onRemoved={refresh} />
            </View>
          </>
        )}
      </ScrollView>

      <QueueSheet jobs={jobs} visible={queueOpen} onClose={() => setQueueOpen(false)} />

      <PickerSheet
        visible={languageOpen}
        title={t('settings.language')}
        options={SUPPORTED.map((code) => ({ id: code, label: LANGUAGE_LABELS[code] }))}
        selectedId={i18n.language}
        onPick={(code) => {
          setUiLanguage(code as UiLanguage);
          setLanguageOpen(false);
        }}
        onClose={() => setLanguageOpen(false)}
      />

      <PickerSheet
        visible={appearanceOpen}
        title={t('settings.appearance')}
        options={appearances.map((option) => ({
          id: option,
          label: t(`settings.appearance_${option}`),
          detail: option === 'system' ? t('settings.appearanceSystemHint') : undefined,
        }))}
        selectedId={appearance}
        onPick={(option) => {
          setAppearance(option as Appearance);
          setAppearanceOpen(false);
        }}
        onClose={() => setAppearanceOpen(false)}
      />
    </SafeAreaView>
  );
}

type ResultRow = {
  key: string;
  /** Where the thing lives — the book, and the part of it if it has one. */
  context: string;
  label: string;
  excerpt?: string;
  onPress: () => void;
};

// A note opens the page it lives on rather than a page of its own: what you
// wrote is read next to everything else you wrote about that book.
const routes: Record<MetaHit['kind'], (hit: MetaHit) => string> = {
  chapter: (hit) => `/chapter/${hit.id}`,
  character: (hit) => `/entity/${hit.id}`,
  place: (hit) => `/place/${hit.id}`,
  note: (hit) => `/book/${hit.bookId}/notes`,
};

function toRow(hit: MetaHit): ResultRow {
  return {
    key: `${hit.kind}-${hit.id}`,
    context: hit.context,
    label: hit.label,
    excerpt: hit.excerpt,
    onPress: () => router.push(routes[hit.kind](hit)),
  };
}

/** `.map` and not a list: the search caps every section before it gets here. */
function Results({ title, rows }: { title: string; rows: ResultRow[] }) {
  const palette = usePalette();
  if (rows.length === 0) return null;
  return (
    <View style={{ paddingHorizontal: space.lg, marginTop: space.xl }}>
      <Text style={[styles.shelfTitle, { color: palette.dim, marginBottom: space.sm }]}>{title}</Text>
      {rows.map((row, index) => (
        <Pressable
          key={row.key}
          onPress={row.onPress}
          style={[
            styles.hit,
            { backgroundColor: palette.surface, borderColor: palette.border },
            index > 0 && { marginTop: space.sm },
          ]}
        >
          <Text numberOfLines={1} style={{ color: palette.dim, fontSize: 12 }}>{row.context}</Text>
          <Text numberOfLines={2} style={{ color: palette.text, fontSize: 14, marginTop: 2 }}>
            {row.label}
          </Text>
          {row.excerpt ? (
            <Text numberOfLines={2} style={{ color: palette.dim, fontSize: 12, marginTop: 2 }}>
              {row.excerpt}
            </Text>
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginHorizontal: space.lg,
    marginTop: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  shelfHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    marginBottom: space.md,
  },
  /** Under the masthead, not beside it: sections label a part of the page. */
  shelfTitle: { fontSize: 13, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  masthead: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm },
  appName: { fontSize: 30, fontWeight: '700', letterSpacing: -0.5 },
  shelfRow: { gap: space.md, paddingHorizontal: space.lg, paddingTop: space.md },
  center: { alignItems: 'center', justifyContent: 'center', padding: space.xxl },
  add: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    borderRadius: radius.md,
    paddingVertical: space.md + 2,
  },
  addPanel: {
    marginTop: space.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  hit: {
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
