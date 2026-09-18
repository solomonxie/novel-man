import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { getBook, listParts, type Book, type Part } from '../../../src/db/repo';
import { kindOf } from '../../../src/books/kinds';
import { Hint, Row, Section } from '../../../src/ui/primitives';
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

  const load = useCallback(() => {
    if (!id) return;
    getBook(id).then(setBook);
    listParts(id).then(setParts);
  }, [id]);

  useFocusEffect(load);

  const unit = kindOf(book?.kind).part ?? 'volume';

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}
    >
      <Stack.Screen options={{ title: t(`book.parts_${unit}`), headerBackTitle: ' ' }} />

      <Section>
        {parts.map((part, index) => (
          <Row
            key={part.idx}
            label={part.title}
            detail={t('book.partChapters', { count: part.chapters })}
            value="›"
            // Straight into reading it: a part is a place in the book, not a
            // folder to open and then choose again.
            onPress={() => router.push(`/reader/${id}?at=${part.start}`)}
            last={index === parts.length - 1}
          />
        ))}
      </Section>
      <Hint>{t('book.partsHint')}</Hint>
      <View style={styles.spacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({ spacer: { height: space.xl } });
