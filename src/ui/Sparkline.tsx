import { Pressable, StyleSheet, View } from 'react-native';

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
 */
export function Sparkline({ bars, tint, dim, height = 22, selected, onSelect }: {
  bars: SparkBar[];
  tint: string;
  dim: string;
  height?: number;
  selected?: number | null;
  onSelect?: (bar: SparkBar | null) => void;
}) {
  const peak = Math.max(1, ...bars.map((bar) => bar.count));

  return (
    <View style={[styles.row, { height }]}>
      {bars.map((bar) => {
        const active = selected === bar.index;
        return (
          <Pressable
            key={bar.index}
            onPress={() => onSelect?.(active ? null : bar)}
            // The bar itself is a few pixels wide; the tap target is the column.
            style={styles.column}
            hitSlop={{ top: 8, bottom: 8 }}
          >
            <View
              style={{
                width: '100%',
                height: bar.count ? Math.max(3, (bar.count / peak) * height) : 1,
                backgroundColor: bar.count || active ? tint : dim,
                opacity: active ? 1 : bar.count ? 0.85 : 0.35,
                borderRadius: 1,
              }}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end' },
  column: { flex: 1, marginRight: 1, justifyContent: 'flex-end', height: '100%' },
});
