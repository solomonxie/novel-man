import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { appearances, type Timeline } from '../cast/mentions';
import type { Chapter } from '../db/repo';
import { Block, Empty } from './detail';
import { bucketize, Sparkline } from './Sparkline';
import { radius, space, usePalette } from '../theme';

export type Range = { from: number; to: number };

/**
 * Where something lands across a book, one bar per stretch of chapters. The
 * graph and its caption read the same wherever they appear; what a tapped bar
 * is worth — a quote, a scene — belongs to the page, and goes in as children.
 */
export function AppearanceGraph({ title, fetchedNote, timeline, chapters, onPick, children }: {
  title: string;
  /** Set when the book arrives a chapter at a time: there is nothing to count. */
  fetchedNote?: string | null;
  timeline: Timeline;
  chapters: Chapter[];
  /** `scrubbing` while the finger is still down, so a page can show less. */
  onPick: (range: Range | null, scrubbing: boolean) => void;
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const palette = usePalette();
  const [bar, setBar] = useState<number | null>(null);

  // The section stays rather than vanishing: its absence would read as this
  // never appearing, rather than as the count being unavailable.
  if (fetchedNote) {
    return (
      <Block title={title}>
        <Empty text={fetchedNote} />
      </Block>
    );
  }

  const span = appearances(timeline);
  if (!timeline.length || !span) return null;

  const bars = bucketize(timeline, chapters.length);
  const picked = bars.find((entry) => entry.index === bar) ?? null;
  const perBar = bars.length ? bars[0].to - bars[0].from + 1 : 1;

  return (
    <Block title={title}>
      <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <Sparkline
          bars={bars}
          tint={palette.accent}
          dim={palette.faint}
          height={30}
          selected={bar}
          onScrub={(next) => onPick(next && { from: next.from, to: next.to }, next !== null)}
          onSelect={(next) => {
            setBar(next?.index ?? null);
            onPick(next && { from: next.from, to: next.to }, false);
          }}
        />
        <Text style={{ color: palette.dim, fontSize: 13, marginTop: space.sm }}>
          {picked
            ? t('graph.barDetail', {
                range:
                  picked.from === picked.to
                    ? chapterLabel(chapters, picked.from)
                    : `${chapterLabel(chapters, picked.from)} – ${chapterLabel(chapters, picked.to)}`,
                count: picked.count,
              })
            : t('graph.appears', {
                first: chapterLabel(chapters, span.first),
                last: chapterLabel(chapters, span.last),
                count: timeline.length,
              })}
        </Text>
        {perBar > 1 && !picked && (
          <Text style={{ color: palette.faint, fontSize: 12, marginTop: 2 }}>
            {t('graph.barScale', { count: perBar })}
          </Text>
        )}
        {children}
      </View>
    </Block>
  );
}

export function chapterLabel(chapters: Chapter[], idx: number): string {
  const chapter = chapters.find((entry) => entry.idx === idx);
  return chapter?.title.trim() || `${idx + 1}`;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.lg,
  },
});
