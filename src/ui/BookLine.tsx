import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { BookListItem } from '../db/repo';
import { Cover } from './primitives';
import { radius, space, usePalette } from '../theme';

/** Small enough for a list, big enough that the picture is the thing you read. */
const COVER = 34;

/**
 * A book as one line: its cover, its name, and whatever the list it is in has
 * to say about it. `BookTile` is the same book standing on a shelf, which is
 * right for browsing and wrong for a result — a list read top to bottom wants
 * the title on the baseline, not under a picture.
 */
export function BookLine({ book, note, alarm, onPress, last }: {
  book: BookListItem;
  /** What this list is showing it for: a missing cover, a matched phrase. */
  note?: string;
  /** The note is the problem rather than a description of it. */
  alarm?: boolean;
  onPress: () => void;
  last?: boolean;
}) {
  const palette = usePalette();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.line,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: palette.border },
        pressed && { backgroundColor: palette.sunken },
      ]}
    >
      <Cover title={book.title} hue={book.cover_hue} width={COVER} path={book.cover_path} />
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ color: palette.text, fontSize: 16 }}>
          {book.title}
        </Text>
        <Text numberOfLines={1} style={{ color: alarm ? palette.danger : palette.dim, fontSize: 13, marginTop: 2 }}>
          {note ?? book.author ?? ''}
        </Text>
      </View>
      <Text style={{ color: palette.faint, fontSize: 15 }}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm + 2,
    borderRadius: radius.sm,
  },
});
