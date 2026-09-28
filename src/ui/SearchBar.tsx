import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { radius, space, usePalette } from '../theme';

/**
 * The one control the shelf and the search page share, drawn once so they
 * cannot drift: tapping the shelf's becomes the search page's, and the field
 * has to stay where the thumb left it.
 *
 * Docked, not floating — a bar that hovers is a bar you have to spot. A bar
 * on the bottom edge is where a thumb already is.
 *
 * Two surfaces and no more: the bar takes the raised one and the field the
 * page's own, so the field reads as a well cut into the bar. It used to be a
 * bordered box inside a bordered box on a third colour, which is three edges
 * to say one thing.
 */
export function SearchBar({ value, placeholder, bottom, onPress, onChange, autoFocus }: {
  /** What is in it. Absent on the shelf, where it is a button drawn as a field. */
  value?: string;
  placeholder: string;
  /** The home-indicator inset, so the bar ends above it rather than under it. */
  bottom: number;
  onPress?: () => void;
  onChange?: (next: string) => void;
  autoFocus?: boolean;
}) {
  const palette = usePalette();
  const typing = Boolean(onChange);

  const field = (
    <View style={[styles.field, { backgroundColor: palette.bg }]}>
      <Glass color={palette.faint} />
      {typing ? (
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={palette.faint}
          autoFocus={autoFocus}
          autoCorrect={false}
          clearButtonMode="while-editing"
          // Not "search": nothing is submitted here. The list answers every
          // keystroke, so by the time the return key is reached the searching
          // has happened and the only thing left to do is put the keyboard
          // away. A key promising to do what has already been done is a key
          // that looks broken when it only dismisses.
          returnKeyType="done"
          style={[styles.text, { color: palette.text }]}
        />
      ) : (
        <Text numberOfLines={1} style={[styles.text, { color: palette.faint }]}>
          {placeholder}
        </Text>
      )}
    </View>
  );

  const chrome = [
    styles.bar,
    {
      backgroundColor: palette.surface,
      borderColor: palette.border,
      // Clear of the home indicator without the dead band a full inset leaves.
      paddingBottom: bottom ? Math.max(bottom - 10, space.sm) : space.md,
    },
  ];

  return onPress ? (
    <Pressable onPress={onPress} style={({ pressed }) => [...chrome, pressed && { opacity: 0.85 }]}>
      {field}
    </Pressable>
  ) : (
    <View style={chrome}>{field}</View>
  );
}

/**
 * Drawn rather than typed. 🔍 is a colour emoji in a bar of system text, and
 * it neither takes the theme nor matches the weight of anything beside it —
 * a ring and a handle do both, and cost no dependency.
 */
function Glass({ color }: { color: string }) {
  return (
    <View style={styles.glass}>
      <View style={[styles.ring, { borderColor: color }]} />
      <View style={[styles.handle, { backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingHorizontal: space.lg,
    paddingTop: space.sm + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    minHeight: 38,
    borderRadius: radius.pill,
  },
  /** Sized to sit on the cap height of the 16pt text beside it. */
  glass: { width: 15, height: 15, alignItems: 'center', justifyContent: 'center' },
  ring: { width: 11, height: 11, borderWidth: 1.5, borderRadius: 999 },
  handle: {
    position: 'absolute',
    right: 0,
    bottom: 1,
    width: 5,
    height: 1.5,
    borderRadius: 1,
    transform: [{ rotate: '45deg' }],
  },
  /** No vertical padding: the field's `minHeight` and centring own the height,
      and a `TextInput` that also pads is a field taller on one platform. */
  text: { flex: 1, fontSize: 16, paddingVertical: 0 },
});
