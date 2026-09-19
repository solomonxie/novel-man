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
 * The colors are always out, and they are the whole of highlighting: tapping
 * one marks the passage, tapping the one already on it takes the mark off.
 * There is no Highlight button because there is nothing left for it to say.
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
   * Sized to its word, not to an equal share of the bar — a control whose
   * name is cut is one you have to remember rather than read. Three of them
   * and the way out fit a line at any width the app runs at.
   */
  item: {
    minHeight: ROW,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.sm,
  },
  /**
   * Last on the row and set apart by a rule: leaving a mode is the one thing
   * someone does in a hurry, so it is wider than the word it holds and never
   * sits between two actions.
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
