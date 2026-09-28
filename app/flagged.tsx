import { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useFocusEffect } from '../src/navigation/router';
import { useTranslation } from 'react-i18next';

import { listBooks, type BookListItem } from '../src/db/repo';
import { fixFor, flaggedGroups, missingDetails, type FlagId } from '../src/books/flags';
import { BookLine } from '../src/ui/BookLine';
import { radius, space, usePalette } from '../src/theme';

/**
 * Everything on the shelf that is not quite finished, grouped by what is
 * wrong with it. A to-do list for a library rather than for a book.
 *
 * Grouped by problem and not by book, because that is how the work is
 * actually done: eleven books with no cover is one sitting at the catalog,
 * not eleven visits to eleven pages. A book with two problems appears twice,
 * which is right — it is on two errands.
 *
 * One flat list rather than a scroll of sections: a shelf has no ceiling, and
 * a library brought over from Goodreads arrives with hundreds of records that
 * have a title and nothing else.
 */

type Line =
  | { key: string; kind: 'head'; flag: FlagId; count: number }
  | { key: string; kind: 'book'; flag: FlagId; book: BookListItem; last: boolean };

export default function Flagged() {
  const { t } = useTranslation();
  const palette = usePalette();
  const [books, setBooks] = useState<BookListItem[] | null>(null);

  const load = useCallback(() => {
    listBooks().then(setBooks).catch(() => setBooks([]));
  }, []);

  // Re-read on the way back: the row that was just tapped is usually the one
  // that got fixed, and a list still claiming it is broken is a list nobody
  // trusts twice.
  useFocusEffect(load);

  const lines = useMemo<Line[]>(() => {
    const flat: Line[] = [];
    for (const group of flaggedGroups(books ?? [])) {
      flat.push({ key: `head-${group.flag}`, kind: 'head', flag: group.flag, count: group.books.length });
      group.books.forEach((book, index) => {
        flat.push({
          key: `${group.flag}-${book.id}`,
          kind: 'book',
          flag: group.flag,
          book,
          last: index === group.books.length - 1,
        });
      });
    }
    return flat;
  }, [books]);

  /** What this book's problem is, in its own terms — a count, or which fields. */
  function noteOn(flag: FlagId, book: BookListItem): string {
    if (flag === 'details') {
      return missingDetails(book)
        .map((field) => t(`flags.missing_${field}`))
        .join(' · ');
    }
    if (flag === 'toc' || flag === 'oneChapter') {
      return t('flags.words', { count: book.word_count });
    }
    return book.author ?? t('flags.missing_author');
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <Stack.Screen options={{ title: t('flags.title'), headerBackTitle: ' ' }} />
      <FlatList
        data={lines}
        keyExtractor={(line) => line.key}
        contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}
        ListEmptyComponent={
          books === null ? null : (
            <View>
              <Text style={{ color: palette.text, fontSize: 16 }}>{t('flags.none')}</Text>
              <Text style={{ color: palette.dim, fontSize: 14, marginTop: space.xs, lineHeight: 20 }}>
                {t('flags.allWell')}
              </Text>
            </View>
          )
        }
        renderItem={({ item }) =>
          item.kind === 'head' ? (
            <View style={styles.head}>
              <View style={styles.headLine}>
                <Text style={[styles.title, { color: palette.text }]}>
                  {t(`flags.${item.flag}`)}
                </Text>
                <Text style={{ color: palette.faint, fontSize: 15 }}>{String(item.count)}</Text>
              </View>
              <Text style={{ color: palette.dim, fontSize: 13, lineHeight: 19, marginTop: 2 }}>
                {t(`flags.${item.flag}Why`)}
              </Text>
            </View>
          ) : (
            <View
              style={[
                styles.card,
                { backgroundColor: palette.surface, borderColor: palette.border },
                item.last && { marginBottom: space.xs },
              ]}
            >
              <BookLine
                book={item.book}
                note={noteOn(item.flag, item.book)}
                alarm={item.flag === 'details'}
                last
                onPress={() => router.push(fixFor(item.flag, item.book.id))}
              />
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  head: { marginTop: space.xl, marginBottom: space.sm, paddingHorizontal: space.xs },
  headLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  title: { fontSize: 17, fontWeight: '600' },
  /**
   * A card per row rather than one card per group: the group is a heading and
   * a run of rows, and wrapping the run means measuring it, which is the one
   * thing a virtualised list cannot do.
   */
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    overflow: 'hidden',
    marginBottom: space.xs,
  },
});
