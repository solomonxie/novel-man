import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import type { Face } from '../db/shelves';
import { imageUri } from '../storage/files';
import { radius, space, usePalette } from '../theme';

/**
 * A list, drawn the way a record sleeve is: the covers of what is in it. Four
 * of them, in a square, because that is the arrangement every music app has
 * taught everybody to read as "a collection" — and because a list is
 * recognised by what is in it long before its name is read.
 *
 * One book fills the square. Fewer than four leaves the rest empty rather than
 * repeating a cover, which would say the list holds more than it does.
 */
export function ListAlbum({ name, detail, faces, glyph, width, onPress }: {
  name: string;
  detail: string;
  faces: Face[];
  /** For a list with nothing in it yet: ♥ says which one this is. */
  glyph?: string;
  width: number;
  onPress: () => void;
}) {
  const palette = usePalette();
  const shown = faces.slice(0, 4);

  return (
    <Pressable onPress={onPress} style={{ width }}>
      <View
        style={[
          styles.album,
          { width, height: width, backgroundColor: palette.sunken, borderColor: palette.border },
        ]}
      >
        {shown.length === 0 ? (
          <Text style={{ color: palette.faint, fontSize: 22 }}>{glyph ?? '▢'}</Text>
        ) : (
          // Quarters as halves of the box rather than halves of a number:
          // two tiles of `floor(width / 2)` overflow a box whose hairline
          // border has taken a fraction of a point off it, and the second one
          // wraps onto its own line — which is a collage down the left edge.
          <View style={styles.quarters}>
            {shown.map((face, at) => (
              <FaceTile key={`${face.title}-${at}`} face={face} whole={shown.length === 1} />
            ))}
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

/** One quarter of the sleeve — or the whole of it, where there is one book. */
function FaceTile({ face, whole }: { face: Face; whole: boolean }) {
  const palette = usePalette();
  const box = whole ? styles.whole : styles.quarter;
  const uri = face.cover_path ? imageUri(face.cover_path) : undefined;
  if (uri) {
    return <Image source={{ uri }} style={box} resizeMode="cover" />;
  }
  return (
    <View style={[box, styles.blank, { backgroundColor: `hsl(${face.cover_hue}, 32%, 62%)` }]}>
      <Text numberOfLines={2} style={[styles.blankTitle, { color: palette.onAccent }]}>
        {face.title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  album: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quarters: { width: '100%', height: '100%', flexDirection: 'row', flexWrap: 'wrap' },
  quarter: { width: '50%', height: '50%' },
  whole: { width: '100%', height: '100%' },
  blank: { alignItems: 'center', justifyContent: 'center', padding: 4 },
  blankTitle: { fontSize: 9, fontWeight: '600', textAlign: 'center' },
});
