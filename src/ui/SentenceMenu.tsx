import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { highlightColors, radius, space, type HighlightColor } from '../theme';

export type MenuAction = { key: string; label: string; onPress: () => void };

/**
 * Fixed to the foot of the page, not floating over the sentence it acts on.
 * Anchored to the text it covered the words either side of it, and moved with
 * every selection, so the one control you were reaching for was never twice in
 * the same place. At the bottom it covers nothing, and the thumb already knows
 * where it is.
 *
 * The colors are always out: a swatch is a way to highlight, not just a way to
 * recolor something already highlighted, and the marked one says which colour
 * Highlight itself would use.
 */
export function SentenceMenu({ actions, activeColor, onColor, onDismiss, dismissLabel, dark }: {
  actions: MenuAction[];
  activeColor?: string | null;
  onColor?: (color: HighlightColor) => void;
  /** The only way out of a selection, so it is the widest target on the bar. */
  onDismiss?: () => void;
  dismissLabel: string;
  dark: boolean;
}) {
  // Clear of the home indicator, and off the screen edges: a control that
  // reaches the glass is a control the hand rests on by accident.
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: dark ? '#2A2A2E' : '#2B2B2F', bottom: Math.max(insets.bottom, space.md) },
      ]}
    >
      {onColor ? (
        <View style={[styles.row, styles.colors]}>
          {highlightColors.map((color) => (
            <Pressable key={color} onPress={() => onColor(color)} style={styles.swatchTarget}>
              <View
                style={[
                  styles.swatch,
                  { backgroundColor: color },
                  color === activeColor && styles.swatchActive,
                ]}
              />
            </Pressable>
          ))}
        </View>
      ) : null}
      <View style={styles.row}>
        {actions.map((action) => (
          <Pressable key={action.key} onPress={action.onPress} style={styles.item}>
            <Text numberOfLines={1} style={styles.label}>
              {action.label}
            </Text>
          </Pressable>
        ))}
        {onDismiss ? (
          <Pressable onPress={onDismiss} style={styles.dismiss}>
            <Text style={styles.dismissLabel}>{dismissLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/** A thumb, at the bottom of a page, holding a phone one-handed. */
const ROW = 56;

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: space.md,
    right: space.md,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: ROW, flexWrap: 'wrap', justifyContent: 'space-around' },
  colors: {
    justifyContent: 'space-around',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.18)',
  },
  /**
   * Sized to its word, not to an equal share of the bar. Five equal shares of
   * what is left after the Done button is about fifty points each, which cuts
   * "Highlight" and "Bookmark" in half — and a control whose name is cut is a
   * control you have to remember rather than read.
   */
  item: {
    minHeight: ROW,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.md,
  },
  /**
   * Wider than an action and set apart by a rule: leaving a mode is the one
   * thing someone does in a hurry, and a glyph the size of a full stop is the
   * wrong target for it.
   */
  dismiss: {
    minWidth: 84,
    minHeight: ROW,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: 'rgba(255,255,255,0.18)',
  },
  dismissLabel: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  label: { color: '#FFFFFF', fontSize: 15 },
  swatchTarget: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  swatch: { width: 24, height: 24, borderRadius: 12 },
  swatchActive: { borderWidth: 2, borderColor: '#FFFFFF' },
});
