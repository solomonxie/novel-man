import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { getBook, listParts, type Book, type Part } from '../../../src/db/repo';
import { kindOf } from '../../../src/books/kinds';
import { Hint, Row, Search, SEARCHABLE_FROM, Section } from '../../../src/ui/primitives';
import { space, usePalette } from '../../../src/theme';

/**
 * The level above the chapter, for the books that have one — a bible's 66, a
 * novel's 卷. It exists so that a book of 1,189 chapters opens at Genesis
 * rather than at a list nobody can read.
 */
export default function PartsPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const palette = usePalette();
  const [book, setBook] = useState<Book | null>(null);
  const [parts, setParts] = useState<Part[]>([]);
  const [query, setQuery] = useState('');

  const load = useCallback(() => {
    if (!id) return;
    getBook(id).then(setBook);
    listParts(id).then(setParts);
  }, [id]);

  useFocusEffect(load);

  const unit = kindOf(book?.kind).part ?? 'volume';

  // 66 books is past the point where the eye beats the keyboard, and "John"
  // is what someone opening a bible already has in mind.
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return parts;
    return parts.filter((part) => `${part.title} ${part.summary ?? ''}`.toLowerCase().includes(needle));
  }, [parts, query]);

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen options={{ title: t(`book.parts_${unit}`), headerBackTitle: ' ' }} />

      {parts.length >= SEARCHABLE_FROM && (
        <Search value={query} onChange={setQuery} placeholder={t(`book.searchParts_${unit}`)} />
      )}

      <Section>
        {shown.map((part, index) => (
          <Row
            key={part.idx}
            label={part.title}
            // Its own page, not straight into reading: a part is now a thing
            // with a summary, a picture, its notes and its own analysis.
            detail={part.summary?.trim() || t('book.partChapters', { count: part.chapters })}
            value="›"
            onPress={() => router.push(`/book/${id}/part/${part.idx}`)}
            last={index === shown.length - 1}
          />
        ))}
      </Section>
      <Hint>{t('book.partsHint')}</Hint>
      <View style={styles.spacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({ spacer: { height: space.xl } });
