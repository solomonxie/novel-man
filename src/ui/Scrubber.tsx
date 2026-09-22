import { useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, Text, View } from 'react-native';

import { radius, space } from '../theme';

/** Clear of the bars at either end, so the ends of the chapter are reachable. */
const INSET = 40;
/** A handle is a thing you take hold of, which means it is thumb-sized. */
const SIZE = 44;

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
export function Scrubber({ scrollY, content, layout, ink, accent, surface, offsetOf, onScrollTo }: {
  scrollY: Animated.Value;
  content: number;
  layout: number;
  ink: string;
  accent: string;
  surface: string;
  offsetOf: () => number;
  onScrollTo: (y: number) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [percent, setPercent] = useState(0);
  const from = useRef(0);

  const max = Math.max(0, content - layout);
  const travel = Math.max(1, layout - INSET * 2 - SIZE);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        // The page under it is a ScrollView, and a native scroll view takes
        // back any responder it can. It cannot have this one.
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: () => {
          from.current = offsetOf();
          setPercent(Math.round((from.current / Math.max(1, max)) * 100));
          setDragging(true);
        },
        onPanResponderMove: (_, gesture) => {
          const next = Math.max(0, Math.min(max, from.current + (gesture.dy / travel) * max));
          setPercent(Math.round((next / Math.max(1, max)) * 100));
          onScrollTo(next);
        },
        onPanResponderRelease: () => setDragging(false),
        onPanResponderTerminate: () => setDragging(false),
      }),
    [max, travel, offsetOf, onScrollTo]
  );

  // Nothing to scroll is nothing to drag.
  if (max <= 0 || travel <= 1) return null;

  const translateY = scrollY.interpolate({
    inputRange: [0, max],
    outputRange: [0, travel],
    extrapolate: 'clamp',
  });

  return (
    // Only the handle takes a touch: the rest of this strip is the page's own
    // tap zone, and covering it would cost the page-forward tap.
    <View style={[styles.rail, { top: INSET, height: layout - INSET * 2 }]} pointerEvents="box-none">
      <Animated.View style={[styles.holder, { transform: [{ translateY }] }]} pointerEvents="box-none">
        {dragging ? (
          <View style={[styles.bubble, { backgroundColor: surface, borderColor: ink + '22' }]}>
            <Text style={{ color: ink, fontSize: 13, fontWeight: '600' }}>{percent}%</Text>
          </View>
        ) : null}
        <View
          {...pan.panHandlers}
          style={[
            styles.handle,
            {
              backgroundColor: dragging ? accent : surface,
              borderColor: dragging ? accent : ink + '33',
              opacity: dragging ? 1 : 0.55,
            },
          ]}
        >
          <Text style={{ color: dragging ? surface : ink, fontSize: 15, lineHeight: 18 }}>⇕</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  rail: { position: 'absolute', right: 0, width: SIZE + space.sm },
  holder: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: space.xs },
  handle: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubble: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
