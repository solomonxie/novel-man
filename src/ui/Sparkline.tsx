import { useRef, useState } from 'react';
import { PanResponder, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

export type SparkBar = { index: number; from: number; to: number; count: number };

const MAX_BARS = 60;

/**
 * A 500-chapter book does not get 500 bars on a phone, so each bar stands for a
 * run of chapters. It sums them rather than taking the tallest: a bar is "how
 * often they turn up around here", and a max would draw nine quiet chapters and
 * one busy one the same as ten busy ones.
 */
export function bucketize(
  counts: { chapter_idx: number; count: number }[],
  total: number
): SparkBar[] {
  if (total <= 0) return [];
  const byChapter = new Map(counts.map((entry) => [entry.chapter_idx, entry.count]));
  const perBar = Math.max(1, Math.ceil(total / MAX_BARS));
  return Array.from({ length: Math.ceil(total / perBar) }, (_, index) => {
    const from = index * perBar;
    const to = Math.min(total - 1, from + perBar - 1);
    let count = 0;
    for (let chapter = from; chapter <= to; chapter++) count += byChapter.get(chapter) ?? 0;
    return { index, from, to, count };
  });
}

/**
 * Where in the book someone actually appears, at a glance. Bars rather than a
 * curve: a chapter is a discrete thing and the gaps are the point.
 *
 * It is read with a finger. Sliding along it reports every bar it crosses —
 * a bar is 4pt wide and nobody taps that reliably, but everybody can drag —
 * and lifting off keeps the last one, which is the one being asked about.
 */
export function Sparkline({ bars, tint, dim, height = 22, selected, onSelect, onScrub }: {
  bars: SparkBar[];
  tint: string;
  dim: string;
  height?: number;
  selected?: number | null;
  onSelect?: (bar: SparkBar | null) => void;
  /** Live, while the finger is down. Null when it lifts. */
  onScrub?: (bar: SparkBar | null) => void;
}) {
  const peak = Math.max(1, ...bars.map((bar) => bar.count));
  const [under, setUnder] = useState<number | null>(null);
  const width = useRef(0);
  const latest = useRef({ bars, selected, onSelect, onScrub });
  latest.current = { bars, selected, onSelect, onScrub };

  function barAt(x: number): SparkBar | null {
    const list = latest.current.bars;
    if (!list.length || !width.current) return null;
    const index = Math.min(list.length - 1, Math.max(0, Math.floor((x / width.current) * list.length)));
    return list[index];
  }

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // The graph is inside a scrolling page: claiming the gesture on touch is
      // what stops a slow drag along it from scrolling the page instead.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (event) => {
        const bar = barAt(event.nativeEvent.locationX);
        setUnder(bar?.index ?? null);
        latest.current.onScrub?.(bar);
      },
      onPanResponderMove: (event) => {
        const bar = barAt(event.nativeEvent.locationX);
        setUnder((was) => (was === (bar?.index ?? null) ? was : bar?.index ?? null));
        latest.current.onScrub?.(bar);
      },
      onPanResponderRelease: (event) => {
        const bar = barAt(event.nativeEvent.locationX);
        setUnder(null);
        latest.current.onScrub?.(null);
        // Lifting off the bar already chosen puts the graph back to the whole book.
        const same = bar !== null && bar.index === latest.current.selected;
        latest.current.onSelect?.(same ? null : bar);
      },
      onPanResponderTerminate: () => {
        setUnder(null);
        latest.current.onScrub?.(null);
      },
    })
  ).current;

  function onLayout(event: LayoutChangeEvent) {
    width.current = event.nativeEvent.layout.width;
  }

  return (
    // Taller than it draws: a 30pt graph is not a 44pt target for a finger.
    <View
      onLayout={onLayout}
      {...responder.panHandlers}
      style={{ paddingVertical: Math.max(0, (44 - height) / 2) }}
    >
      <View style={[styles.row, { height }]}>
      {bars.map((bar) => {
        const active = under === bar.index || (under === null && selected === bar.index);
        return (
          <View key={bar.index} style={styles.column}>
            <View
              style={{
                width: '100%',
                height: bar.count ? Math.max(3, (bar.count / peak) * height) : 1,
                backgroundColor: bar.count || active ? tint : dim,
                opacity: active ? 1 : bar.count ? 0.85 : 0.35,
                borderRadius: 1,
              }}
            />
          </View>
        );
      })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end' },
  column: { flex: 1, marginRight: 1, justifyContent: 'flex-end', height: '100%' },
});
