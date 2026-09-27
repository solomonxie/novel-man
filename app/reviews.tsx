import { useCallback, useMemo, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { router, Stack, useFocusEffect } from '../src/navigation/router';
import { useTranslation } from 'react-i18next';

import { listBooks, type BookListItem } from '../src/db/repo';
import { reviewedBooks } from '../src/books/record';
import { ReviewCard } from '../src/ui/ReviewCard';
import { Search } from '../src/ui/primitives';
import { space, usePalette } from '../src/theme';

/** Below this a field is more work than scrolling. */
const SEARCHABLE_FROM = 8;

/**
 * Everything the reader has written about a book, in one place.
 *
 * It virtualises because this is the list with no ceiling at all — a library
 * brought over from Goodreads arrives with every review that reader ever wrote,
 * which can be hundreds. The search reads the writing as well as the title:
 * what somebody remembers about a review is a phrase in it.
 */
export default function Reviews() {
  const { t } = useTranslation();
  const palette = usePalette();
  const [books, setBooks] = useState<BookListItem[]>([]);
  const [query, setQuery] = useState('');

  const load = useCallback(() => {
    listBooks().then(setBooks);
  }, []);

  useFocusEffect(load);

  const reviewed = useMemo(() => reviewedBooks(books), [books]);

  const typed = query.trim().toLowerCase();
  const shown = typed
    ? reviewed.filter(
        (book) =>
          book.title.toLowerCase().includes(typed) ||
          (book.author ?? '').toLowerCase().includes(typed) ||
          (book.review ?? '').toLowerCase().includes(typed)
      )
    : reviewed;

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <Stack.Screen options={{ title: t('reviews.title'), headerBackTitle: ' ' }} />
      <FlatList
        data={shown}
        keyExtractor={(book) => book.id}
        contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2, gap: space.sm }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          reviewed.length > SEARCHABLE_FROM ? (
            <View style={{ marginBottom: space.sm }}>
              <Search value={query} onChange={setQuery} placeholder={t('reviews.search')} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          <Text style={{ color: palette.dim, fontSize: 15 }}>
            {reviewed.length ? t('shelf.noMatches') : t('reviews.none')}
          </Text>
        }
        renderItem={({ item }) => (
          <ReviewCard
            book={item}
            lines={8}
            onPress={() => router.push(`/book/${item.id}`)}
          />
        )}
      />
    </View>
  );
}
