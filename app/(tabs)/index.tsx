import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { listBooks, type BookListItem } from '../../src/db/repo';
import { enqueueImport, subscribeToQueue, type ImportJob } from '../../src/import/queue';
import { pickManuscript } from '../../src/import/sources/picker';
import { supportedExtensions } from '../../src/import/registry';
import { Cover } from '../../src/ui/primitives';
import { QueueSheet, QueueStrip } from '../../src/ui/ImportQueue';
import { formatCount } from '../../src/text/counts';
import { space, usePalette } from '../../src/theme';

export default function Shelf() {
  const { t } = useTranslation();
  const palette = usePalette();
  const { width } = useWindowDimensions();
  const [books, setBooks] = useState<BookListItem[] | null>(null);
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [queueOpen, setQueueOpen] = useState(false);

  const refresh = useCallback(() => {
    listBooks().then(setBooks).catch(() => setBooks([]));
  }, []);

  useFocusEffect(refresh);

  // A finished import is the only thing that changes the shelf while it is open.
  useEffect(() => subscribeToQueue((next) => {
    setJobs((previous) => {
      const finished = next.filter((job) => job.status === 'done').length;
      if (finished !== previous.filter((job) => job.status === 'done').length) refresh();
      return next;
    });
  }), [refresh]);

  async function addBook() {
    const picked = await pickManuscript();
    if (picked) enqueueImport(picked);
  }

  const columns = Math.max(2, Math.floor((width - space.lg) / 130));
  const coverWidth = Math.floor((width - space.lg * 2 - space.md * (columns - 1)) / columns);
  const reading = books?.filter((book) => (book.offset ?? 0) > 0) ?? [];
  const rest = books?.filter((book) => !(book.offset ?? 0)) ?? [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.bg }} edges={['top']}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: palette.text }]}>{t('shelf.title')}</Text>
        <Pressable onPress={addBook} hitSlop={12} accessibilityLabel={t('shelf.add')}>
          <Text style={{ color: palette.accent, fontSize: 30, lineHeight: 34 }}>⊕</Text>
        </Pressable>
      </View>

      <QueueStrip jobs={jobs} onPress={() => setQueueOpen(true)} />

      {books === null ? (
        <View style={styles.centre}><ActivityIndicator /></View>
      ) : books.length === 0 ? (
        <View style={styles.centre}>
          <Text style={{ color: palette.text, fontSize: 17 }}>{t('shelf.empty')}</Text>
          <Text style={{ color: palette.dim, marginTop: space.sm, textAlign: 'center' }}>
            {t('shelf.emptyHint')}
          </Text>
          <Text style={{ color: palette.faint, marginTop: space.xs, fontSize: 12 }}>
            {supportedExtensions.map((extension) => `.${extension}`).join('  ')}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl }}>
          {reading.length > 0 && (
            <Group title={t('shelf.sectionReading')} books={reading} width={coverWidth} />
          )}
          {rest.length > 0 && (
            <Group
              title={reading.length ? t('shelf.sectionLibrary') : undefined}
              books={rest}
              width={coverWidth}
            />
          )}
        </ScrollView>
      )}

      <QueueSheet jobs={jobs} visible={queueOpen} onClose={() => setQueueOpen(false)} />
    </SafeAreaView>
  );
}

function Group({ title, books, width }: { title?: string; books: BookListItem[]; width: number }) {
  const palette = usePalette();
  return (
    <View style={{ marginBottom: space.xl }}>
      {title && <Text style={[styles.groupTitle, { color: palette.text }]}>{title}</Text>}
      <View style={styles.grid}>
        {books.map((book) => (
          <Pressable key={book.id} onPress={() => router.push(`/book/${book.id}`)} style={{ width }}>
            <Cover title={book.title} hue={book.cover_hue} width={width} />
            <Text numberOfLines={2} style={{ color: palette.text, fontSize: 13, marginTop: space.xs }}>
              {book.title}
            </Text>
            <Text style={{ color: palette.dim, fontSize: 12 }}>
              {book.chapter_count > 0
                ? `${formatCount(book.word_count, book.language)} · ${book.chapter_count}`
                : formatCount(book.word_count, book.language)}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.md,
  },
  title: { fontSize: 32, fontWeight: '700' },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  groupTitle: { fontSize: 17, fontWeight: '700', marginBottom: space.md },
});
