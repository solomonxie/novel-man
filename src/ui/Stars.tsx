import { Pressable, StyleSheet, Text, View } from 'react-native';
import { STARS, starsOf } from '../books/record';
import { space, usePalette } from '../theme';

const FILLED = '★';
const EMPTY = '☆';

/**
 * A rating, as the thing everybody already knows how to read. Tapping a star
 * sets it; tapping the one already lit clears it, because "I have not rated
 * this" is an answer and a control with no way back to it is a trap.
 *
 * Read-only where there is nothing to set — a shelf tile shows a rating, it
 * does not take one.
 */
export function Stars({ value, size = 22, onSet }: {
  value: number | null;
  size?: number;
  onSet?: (stars: number | null) => void;
}) {
  const palette = usePalette();
  const lit = starsOf(value);
  const stars = Array.from({ length: STARS }, (_, at) => at + 1);

  if (!onSet) {
    return (
      <Text style={{ color: palette.accent, fontSize: size }}>
        {FILLED.repeat(lit)}
        {EMPTY.repeat(STARS - lit)}
      </Text>
    );
  }

  return (
    <View style={styles.row}>
      {stars.map((star) => (
        <Pressable
          key={star}
          onPress={() => onSet(star === lit ? null : star)}
          hitSlop={6}
          accessibilityRole="button"
        >
          <Text style={{ color: star <= lit ? palette.accent : palette.faint, fontSize: size }}>
            {star <= lit ? FILLED : EMPTY}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.xs },
});
