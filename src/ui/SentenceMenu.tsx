import { Pressable, StyleSheet, Text, View } from 'react-native';
import { highlightColors, space, type HighlightColor } from '../theme';

export type MenuAction = { key: string; label: string; onPress: () => void };

const MENU_HEIGHT = 46;
const COLOR_ROW = 40;

/**
 * Anchored above the sentence it acts on, flipped below when that would put it
 * off-screen. Colors only appear once there is a highlight to recolor —
 * otherwise the first tap would be a palette instead of an action.
 */
export function SentenceMenu({ y, screenHeight, actions, activeColor, onColor, dark }: {
  y: number;
  screenHeight: number;
  actions: MenuAction[];
  activeColor?: string | null;
  onColor?: (color: HighlightColor) => void;
  dark: boolean;
}) {
  const height = MENU_HEIGHT + (activeColor ? COLOR_ROW : 0);
  const above = y - height - 12;
  const flipped = above < 80;
  const top = flipped ? Math.min(y + 28, screenHeight - height - 40) : above;

  return (
    <View style={[styles.menu, { top, backgroundColor: dark ? '#2A2A2E' : '#2B2B2F' }]}>
      <View style={styles.row}>
        {actions.map((action) => (
          <Pressable key={action.key} onPress={action.onPress} style={styles.item}>
            <Text style={styles.label}>{action.label}</Text>
          </Pressable>
        ))}
      </View>
      {activeColor && onColor ? (
        <View style={[styles.row, styles.colors]}>
          {highlightColors.map((color) => (
            <Pressable key={color} onPress={() => onColor(color)} hitSlop={6}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  menu: { position: 'absolute', alignSelf: 'center', borderRadius: 10, paddingHorizontal: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', height: MENU_HEIGHT },
  colors: {
    height: COLOR_ROW,
    justifyContent: 'space-around',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.18)',
  },
  item: { paddingHorizontal: space.md, paddingVertical: space.sm },
  label: { color: '#FFFFFF', fontSize: 14 },
  swatch: { width: 22, height: 22, borderRadius: 11 },
  swatchActive: { borderWidth: 2, borderColor: '#FFFFFF' },
});
