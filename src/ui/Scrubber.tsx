import { useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, Text, View } from 'react-native';

import { radius, space } from '../theme';

/** Clear of the bars at either end, so the ends of the chapter are reachable. */
const INSET = 40;
/** A handle is a thing you take hold of, which means it is thumb-sized. */
const SIZE = 44;
/** Off the glass edge. Flush against a rounded corner reads as a mistake. */
const EDGE = space.xs;
/** The line it runs along: thin enough to ignore, there enough to follow. */
const TRACK = 3;

/**
 * The scroll bar, as something you can take hold of.
 *
 * iOS draws an indicator but will not let a finger near it, so a long chapter
 * is a page you can only reach by flicking at it. A 3pt rail was no better: a
 * bar a thumb cannot land on is a bar that does not exist. So this is a
 * handle — a full touch target, always in reach, sitting where you are in the
 * chapter — drawn from the scroll position natively, so it keeps up with the
 * words at sixty frames without asking JavaScript anything.
 *
 * The drag is relative: what moves is the distance travelled, not the point
 * touched, so taking hold of it never makes the page jump first. While it is
 * held it says how far through the chapter it has got, because a handle with
 * no readout is a guess with a grip on it.
 */
export function Scrubber({
  scrollY,
  content,
  layout,
  ink,
  accent,
  surface,
  tint,
  offsetOf,
  onScrollTo,
}: {
  scrollY: Animated.Value;
  content: number;
  layout: number;
  ink: string;
  accent: string;
  surface: string;
  /** The page's own raised surface — what makes the handle a thing on paper. */
  tint: string;
  offsetOf: () => number;
  onScrollTo: (y: number) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [percent, setPercent] = useState(0);
  const from = useRef(0);

  const max = Math.max(0, content - layout);
  const travel = Math.max(1, layout - INSET * 2 - SIZE);

  /**
   * A gesture outlives the renders that happen during it, and so must the
   * responder holding it. Rebuilt from a changed callback or a fresh chapter
   * height, it takes over the drag already in progress with a gesture it never
   * saw begin: its `dy` is measured from zero, so the handle is flung to an
   * end and dragged back at every frame — a handle that shakes instead of
   * moving. So it is made once, and reads what changes through a ref.
   */
  const latest = useRef({ max, travel, offsetOf, onScrollTo });
  latest.current = { max, travel, offsetOf, onScrollTo };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // The page under it is a ScrollView, and a native scroll view takes
      // back any responder it can. It cannot have this one.
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: () => {
        const { max: span, offsetOf: at } = latest.current;
        from.current = at();
        setPercent(Math.round((from.current / Math.max(1, span)) * 100));
        setDragging(true);
      },
      onPanResponderMove: (_, gesture) => {
        const { max: span, travel: rail, onScrollTo: scrollTo } = latest.current;
        const next = Math.max(0, Math.min(span, from.current + (gesture.dy / rail) * span));
        setPercent(Math.round((next / Math.max(1, span)) * 100));
        scrollTo(next);
      },
      onPanResponderRelease: () => setDragging(false),
      onPanResponderTerminate: () => setDragging(false),
    })
  ).current;

  // Built once per chapter, not once per render: a fresh interpolation is a
  // fresh native node, and swapping one mid-scroll is a visible hitch.
  const translateY = useMemo(
    () => scrollY.interpolate({ inputRange: [0, max], outputRange: [0, travel], extrapolate: 'clamp' }),
    [scrollY, max, travel]
  );

  // Nothing to scroll is nothing to drag.
  if (max <= 0 || travel <= 1) return null;

  return (
    // Only the handle takes a touch: the rest of this strip is the page's own
    // tap zone, and covering it would cost the page-forward tap.
    <View style={[styles.rail, { top: INSET, height: layout - INSET * 2 }]} pointerEvents="box-none">
      {/* The line the handle runs along. It is what makes a dot at the edge of
          the page read as a position in a chapter rather than a stray mark —
          and it is the only part that says how much is left. Faint enough to
          disappear while reading, and it never takes a touch. */}
      <View pointerEvents="none" style={[styles.track, { backgroundColor: ink + '14' }]} />
      <Animated.View style={[styles.holder, { transform: [{ translateY }] }]} pointerEvents="box-none">
        {dragging ? (
          <View style={[styles.bubble, { backgroundColor: surface, borderColor: ink + '33' }]}>
            <Text style={{ color: ink, fontSize: 13, fontWeight: '600' }}>{percent}%</Text>
          </View>
        ) : null}
        <View
          {...pan.panHandlers}
          style={[
            styles.handle,
            {
              // `tint` rather than `surface`, and no blanket opacity. It was
              // the page's own background at 55%: a white disc on white paper
              // behind a border already down to a tenth of its ink, which is
              // a handle nobody could see and so nobody used.
              backgroundColor: dragging ? accent : tint,
              borderColor: dragging ? accent : ink + '33',
              // Coloured by the ink, so the same rule lifts it off white
              // paper as a shadow and off a night page as a faint halo.
              shadowColor: ink,
            },
          ]}
        >
          {/* Three bars, not a `⇕`. A glyph is drawn by whatever font the page
              is set in and sits a pixel off centre in most of them; these are
              the same at every size and read as something to take hold of. */}
          <View style={styles.grip}>
            {[0, 1, 2].map((line) => (
              <View
                key={line}
                style={[
                  styles.gripLine,
                  { backgroundColor: dragging ? surface : ink, opacity: dragging ? 0.9 : 0.45 },
                ]}
              />
            ))}
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  rail: { position: 'absolute', right: 0, width: SIZE + EDGE + space.sm },
  track: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: TRACK,
    borderRadius: TRACK / 2,
    right: EDGE + SIZE / 2 - TRACK / 2,
  },
  holder: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: space.xs,
    paddingRight: EDGE,
  },
  handle: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.16,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  grip: { gap: 3, alignItems: 'center' },
  gripLine: { width: 15, height: 1.5, borderRadius: 1 },
  bubble: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
