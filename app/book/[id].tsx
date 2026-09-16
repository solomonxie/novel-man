import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import {
  deleteBook,
  getBook,
  getProgress,
  listChapters,
  type Book,
  type Chapter,
} from '../../src/db/repo';
import { Cover, PrimaryAction, Row, Section } from '../../src/ui/primitives';
import { countUnits, formatCount, formatDuration, readingMinutes } from '../../src/text/counts';
import { space, usePalette } from '../../src/theme';

const PREVIEW_CHAPTERS = 8;

export default function BookPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const palette = usePalette();
  const [book, setBook] = useState<Book | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [offset, setOffset] = useState(0);
  const [expanded, setExpanded] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      getBook(id).then(setBook);
      listChapters(id).then(setChapters);
      getProgress(id).then(setOffset);
    }, [id])
  );

  if (!book) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.bg }}>
        <ActivityIndicator />
      </View>
    );
  }

  const units = countUnits('', book.language);
  const current = chapters.find((chapter) => offset >= chapter.start && offset < chapter.end);
  const minutes = readingMinutes(book.word_count, book.language);
  const visible = expanded ? chapters : chapters.slice(0, PREVIEW_CHAPTERS);

  function confirmDelete() {
    Alert.alert(t('book.delete'), t('book.deleteConfirm'), [
      { text: t('import.cancel'), style: 'cancel' },
      {
        text: t('book.delete'),
        style: 'destructive',
        onPress: async () => {
          await deleteBook(book!.id);
          router.back();
        },
      },
    ]);
  }

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl }}
    >
      <Stack.Screen options={{ title: book.title, headerBackTitle: ' ' }} />

      <View style={{ flexDirection: 'row', gap: space.lg }}>
        <Cover title={book.title} hue={book.cover_hue} width={96} />
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Text style={{ color: palette.text, fontSize: 22, fontWeight: '700' }}>{book.title}</Text>
          {book.author ? (
            <Text style={{ color: palette.dim, marginTop: 2 }}>{book.author}</Text>
          ) : null}
          <Text style={{ color: palette.dim, fontSize: 13, marginTop: space.sm }}>
            {t('book.stats', {
              words: `${formatCount(book.word_count, book.language)} ${units.unit === 'words' ? 'words' : ''}`.trim(),
              chapters: chapters.length,
              time: formatDuration(minutes),
            })}
          </Text>
          <Text style={{ color: palette.faint, fontSize: 12, marginTop: 2 }}>
            {t('book.importedFrom', { name: book.source_name })}
          </Text>
        </View>
      </View>

      <PrimaryAction
        label={current ? t('book.continue', { chapter: chapterLabel(current, t) }) : t('book.start')}
        onPress={() => router.push(`/reader/${book.id}`)}
        style={{ marginTop: space.xl }}
      />

      {chapters.length === 0 ? (
        <Section title={t('book.chapters')}>
          <Row label={t('book.noChapters')} last />
        </Section>
      ) : (
        <Section title={t('book.chapters')}>
          {visible.map((chapter, index) => (
            <Row
              key={chapter.id}
              label={`${chapter.idx + 1}  ${chapterLabel(chapter, t)}${chapter.confident ? '' : '  ⚠'}`}
              value={formatDuration(
                readingMinutes(Math.round((chapter.end - chapter.start) / 5.5), book.language)
              )}
              onPress={() => router.push(`/reader/${book.id}?chapter=${chapter.idx}`)}
              last={index === visible.length - 1 && chapters.length <= PREVIEW_CHAPTERS}
            />
          ))}
          {chapters.length > PREVIEW_CHAPTERS && !expanded && (
            <Row
              label={t('book.showAll', { count: chapters.length })}
              onPress={() => setExpanded(true)}
              last
            />
          )}
        </Section>
      )}

      <Section title={t('book.cast')}>
        <Row label={t('book.castEmpty')} value={t('book.comingSoon')} last />
      </Section>

      <Section>
        <Row label={t('book.delete')} onPress={confirmDelete} danger last />
      </Section>
    </ScrollView>
  );
}

function chapterLabel(chapter: Chapter, t: TFunction): string {
  return chapter.title.trim() || t('book.chapters');
}
