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

import { listBooks, type BookListItem } from '../src/db/repo';
import { enqueueImport, subscribeToQueue, type ImportJob } from '../src/import/queue';
import { pickManuscript } from '../src/import/sources/picker';
import { supportedExtensions } from '../src/import/registry';
import { Cover, Hint, Row, Section } from '../src/ui/primitives';
import { setUiLanguage, SUPPORTED, type UiLanguage } from '../src/i18n';
import { QueueSheet, QueueStrip } from '../src/ui/ImportQueue';
import { PickerSheet } from '../src/ui/PickerSheet';
import { formatCount } from '../src/text/counts';
import { radius, space, usePalette } from '../src/theme';

const SHELF_COVER = 104;
const LANGUAGE_LABELS: Record<UiLanguage, string> = { en: 'English', 'zh-Hans': '简体中文' };

export default function Home() {
  const { t, i18n } = useTranslation();
  const palette = usePalette();
  const { width } = useWindowDimensions();
  const [books, setBooks] = useState<BookListItem[] | null>(null);
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [queueOpen, setQueueOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);

  const refresh = useCallback(() => {
    listBooks().then(setBooks).catch(() => setBooks([]));
  }, []);

  useFocusEffect(refresh);

  useEffect(() => subscribeToQueue((next) => {
    setJobs((previous) => {
      const done = next.filter((job) => job.status === 'done').length;
      if (done !== previous.filter((job) => job.status === 'done').length) refresh();
      return next;
    });
  }), [refresh]);

  async function addBook() {
    const picked = await pickManuscript();
    if (picked) enqueueImport(picked);
  }

  const matching = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return books ?? [];
    return (books ?? []).filter((book) =>
      `${book.title} ${book.author ?? ''}`.toLowerCase().includes(needle)
    );
  }, [books, query]);

  // Library holds everything; Reading is a shortcut into it, not a slice out
  // of it — a "Library" that hides the book you're reading isn't one.
  const reading = matching.filter((book) => (book.offset ?? 0) > 0);
  const library = matching;
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
          <View style={styles.centre}><ActivityIndicator /></View>
        ) : (
          <>
            {reading.length > 0 && (
              <Shelf title={t('shelf.sectionReading')} books={reading} continueLabel />
            )}

            <Shelf
              title={t('shelf.sectionLibrary')}
              books={expanded ? [] : library}
              action={{ label: '＋', onPress: addBook, big: true }}
              more={
                library.length > 3
                  ? { expanded, onToggle: () => setExpanded((was) => !was) }
                  : undefined
              }
              empty={
                books.length === 0 ? (
                  <View style={{ paddingHorizontal: space.lg, paddingVertical: space.lg }}>
                    <Text style={{ color: palette.text, fontSize: 16 }}>{t('shelf.empty')}</Text>
                    <Text style={{ color: palette.dim, marginTop: space.xs }}>{t('shelf.emptyHint')}</Text>
                    <Text style={{ color: palette.faint, marginTop: space.xs, fontSize: 12 }}>
                      {supportedExtensions.map((extension) => `.${extension}`).join('  ')}
                    </Text>
                  </View>
                ) : undefined
              }
            />

            {expanded && (
              <View style={styles.grid}>
                {library.map((book) => (
                  <BookTile key={book.id} book={book} width={gridWidth} />
                ))}
              </View>
            )}

            <View style={{ paddingHorizontal: space.lg }}>
              <Section title={t('settings.title')}>
                <Row
                  label={t('settings.aiSettings')}
                  value="›"
                  onPress={() => router.push('/settings/ai-keys')}
                />
                <Row
                  label={t('settings.language')}
                  value={LANGUAGE_LABELS[i18n.language as UiLanguage] ?? 'English'}
                  onPress={() => setLanguageOpen(true)}
                />
                <Row label={t('settings.exportBundle')} value={t('settings.notBuilt')} />
                <Row label={t('settings.restoreLatest')} value={t('settings.notBuilt')} last />
              </Section>

              <Section title={t('settings.privateCloud')}>
                <Row label={t('settings.connectBucket')} value={t('settings.notBuilt')} last />
              </Section>
              <Hint>{t('settings.privateCloudHint')}</Hint>
            </View>
          </>
        )}
      </ScrollView>

      <QueueSheet jobs={jobs} visible={queueOpen} onClose={() => setQueueOpen(false)} />

      {/* Picking a value never leaves the page. */}
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
    </SafeAreaView>
  );
}

/** One horizontally scrollable row. A shelf reads across, not down. */
function Shelf({ title, books, action, more, empty, continueLabel }: {
  title: string;
  books: BookListItem[];
  action?: { label: string; onPress: () => void; big?: boolean };
  more?: { expanded: boolean; onToggle: () => void };
  empty?: React.ReactNode;
  continueLabel?: boolean;
}) {
  const { t } = useTranslation();
  const palette = usePalette();
  return (
    <View style={{ marginTop: space.lg }}>
      <View style={styles.shelfHead}>
        <Text style={[styles.shelfTitle, { color: palette.text }]}>{title}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
          {more && (
            <Pressable onPress={more.onToggle} hitSlop={8}>
              <Text style={{ color: palette.accent, fontSize: 15 }}>
                {more.expanded ? t('shelf.less') : t('shelf.more')}
              </Text>
            </Pressable>
          )}
          {action && (
            <Pressable onPress={action.onPress} hitSlop={12}>
              <Text style={{ color: palette.accent, fontSize: action.big ? 26 : 15 }}>
                {action.label}
              </Text>
            </Pressable>
          )}
        </View>
      </View>

      {empty ?? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.md }}
        >
          {books.map((book) => (
            <BookTile key={book.id} book={book} width={SHELF_COVER} showProgress={continueLabel} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function BookTile({ book, width, showProgress }: {
  book: BookListItem;
  width: number;
  showProgress?: boolean;
}) {
  const palette = usePalette();
  return (
    <Pressable onPress={() => router.push(`/book/${book.id}`)} style={{ width }}>
      <Cover title={book.title} hue={book.cover_hue} width={width} path={book.cover_path} />
      <Text numberOfLines={2} style={{ color: palette.text, fontSize: 13, marginTop: space.xs }}>
        {book.title}
      </Text>
      <Text numberOfLines={1} style={{ color: palette.dim, fontSize: 11 }}>
        {showProgress && book.chapter_count > 0
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
  centre: { alignItems: 'center', justifyContent: 'center', padding: space.xxl },
});
