import { Animated, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { radius, space, usePalette } from '../theme';

/**
 * The one control the shelf and the search page share, drawn once so they
 * cannot drift: tapping the shelf's becomes the search page's, and the field
 * has to stay where the thumb left it.
 *
 * It floats over the page rather than sitting in a bar of its own. A bar
 * needs a background, and a full-width band the colour of the page under a
 * hairline is a black stripe across the bottom of the screen in the dark —
 * chrome that has to be drawn before the one thing anybody wants is. A pill
 * on a shadow needs none of it: the shelf carries on underneath, which is
 * also what says there is more of it down there.
 *
 * Positioned here rather than by each page, so the two cannot drift apart by
 * a few points. `bottom` may be an animated value — the search page rides it
 * up with the keyboard.
 */
export function SearchBar({
  value,
  placeholder,
  bottom,
  onPress,
  onChange,
  onSubmit,
  autoFocus,
}: {
  /** What is in it. Absent on the shelf, where it is a button drawn as a field. */
  value?: string;
  placeholder: string;
  /** How far off the bottom edge, safe area included. */
  bottom: number | Animated.Value | Animated.AnimatedInterpolation<number>;
  onPress?: () => void;
  onChange?: (next: string) => void;
  /** The return key, which is the one moment a query was certainly meant. */
  onSubmit?: () => void;
  autoFocus?: boolean;
}) {
  const palette = usePalette();
  const typing = Boolean(onChange);

  const pill = (pressed = false) => (
    <View
      style={[
        styles.pill,
        {
          backgroundColor: pressed ? palette.sunken : palette.surface,
          borderColor: palette.border,
        },
      ]}
    >
      <SearchGlass color={palette.dim} />
      {typing ? (
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={palette.dim}
          autoFocus={autoFocus}
          autoCorrect={false}
          clearButtonMode="while-editing"
          // Not "search": nothing is submitted here. The list answers every
          // keystroke, so by the time the return key is reached the searching
          // has happened and the only thing left to do is put the keyboard
          // away. A key promising to do what has already been done is a key
          // that looks broken when it only dismisses.
          returnKeyType="done"
          onSubmitEditing={onSubmit}
          style={[styles.text, { color: palette.text }]}
        />
      ) : (
        <Text numberOfLines={1} style={[styles.text, { color: palette.dim }]}>
          {placeholder}
        </Text>
      )}
    </View>
  );

  return (
    // `box-none` so the strip either side of the pill is not a dead band: a
    // tap that misses it lands on the shelf underneath, where it was aimed.
    <Animated.View style={[styles.floating, { bottom }]} pointerEvents="box-none">
      {onPress ? (
        <Pressable onPress={onPress}>{({ pressed }) => pill(pressed)}</Pressable>
      ) : (
        pill()
      )}
    </Animated.View>
  );
}

/**
 * Drawn rather than typed. 🔍 is a colour emoji in a bar of system text: it
 * takes neither the theme nor the weight of anything beside it.
 *
 * The handle is placed by arithmetic rather than by eye. It runs along the
 * 45° diagonal from just inside the ring's edge, so `left` and `top` are the
 * midpoint of that segment less half the handle — anchoring it to `right` and
 * `bottom` instead left a hairline gap where it met the circle, which at this
 * size is the difference between a magnifier and two loose marks.
 */
export function SearchGlass({ color }: { color: string }) {
  return (
    <View style={styles.glass}>
      <View style={[styles.ring, { borderColor: color }]} />
      <View style={[styles.handle, { backgroundColor: color }]} />
    </View>
  );
}

const GLASS = 18;
const RING = 12;
const STROKE = 1.6;
const HANDLE = 4.5;
/** Where the 45° diagonal leaves the ring, a touch inside it so the two join. */
const FROM = GLASS / 2 + (RING / 2 - STROKE / 2) * Math.SQRT1_2;
const MID = FROM + (HANDLE / 2) * Math.SQRT1_2;

/** What it occupies, so a page can end above it rather than under it. */
export const SEARCH_BAR_HEIGHT = 60;

/**
 * How far it sits off the bottom edge. Close to it — a floating control wants
 * to look like it belongs to the edge rather than hovering in the middle
 * distance — but clear of the home indicator, which is a few points tall and
 * sits a few more above the glass. Most of the safe-area inset is meant for
 * content the system must not cover, and a pill that can be moved is not that.
 */
export function searchBarOffset(inset: number): number {
  return inset ? Math.max(inset - 18, space.sm) : space.md;
}

const styles = StyleSheet.create({
  floating: { position: 'absolute', left: space.md, right: space.md },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md + 2,
    height: 52,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    // What says the shelf carries on underneath rather than stopping here.
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  glass: { width: GLASS, height: GLASS },
  ring: {
    position: 'absolute',
    left: (GLASS - RING) / 2,
    top: (GLASS - RING) / 2,
    width: RING,
    height: RING,
    borderWidth: STROKE,
    borderRadius: 999,
  },
  handle: {
    position: 'absolute',
    left: MID - HANDLE / 2,
    top: MID - STROKE / 2,
    width: HANDLE,
    height: STROKE,
    borderRadius: STROKE / 2,
    transform: [{ rotate: '45deg' }],
  },
  /** No vertical padding: the pill's fixed height and centring own that, and
      a `TextInput` that also pads is a field taller on one platform. */
  text: { flex: 1, fontSize: 17, paddingVertical: 0 },
});
