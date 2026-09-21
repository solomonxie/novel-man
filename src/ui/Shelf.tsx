import { FlatList, Text, useWindowDimensions, View } from 'react-native';

import { BookTile } from './BookTile';
import type { BookListItem } from '../db/repo';
import { space, usePalette } from '../theme';

/** Three across, the same three the shelf on the home page shows. */
const PER_ROW = 3;

/**
 * Any set of books that is not the whole library: a list, or a tag. It
 * virtualises for the same reason the shelf does — nothing here has a ceiling,
 * and a tag somebody puts on half their library is a real one.
 */
export function Shelf({ books, empty }: { books: BookListItem[]; empty: string }) {
  const palette = usePalette();
  const { width } = useWindowDimensions();
  const tile = Math.floor((width - space.lg * 2 - space.md * (PER_ROW - 1)) / PER_ROW);

  if (!books.length) {
    return (
      <View style={{ padding: space.lg }}>
        <Text style={{ color: palette.dim, fontSize: 15 }}>{empty}</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={books}
      numColumns={PER_ROW}
      keyExtractor={(book) => book.id}
      renderItem={({ item }) => <BookTile book={item} width={tile} />}
      columnWrapperStyle={{ gap: space.md, paddingHorizontal: space.lg }}
      contentContainerStyle={{ gap: space.lg, paddingVertical: space.lg }}
    />
  );
}
