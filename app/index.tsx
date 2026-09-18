import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import { listBooks, type BookListItem } from '../src/db/repo';
import { enqueueImport, subscribeToQueue, type ImportJob } from '../src/import/queue';
import { supportedExtensions } from '../src/import/registry';
import { Cover, Row, Section } from '../src/ui/primitives';
import { AiKeysSettings } from '../src/settings/AiKeys';
import { BackupSettings } from '../src/settings/Backup';
import { CloudSettings } from '../src/settings/Cloud';
import { setUiLanguage, SUPPORTED, type UiLanguage } from '../src/i18n';
import { QueueSheet, QueueStrip } from '../src/ui/ImportQueue';
import { PickerSheet } from '../src/ui/PickerSheet';
import { openWorkQueue, useWorkFeed } from '../src/ui/WorkQueue';
import { resumeWorkOnLaunch } from '../src/work/queue';
import { useWorkRefresh } from '../src/work/refresh';
import { formatCount } from '../src/text/counts';
import { matchesBook, searchContent, type ContentHit } from '../src/search/library';
import { backUpIfAuto, restoreOnLaunch } from '../src/backup/icloud';
import { syncOnLaunch } from '../src/cloud/sync';
import { radius, space, usePalette } from '../src/theme';
import { appearances, setAppearance, useAppearance, type Appearance } from '../src/theme/appearance';

/** Two rows of three. Past that it's a scroll, and a scroll needs asking for. */
const VISIBLE = 6;
const LANGUAGE_LABELS: Record<UiLanguage, string> = { en: 'English', 'zh-Hans': '简体中文' };

export default function Home() {
  const { t, i18n } = useTranslation();
  const palette = usePalette();
  const appearance = useAppearance();
  const { width } = useWindowDimensions();
  const [books, setBooks] = useState<BookListItem[] | null>(null);
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [queueOpen, setQueueOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  /** A picked file waiting on the one question only a person can answer. */
  const [hits, setHits] = useState<ContentHit[]>([]);
  const work = useWorkFeed();

  const refresh = useCallback(() => {
    listBooks().then(setBooks).catch(() => setBooks([]));
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

  useEffect(() => subscribeToQueue((next) => {
    setJobs((previous) => {
      const done = next.filter((job) => job.status === 'done').length;
      if (done !== previous.filter((job) => job.status === 'done').length) refresh();
      return next;
    });
  }), [refresh]);

  const library = useMemo(
    () => (query.trim() ? (books ?? []).filter((book) => matchesBook(book, query)) : books ?? []),
    [books, query]
  );

  // Searching inside the manuscripts costs a query per keystroke, so it waits
  // for a pause. Titles filter instantly; the text catches up.
  useEffect(() => {
    if (query.trim().length < 2) {
      setHits([]);
      return;
    }
    const timer = setTimeout(() => {
      searchContent(query).then(setHits).catch(() => setHits([]));
    }, 220);
    return () => clearTimeout(timer);
  }, [query]);

  const gridWidth = Math.floor((width - space.lg * 2 - space.md * 2) / 3);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.bg }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: space.xxl * 2 }}
        keyboardShouldPersistTaps="handled"
      >
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
            {hits.length > 0 && (
              <View style={{ paddingHorizontal: space.lg, marginTop: space.md }}>
                <Text style={[styles.shelfTitle, { color: palette.text, marginBottom: space.sm }]}>
                  {t('shelf.inTheText', { count: hits.length })}
                </Text>
                {hits.map((hit, index) => (
                  <Pressable
                    key={`${hit.bookId}-${hit.offset}`}
                    onPress={() => router.push(`/reader/${hit.bookId}?at=${hit.offset}`)}
                    style={[
                      styles.hit,
                      { backgroundColor: palette.surface, borderColor: palette.border },
                      index > 0 && { marginTop: space.sm },
                    ]}
                  >
                    <Text numberOfLines={1} style={{ color: palette.dim, fontSize: 12 }}>
                      {hit.title}
                    </Text>
                    <Text numberOfLines={2} style={{ color: palette.text, fontSize: 14, marginTop: 2 }}>
                      {hit.excerpt}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}

            <View style={{ marginTop: space.lg }}>
              <View style={styles.shelfHead}>
                <Text style={[styles.shelfTitle, { color: palette.text }]}>
                  {t('shelf.sectionLibrary')}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
                  {library.length > VISIBLE && (
                    <Pressable onPress={() => setExpanded((was) => !was)} hitSlop={8}>
                      <Text style={{ color: palette.accent, fontSize: 15 }}>
                        {expanded ? t('shelf.less') : t('shelf.more', { count: library.length - VISIBLE })}
                      </Text>
                    </Pressable>
                  )}
                  <Pressable onPress={() => router.push('/add')} hitSlop={12}>
                    <Text style={{ color: palette.accent, fontSize: 26 }}>＋</Text>
                  </Pressable>
                </View>
              </View>

              {books.length === 0 ? (
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
                <View style={styles.grid}>
                  {(expanded ? library : library.slice(0, VISIBLE)).map((book) => (
                    <BookTile key={book.id} book={book} width={gridWidth} />
                  ))}
                </View>
              )}
            </View>

            {/* Settings are sections of this page, not destinations behind it.
                A page whose only job is holding four rows gets deleted. */}
            <View style={{ paddingHorizontal: space.lg }}>
              <Text style={[styles.shelfTitle, { color: palette.text, marginTop: space.xxl }]}>
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
                {/* A passage you can ask for but not own: the one source
                    here that answers questions instead of handing over books. */}
                <Row
                  label={t('lookup.title')}
                  detail={t('lookup.shelfDetail')}
                  value="›"
                  onPress={() => router.push('/lookup')}
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
              <BackupSettings />
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

function BookTile({ book, width }: { book: BookListItem; width: number }) {
  const palette = usePalette();
  // A book you've started says how far in you are; one you haven't says how
  // long it is. Both answer "should I open this now?".
  const started = (book.offset ?? 0) > 0;
  return (
    <Pressable onPress={() => router.push(`/book/${book.id}`)} style={{ width }}>
      <Cover title={book.title} hue={book.cover_hue} width={width} path={book.cover_path} />
      <Text numberOfLines={2} style={{ color: palette.text, fontSize: 13, marginTop: space.xs }}>
        {book.title}
      </Text>
      <Text numberOfLines={1} style={{ color: palette.dim, fontSize: 11 }}>
        {started
          ? `${Math.min(99, Math.round(((book.offset ?? 0) / Math.max(1, book.char_count)) * 100))}%`
          : formatCount(book.word_count, book.language)}
      </Text>
    </Pressable>
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
  shelfTitle: { fontSize: 22, fontWeight: '700' },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.md,
    paddingHorizontal: space.lg,
    marginTop: space.md,
  },
  center: { alignItems: 'center', justifyContent: 'center', padding: space.xxl },
  hit: {
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
});

