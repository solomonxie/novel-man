import { Pressable, StyleSheet, Text } from 'react-native';
import { router } from '../navigation/router';
import { cardSource, listOf, type CardLine } from '../db/topics';
import { space, usePalette } from '../theme';

/** A card's front, then where it is filed: its topics and the book it came from. */
export function CardRow({ card }: { card: CardLine }) {
  const palette = usePalette();
  const filed = [card.topics, cardSource(card), ...listOf(card.tags).map((tag) => `#${tag}`)]
    .filter(Boolean)
    .join(' · ');
  const marked = [card.favorite ? '★' : '', card.verdict === 'known' ? '✓' : card.verdict === 'later' ? '↺' : '']
    .filter(Boolean)
    .join(' ');
  return (
    <Pressable
      onPress={() => router.push(`/card/${card.id}`)}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: palette.surface, borderColor: palette.border, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      {filed ? (
        <Text numberOfLines={1} style={{ color: palette.faint, fontSize: 12 }}>
          {filed}
        </Text>
      ) : null}
      <Text numberOfLines={2} style={{ color: palette.text, fontSize: 16, marginTop: filed ? 2 : 0 }}>
        {marked ? <Text style={{ color: palette.accent }}>{marked}  </Text> : null}
        {card.name}
      </Text>
      {card.summary?.trim() ? (
        <Text numberOfLines={2} style={{ color: palette.dim, fontSize: 13, marginTop: 2 }}>
          {card.summary.trim()}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    padding: space.lg,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: space.sm,
  },
});
