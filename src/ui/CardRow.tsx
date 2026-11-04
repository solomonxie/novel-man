import { useMemo, useRef } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { router } from '../navigation/router';
import { cardSource, listOf, type CardLine, type Verdict } from '../db/topics';
import { space, usePalette } from '../theme';

const SWIPE = 80;

/**
 * A card's front, then where it is filed: its topics and the book it came from.
 * With `onVerdict`, swiping right marks it understood and left to review later;
 * swiping the same way again clears it.
 */
export function CardRow({
  card,
  onVerdict,
  onDragging,
}: {
  card: CardLine;
  onVerdict?: (verdict: Verdict | null) => void;
  onDragging?: (active: boolean) => void;
}) {
  const { t } = useTranslation();
  const palette = usePalette();
  const x = useRef(new Animated.Value(0)).current;
  const latest = useRef({ card, onVerdict, onDragging });
  latest.current = { card, onVerdict, onDragging };

  const pan = useMemo(() => {
    const release = (dx: number) => {
      latest.current.onDragging?.(false);
      const verdict: Verdict | null = dx > SWIPE ? 'known' : dx < -SWIPE ? 'later' : null;
      if (verdict) {
        const { card: now, onVerdict: decide } = latest.current;
        decide?.(now.verdict === verdict ? null : verdict);
      }
      Animated.spring(x, { toValue: 0, useNativeDriver: false }).start();
    };
    return PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderGrant: () => latest.current.onDragging?.(true),
      onPanResponderMove: Animated.event([null, { dx: x }], { useNativeDriver: false }),
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: (_, g) => release(g.dx),
      onPanResponderTerminate: () => release(0),
    });
  }, [x]);

  const filed = [card.topics, cardSource(card), ...listOf(card.tags).map((tag) => `#${tag}`)]
    .filter(Boolean)
    .join(' · ');
  const marked = [card.favorite ? '★' : '', card.verdict === 'known' ? '✓' : card.verdict === 'later' ? '↺' : '']
    .filter(Boolean)
    .join(' ');

  const row = (
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
  if (!onVerdict) return row;

  const cue = (verdict: Verdict) => (card.verdict === verdict ? '✕' : verdict === 'known' ? '✓ ' : '↺ ') +
    t(`cards.mark_${verdict}`);
  const knownShown = x.interpolate({ inputRange: [0, SWIPE], outputRange: [0, 1], extrapolate: 'clamp' });
  const laterShown = x.interpolate({ inputRange: [-SWIPE, 0], outputRange: [1, 0], extrapolate: 'clamp' });
  return (
    <View style={styles.swipe}>
      <View style={[StyleSheet.absoluteFill, styles.cues]} pointerEvents="none">
        <Animated.Text style={{ color: palette.accent, fontSize: 14, fontWeight: '700', opacity: knownShown }}>
          {cue('known')}
        </Animated.Text>
        <Animated.Text style={{ color: palette.danger, fontSize: 14, fontWeight: '700', opacity: laterShown }}>
          {cue('later')}
        </Animated.Text>
      </View>
      <Animated.View {...pan.panHandlers} style={{ transform: [{ translateX: x }] }}>
        {row}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    padding: space.lg,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: space.sm,
  },
  swipe: { position: 'relative' },
  cues: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
  },
});
