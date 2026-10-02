import { Pressable, StyleSheet, Text, View } from 'react-native';

import { coverArt } from './Cover';
import { hueFrom } from './fields';
import { radius, space, usePalette } from '../theme';

/**
 * A list, drawn as a sleeve of its own.
 *
 * It used to be a collage: the four most recent covers in a two-by-two square,
 * on the argument that a list is recognised by what is in it. In practice the
 * four were nearly always four *generated* covers — most books in this app
 * have no photograph — so what the square actually showed was four small
 * coloured rectangles with four unreadable titles in them, and which list it
 * was could only be told by reading the name underneath.
 *
 * So the sleeve is now one made cover rather than four, in the list's own hue,
 * with the list's name set on it. Favourites gets a heart instead of a name:
 * it is the one list every install has, it is never renamed, and a symbol is
 * recognised across the shelf where a word has to be read.
 *
 * Nothing here queries anything. The collage needed the covers of the four
 * most recent books in every list — one window function over `list_books` on
 * every visit to the shelf — and a name and a count is all this needs.
 */
export function ListAlbum({ name, detail, width, heart, onPress }: {
  name: string;
  detail: string;
  width: number;
  /** Favourites: the one list that is a symbol rather than a name. */
  heart?: boolean;
  onPress: () => void;
}) {
  const palette = usePalette();
  // Favourites is pinned to a red, because it is the one list whose colour
  // means something. Everything else takes the hue of its own name, so a list
  // keeps its sleeve for as long as it keeps its name.
  const hue = heart ? 348 : hueFrom(name);
  const art = coverArt(hue, width, width);

  return (
    <Pressable onPress={onPress} style={{ width }}>
      <View
        style={[
          styles.album,
          { width, height: width, backgroundColor: art.ground, borderColor: palette.border },
        ]}
      >
        {art.shapes}
        {heart ? (
          <View style={styles.middle}>
            <Text style={{ color: '#FFFFFF', fontSize: Math.round(width * 0.34) }}>♥</Text>
          </View>
        ) : (
          <View style={[styles.type, { padding: Math.max(space.sm, Math.round(width * 0.09)) }]}>
            <Text
              numberOfLines={3}
              style={{
                color: '#FFFFFF',
                fontSize: Math.max(12, Math.min(22, Math.round(width * 0.135))),
                lineHeight: Math.max(15, Math.round(width * 0.165)),
                fontWeight: '700',
                letterSpacing: -0.2,
              }}
            >
              {name}
            </Text>
          </View>
        )}
      </View>
      <Text numberOfLines={1} style={{ color: palette.text, fontSize: 14, marginTop: space.xs }}>
        {name}
      </Text>
      <Text numberOfLines={1} style={{ color: palette.dim, fontSize: 12 }}>
        {detail}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  album: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    // The arc and the diagonal are drawn bigger than the sleeve on purpose.
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  middle: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  type: { justifyContent: 'flex-end' },
});
