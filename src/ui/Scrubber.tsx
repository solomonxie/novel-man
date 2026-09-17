import { useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

/**
 * Dragging is how you find a place you half-remember, so the bar reports
 * continuously while held and commits once on release — seeking on every
 * pixel would re-render the chapter a hundred times a swipe.
 */
export function Scrubber({ value, label, tint, dim, onPreview, onCommit }: {
  value: number;
  label: (fraction: number) => string;
  tint: string;
  dim: string;
  onPreview?: (fraction: number) => void;
  onCommit: (fraction: number) => void;
}) {
  const [width, setWidth] = useState(0);
  const [dragging, setDragging] = useState<number | null>(null);
  const widthRef = useRef(0);
  const draggingRef = useRef(0);

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // `locationX` is relative to the track itself, which is the responder —
      // measuring the track's screen position was one more thing to get stale.
      onPanResponderGrant: (event) => update(event.nativeEvent.locationX),
      onPanResponderMove: (event) => update(event.nativeEvent.locationX),
      onPanResponderRelease: () => {
        onCommit(draggingRef.current);
        setDragging(null);
      },
      onPanResponderTerminate: () => setDragging(null),
    })
  ).current;

  function update(x: number) {
    const fraction = Math.min(1, Math.max(0, x / Math.max(1, widthRef.current)));
    draggingRef.current = fraction;
    setDragging(fraction);
    onPreview?.(fraction);
  }

  function onLayout(event: LayoutChangeEvent) {
    widthRef.current = event.nativeEvent.layout.width;
    setWidth(event.nativeEvent.layout.width);
  }

  const shown = dragging ?? value;
  return (
    <View>
      <View onLayout={onLayout} style={styles.track} {...responder.panHandlers}>
        <View style={[styles.rail, { backgroundColor: dim, opacity: 0.3 }]} />
        <View style={[styles.rail, { backgroundColor: tint, width: width * shown }]} />
        <View
          style={[
            styles.knob,
            {
              backgroundColor: tint,
              left: Math.max(0, Math.min(width - KNOB, width * shown - KNOB / 2)),
              transform: [{ scale: dragging === null ? 1 : 1.3 }],
            },
          ]}
        />
      </View>
      <Text style={[styles.label, { color: dim }]}>{label(shown)}</Text>
    </View>
  );
}

/** A thumb, not a cursor: the knob is grabbable and the track is 44pt tall. */
const KNOB = 20;

const styles = StyleSheet.create({
  track: { height: 44, justifyContent: 'center' },
  rail: { position: 'absolute', height: 4, borderRadius: 2, left: 0, right: 0 },
  knob: { position: 'absolute', width: KNOB, height: KNOB, borderRadius: KNOB / 2 },
  label: { fontSize: 11, textAlign: 'center' },
});
