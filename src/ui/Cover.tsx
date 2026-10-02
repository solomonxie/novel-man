import { Image, StyleSheet, Text, View } from 'react-native';

import { imageUri } from '../storage/files';
import { radius, space } from '../theme';

/**
 * A book's cover, or one made for it.
 *
 * Most books in this app never get a photographed cover: a manuscript imported
 * from a file has none, a Gutenberg text has none, and a record typed from
 * memory certainly has none. So the made one is not a placeholder to be
 * tolerated — it is what most of the shelf looks like, and it should look like
 * a shelf.
 *
 * What it was: a flat `hsl(h, 32%, 62%)` rectangle with the title in white at
 * the bottom. Twenty of those side by side read as twenty swatches, because
 * the only thing that differed was the hue and at 32% saturation the hues all
 * met in the middle.
 *
 * What it is now: a dark ground in the book's own hue, one of four
 * arrangements of an accent shape, a spine down the left edge, and the title
 * and author set as a cover sets them. Everything is derived from `hue`, which
 * is derived from the title, so a book's cover is the same every time it is
 * drawn and no two neighbours are quite alike.
 *
 * The ground is always dark and the type always white. That is not a taste
 * decision — it is the only way to promise contrast without knowing the hue in
 * advance, and a cover is its own object anyway: a real one does not change
 * colour when the room does, and neither does this.
 */
export function Cover({ title, author, hue, width, path }: {
  title: string;
  /** Shown where there is room for it. A manuscript often has none. */
  author?: string | null;
  hue: number;
  width: number;
  path?: string | null;
}) {
  const height = Math.round(width * 1.45);
  // Resolved rather than used as written: what is stored is a name, and what
  // a path from an older install points at no longer exists. See `imageUri`.
  const uri = path ? imageUri(path) : undefined;
  if (uri) {
    return <Image source={{ uri }} style={[styles.cover, { width, height }]} />;
  }

  const art = coverArt(hue, width, height);
  const type = typeFor(width);

  return (
    <View style={[styles.cover, { width, height, backgroundColor: art.ground }]}>
      {art.shapes}
      {/* The spine. A cover is the front of an object with a thickness, and
          one darker stripe down the binding edge is the whole of what says so. */}
      <View style={[styles.spine, { width: Math.max(2, Math.round(width * 0.035)), backgroundColor: art.spine }]} />

      {type ? (
        <View style={[styles.type, { padding: type.pad }]}>
          <Text
            numberOfLines={type.lines}
            style={{
              color: '#FFFFFF',
              fontSize: type.title,
              lineHeight: Math.round(type.title * 1.2),
              fontWeight: '700',
              letterSpacing: -0.2,
            }}
          >
            {title}
          </Text>
          {author?.trim() && type.author ? (
            <>
              {/* A rule, not a blank line. It is what makes the two blocks a
                  title and a byline rather than two sentences. */}
              <View style={[styles.rule, { marginVertical: Math.round(type.pad * 0.5) }]} />
              <Text
                numberOfLines={1}
                style={{ color: 'rgba(255,255,255,0.82)', fontSize: type.author }}
              >
                {author.trim()}
              </Text>
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/**
 * How much type a cover this size can carry.
 *
 * `null` below the smallest useful size. A 34pt cover is the one beside a line
 * of search results, and a title set in it is three illegible words — the
 * artwork alone is more use there, because what it is doing at that size is
 * telling one row from the next.
 */
function typeFor(width: number): { title: number; author: number; lines: number; pad: number } | null {
  if (width < 56) return null;
  const title = Math.max(10, Math.min(30, Math.round(width * 0.125)));
  return {
    title,
    // Only where the byline would not crowd the title it belongs to.
    author: width >= 92 ? Math.max(9, Math.round(title * 0.6)) : 0,
    lines: width >= 120 ? 4 : 3,
    pad: Math.max(space.xs, Math.round(width * 0.075)),
  };
}

/**
 * The ground, the spine and one accent shape, all from the hue.
 *
 * Four arrangements, chosen by the hue so a book keeps its own. They are
 * deliberately plain shapes — a band, an arc, a diagonal, three bars — because
 * what has to survive is being 112 points wide on a shelf, and anything
 * finer than this is mud at that size.
 *
 * Shared with the list sleeves, which are the same problem in a square: a made
 * cover for a thing that has no picture of its own.
 */
export function coverArt(hue: number, width: number, height: number) {
  const base = hue % 360;
  /**
   * Three depths, so neighbouring hues are not also neighbouring tones.
   *
   * The step is six and not more because of yellow. White on `hsl(62, 44%, …)`
   * is the worst case any hue can produce, and at a 34% ground it comes to
   * 4.37:1 — fine for the title, which is large and bold, and under the 4.5:1
   * that the byline needs. At 32% the worst hue is 4.84:1, so every cover this
   * can generate is readable rather than most of them.
   */
  const dark = 20 + (base % 3) * 6;
  const ground = `hsl(${base}, 44%, ${dark}%)`;
  const spine = `hsl(${base}, 46%, ${Math.max(10, dark - 8)}%)`;
  // The accent is a turn away around the wheel, not the complement: a cover
  // that fights itself looks like a warning sign.
  const accent = `hsl(${(base + 32) % 360}, 58%, ${dark + 30}%)`;
  const faint = `hsl(${(base + 32) % 360}, 40%, ${dark + 14}%)`;

  const shapes = [];
  switch (base % 4) {
    case 0:
      // A band across the upper third, with a thin companion under it.
      shapes.push(
        <View key="band" style={[styles.fill, { top: height * 0.17, height: height * 0.1, backgroundColor: accent }]} />,
        <View key="hair" style={[styles.fill, { top: height * 0.3, height: Math.max(1, height * 0.012), backgroundColor: faint }]} />
      );
      break;
    case 1: {
      // An arc leaving the top-right corner. Bigger than the cover, so what
      // shows is a curve rather than a circle sitting on a rectangle.
      const size = Math.round(width * 1.25);
      shapes.push(
        <View
          key="arc"
          style={{
            position: 'absolute',
            right: -size * 0.42,
            top: -size * 0.34,
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: accent,
          }}
        />
      );
      break;
    }
    case 2: {
      // A square turned 45°, which is how you get a diagonal without a
      // drawing library: the corner that crosses the cover is the edge.
      const size = Math.round(width * 1.5);
      shapes.push(
        <View
          key="split"
          style={{
            position: 'absolute',
            left: -size * 0.5,
            top: height * 0.42,
            width: size,
            height: size,
            backgroundColor: faint,
            transform: [{ rotate: '-18deg' }],
          }}
        />
      );
      break;
    }
    default:
      // Three bars, shortening. The only one that reads as a mark rather than
      // as a field of colour, which a shelf wants some of.
      shapes.push(
        ...[0.52, 0.34, 0.2].map((part, at) => (
          <View
            key={`bar${at}`}
            style={{
              position: 'absolute',
              left: Math.round(width * 0.12),
              top: height * (0.14 + at * 0.075),
              width: Math.round(width * part),
              height: Math.max(2, Math.round(height * 0.022)),
              backgroundColor: at === 0 ? accent : faint,
              borderRadius: 999,
            }}
          />
        ))
      );
  }

  return { ground, spine, shapes };
}

const styles = StyleSheet.create({
  cover: {
    borderRadius: radius.sm,
    // The arc and the diagonal are bigger than the cover on purpose.
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  fill: { position: 'absolute', left: 0, right: 0 },
  spine: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  type: { justifyContent: 'flex-end' },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.45)' },
});
