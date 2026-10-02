import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect } from '../src/navigation/router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import { listBooks, type BookListItem } from '../src/db/repo';
import { reviewedBooks, shelfOf, type ReadingStatus } from '../src/books/record';
import { subscribeToQueue, type ImportJob } from '../src/import/queue';
import { supportedExtensions } from '../src/import/registry';
import { Row, Section } from '../src/ui/primitives';
import { BookTile } from '../src/ui/BookTile';
import { ReviewCard } from '../src/ui/ReviewCard';
import { hueFrom } from '../src/ui/fields';
import { Chip, ChipRow } from '../src/ui/detail';
import { listBookLists, listTags, type BookList } from '../src/db/shelves';
import { ListAlbum } from '../src/ui/ListAlbum';
import { QueueSheet, QueueStrip } from '../src/ui/ImportQueue';
import { SearchBar, SEARCH_BAR_HEIGHT, searchBarOffset } from '../src/ui/SearchBar';
import { resumeWorkOnLaunch } from '../src/work/queue';
import { useWorkRefresh } from '../src/work/refresh';
import { restoreOnLaunch } from '../src/backup/icloud';
import { purgeExpiredTrash } from '../src/backup/trash';
import { clearMissingCovers, clearPlaceholderCovers } from '../src/books/covers';
import { relabelLanguages } from '../src/books/save';
import { BackupOffer, RestoreOffer } from '../src/ui/Safekeeping';
import { subscribeToRestores } from '../src/backup/changes';
import { syncOnLaunch } from '../src/cloud/sync';
import { space, usePalette } from '../src/theme';
import { timed, trace } from '../src/dev/trace';

/** Enough to read on the way past; the heading leads to the rest. */
const REVIEWS_SHOWN = 3;

/** The order the shelves are read in, which is not the order they are declared in. */
const SHELVES: ReadingStatus[] = ['reading', 'wishlist', 'read'];

/** Three across and a sliver of a fourth — the sliver is what says it scrolls. */
const PER_SCREEN = 3.2;


export default function Home() {
  const { t } = useTranslation();
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [books, setBooks] = useState<BookListItem[] | null>(null);
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [queueOpen, setQueueOpen] = useState(false);
  /** The two ways the shelf is grouped without moving anything. */
  const [lists, setLists] = useState<BookList[]>([]);
  const [tags, setTags] = useState<{ tag: string; books: number }[]>([]);
  /** A shelf that cannot be read is not an empty shelf, and must not say it is. */
  const [broken, setBroken] = useState<string | null>(null);

  const refresh = useCallback(() => {
    trace('refresh start');
    timed('listBooks', listBooks())
      .then((found) => {
        setBooks(found);
        setBroken(null);
      })
      .catch((problem) => {
        setBooks([]);
        setBroken(String(problem));
      });
    timed('listBookLists', listBookLists()).then(setLists).catch(() => undefined);
    timed('listTags', listTags()).then(setTags).catch(() => undefined);
  }, []);

  useFocusEffect(refresh);

  useEffect(() => {
    // A beat every second: a gap in it is the JS thread blocked, and the
    // lines either side of the gap say by what.
    const beat = setInterval(() => trace('beat'), 1000);
    void (async () => {
      // Pull back before pushing up. Backing an empty shelf over a good
      // backup is exactly how a reinstall would lose what it came for.
      const restored = await timed('restoreOnLaunch', restoreOnLaunch()).catch(() => null);
      if (restored) refresh();
    })();
    timed('syncOnLaunch', syncOnLaunch()).catch(() => undefined);
    timed('resumeWorkOnLaunch', resumeWorkOnLaunch()).catch(() => undefined);
    // Thirty days is a promise kept on the way in, not the next time somebody
    // happens to open the page that lists what is waiting to go.
    purgeExpiredTrash().catch(() => undefined);
    // Once ever, and it says so: a cover quietly taken off a book is a change
    // to the shelf, and the books it happened to are the ones worth looking up
    // again. Silence here would be the app tidying somebody's library behind
    // their back.
    clearPlaceholderCovers()
      .then((cleared) => {
        if (!cleared.length) return;
        refresh();
        Alert.alert(
          t('covers.sweptTitle', { count: cleared.length }),
          t('covers.sweptWhat', { titles: cleared.map((book) => book.title).join('\n') })
        );
      })
      .catch(() => undefined);
    // A cover whose file is gone, said out loud rather than left as a blank
    // rectangle nothing on the shelf can explain. These are the books to look
    // up again — or to point at a backup that still holds their pictures.
    clearMissingCovers()
      .then((lost) => {
        if (!lost.length) return;
        refresh();
        Alert.alert(
          t('covers.lostTitle', { count: lost.length }),
          t('covers.lostWhat', {
            titles: lost.slice(0, 12).map((book) => book.title).join('\n'),
          })
        );
      })
      .catch(() => undefined);
    // The same bargain, for the same reason: a lookup that answered in
    // romanisation marked a Chinese book English, and English is what every
    // pass has been told to answer in since. Changing it silently would be
    // the app deciding what somebody's books are written in behind them.
    relabelLanguages()
      .then((changed) => {
        if (!changed.length) return;
        refresh();
        Alert.alert(
          t('language.fixedTitle', { count: changed.length }),
          t('language.fixedWhat', {
            titles: changed.slice(0, 12).map((book) => book.title).join('\n'),
            more: Math.max(0, changed.length - 12),
          })
        );
      })
      .catch(() => undefined);
    return () => clearInterval(beat);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh]);

  // A finished task usually changed something on the shelf.
  useWorkRefresh(refresh);

  // Settings are sections of this page, so a restore done there never costs
  // the shelf its focus — it has to be told.
  useEffect(() => subscribeToRestores(refresh), [refresh]);

  useEffect(() => subscribeToQueue((next) => {
    setJobs((previous) => {
      const done = next.filter((job) => job.status === 'done').length;
      if (done !== previous.filter((job) => job.status === 'done').length) refresh();
      return next;
    });
  }), [refresh]);

  const library = books ?? [];

  /**
   * One shelf per reading status, in the order somebody reaches for them:
   * what is open now, what is next, what is done.
   *
   * Three shelves and no fourth. A book nobody has said anything about is one
   * they have not read yet, which is what "want to read" means — a bucket
   * named for the absence of an answer explained nothing and held most of the
   * library. Which shelf a book lands on is `shelfOf`.
   */
  const shelves = useMemo(() => {
    const byStatus = new Map<ReadingStatus, BookListItem[]>();
    for (const book of library) {
      const status = shelfOf(book);
      const found = byStatus.get(status);
      if (found) found.push(book);
      else byStatus.set(status, [book]);
    }
    return SHELVES.filter((status) => byStatus.has(status)).map((status) => ({
      status,
      books: byStatus.get(status) as BookListItem[],
    }));
  }, [library]);

  /**
   * The books this reader has written about, newest verdict first. Derived
   * rather than queried: `listBooks` already selects the column, and a second
   * trip for it would be a scan of the whole shelf on every focus.
   */
  const reviews = useMemo(() => reviewedBooks(books ?? []), [books]);

  /**
   * How many books have something missing. Derived, like the reviews above
   * it: `listBooks` already selected every column the rules read, so the
   * number beside the row costs an array walk rather than a query.
   */

  const tileWidth = Math.floor((width - space.lg * 2 - space.md * 2) / PER_SCREEN);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.bg }} edges={['top']}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: SEARCH_BAR_HEIGHT + space.xxl }}
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

        <QueueStrip jobs={jobs} onPress={() => setQueueOpen(true)} />

        {books === null ? (
          <View style={styles.center}><ActivityIndicator /></View>
        ) : (
          <>
            {/* Asked once, and only where there is something to lose. */}
            {books.length > 0 ? <BackupOffer /> : null}

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
                <>
                  {/* An empty shelf on a phone whose iCloud has a library is
                      not an empty shelf. It leads, above the invitation to
                      import a file, because it is the thing that reader came
                      here for. */}
                  <RestoreOffer onRestored={refresh} />
                  <View style={{ paddingHorizontal: space.lg, marginTop: space.lg }}>
                    <Text style={{ color: palette.text, fontSize: 16 }}>{t('shelf.empty')}</Text>
                    <Text style={{ color: palette.dim, marginTop: space.xs }}>{t('shelf.emptyHint')}</Text>
                    <Text style={{ color: palette.faint, marginTop: space.xs, fontSize: 12 }}>
                      {supportedExtensions.map((extension) => `.${extension}`).join('  ')}
                    </Text>
                  </View>
                </>
              ) : (
                /* A shelf per reading status, and a status nobody is in has
                   no shelf. What someone opens this app to do is carry on with
                   what they are reading — so the page answers that first, and
                   the library they are not reading today is below it. Each row
                   runs off the edge and virtualises, because any one of them
                   can grow without a ceiling. */
                shelves.map(({ status, books: shelf }, index) => (
                  <View key={status} style={index > 0 ? { marginTop: space.xl } : undefined}>
                    {/* The heading is the way to the whole shelf, the way it is
                        the way to a full list on a book's page. The count stays
                        the count — quiet, where it always was — and the chevron
                        is what says it leads somewhere. A bright "More" in a row
                        of these labels reads as a different app. */}
                    <SectionHead
                      title={t(`shelf.shelf_${status}`)}
                      count={shelf.length}
                      onOpen={() => router.push(`/status/${status}`)}
                    />
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
                holds everything. Lists are chosen and tags are said, and both
                are read sideways like the shelf is. */}
            <View style={{ marginTop: space.xl }}>
              <SectionHead title={t('shelf.sectionLists')} />
              {/* Read sideways like the shelf above it, and drawn like a
                  record sleeve, with its own made cover. */}
              <FlatList
                horizontal
                data={lists}
                keyExtractor={(list) => list.id}
                renderItem={({ item }) => (
                  <ListAlbum
                    name={item.system ? t('lists.favorites') : item.name}
                    detail={t('lists.count', { count: item.books })}
                    heart={!!item.system}
                    width={tileWidth}
                    onPress={() => router.push(`/list/${item.id}`)}
                  />
                )}
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.shelfRow}
              />
            </View>

            {/* What the reader made of what they read, which is the one thing
                on this page that is theirs rather than the book's. Rows, not a
                sideways shelf: a review is read, not recognised. */}
            {reviews.length > 0 ? (
              <View style={{ marginTop: space.xl }}>
                <SectionHead
                  title={t('shelf.sectionReviews')}
                  count={reviews.length}
                  onOpen={() => router.push('/reviews')}
                />
                <View style={{ paddingHorizontal: space.lg, gap: space.sm }}>
                  {reviews.slice(0, REVIEWS_SHOWN).map((book) => (
                    <ReviewCard
                      key={book.id}
                      book={book}
                      onPress={() => router.push(`/book/${book.id}`)}
                    />
                  ))}
                </View>
              </View>
            ) : null}

            {tags.length > 0 ? (
              <View style={{ marginTop: space.xl }}>
                <SectionHead title={t('shelf.sectionTags')} />
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

            {/* Nothing is left on the shelf but the shelf and the way out of
                it. The utilities went to the settings page with the rest: a
                Goodreads import is something you do once, and it was sitting
                under the books you read every day. */}
            <View style={{ paddingHorizontal: space.lg, marginTop: space.xxl }}>
              {/* The last thing on the page, and the only one that is not
                  about the books. A row rather than a gear in the masthead:
                  settings are opened rarely and deliberately, so they belong
                  at the end of the page you were already scrolling, not in
                  the corner of the one thing you open the app to look at. */}
              <Section>
                <Row
                  label={t('settings.title')}
                  value="›"
                  onPress={() => router.push('/settings')}
                  last
                />
              </Section>
            </View>
          </>
        )}
      </ScrollView>

      {/* The way in to both things somebody opens this app to do, floating
          where the thumb already is — and the same pill the page it opens is
          wearing, so tapping one becomes the other rather than replacing it.
          The shelf carries on underneath it, which is what says there is more
          of it down there. */}
      <SearchBar
        placeholder={t('find.placeholder')}
        bottom={searchBarOffset(insets.bottom)}
        onPress={() => router.push('/find')}
      />

      <QueueSheet jobs={jobs} visible={queueOpen} onClose={() => setQueueOpen(false)} />

    </SafeAreaView>
  );
}

/**
 * The label above a part of this page, and the way into the whole of it where
 * there is more than fits. Every section wore its own arrangement of a title
 * and a count until they were all this.
 */
function SectionHead({ title, count, onOpen }: {
  title: string;
  count?: number;
  onOpen?: () => void;
}) {
  const palette = usePalette();
  return (
    <Pressable onPress={onOpen} disabled={!onOpen} style={styles.shelfHead}>
      <Text style={[styles.shelfTitle, { color: palette.dim }]}>{title}</Text>
      {count === undefined ? null : (
        <Text style={{ color: palette.faint, fontSize: 12 }}>
          {onOpen ? `${count}  ›` : `${count}`}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
});
