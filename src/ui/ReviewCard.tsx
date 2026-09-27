import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Book } from '../db/repo';
import { Stars } from './Stars';
import { radius, space, usePalette } from '../theme';

/** Enough of a review to know which one it is; the book's page holds all of it. */
const LINES = 4;

/**
 * What the reader wrote about a book, as a thing to read rather than a row to
 * scan. So the review leads and the book is the line above it — the title is
 * how you find a book, but a shelf of your own reviews is read for the writing.
 */
export function ReviewCard({ book, onPress, lines = LINES }: {
  book: Pick<Book, 'id' | 'title' | 'author' | 'review' | 'stars' | 'rated_at'>;
  onPress: () => void;
  lines?: number;
}) {
  const palette = usePalette();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: palette.surface, borderColor: palette.border, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <View style={styles.head}>
        <Text numberOfLines={1} style={{ color: palette.text, fontSize: 15, flex: 1 }}>
          {book.title}
        </Text>
        {book.stars ? <Stars value={book.stars} size={13} /> : null}
      </View>
      {book.author ? (
        <Text numberOfLines={1} style={{ color: palette.faint, fontSize: 12 }}>
          {book.author}
        </Text>
      ) : null}
      <Text numberOfLines={lines} style={{ color: palette.dim, fontSize: 14, lineHeight: 20, marginTop: space.xs }}>
        {book.review?.trim()}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
