import { Pressable, StyleSheet, Text, View } from 'react-native';
import { space, usePalette } from '../theme';

export type Option = { id: string; label: string; detail?: string };

/**
 * A short set of answers, unfolded inside the card of the row that asked. The
 * sheet this replaces covered exactly the context the choice is made from —
 * the row's own label, and whatever else on the page led to it.
 *
 * Picking folds it; there is no Cancel, because tapping the row again leaves
 * everything as it was.
 */
export function OptionRows({ options, selectedId, onPick, topRule = true }: {
  options: Option[];
  selectedId?: string | null;
  onPick: (id: string) => void;
  topRule?: boolean;
}) {
  const palette = usePalette();
  return (
    <View
      style={[
        styles.panel,
        topRule && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: palette.border },
      ]}
    >
      {options.map((option) => {
        const on = option.id === selectedId;
        return (
          <Pressable
            key={option.id}
            onPress={() => onPick(option.id)}
            style={({ pressed }) => [styles.row, pressed && { backgroundColor: palette.sunken }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: on ? palette.accent : palette.text, fontSize: 16 }}>
                {option.label}
              </Text>
              {option.detail ? (
                <Text style={{ color: palette.dim, fontSize: 12, marginTop: 1 }}>
                  {option.detail}
                </Text>
              ) : null}
            </View>
            {on ? <Text style={{ color: palette.accent, fontSize: 16 }}>✓</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { paddingVertical: space.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm + 2,
  },
});
