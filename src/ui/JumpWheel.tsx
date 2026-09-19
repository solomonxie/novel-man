import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useTranslation } from 'react-i18next';

import type { Chapter } from '../db/repo';
import { radius, space, type ReadingPalette } from '../theme';

/**
 * Where to, asked in the book's own levels. A bible has two — Genesis, then
 * Genesis 1 — and a novel usually has one, so it gets one wheel rather than a
 * column of nothing beside its chapters.
 *
 * It unfolds under the title it belongs to, so the chapter being left stays on
 * screen while the next one is chosen.
 */
export function JumpWheel({ chapters, index, palette, onGo, onClose }: {
  chapters: Chapter[];
  index: number;
  palette: ReadingPalette;
  onGo: (chapterIdx: number) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  /** The parts, in reading order, as the book itself names them. */
  const parts = useMemo(() => {
    const seen = new Map<number, string>();
    for (const chapter of chapters) {
      if (chapter.part_idx === null || chapter.part_idx === undefined) continue;
      if (!seen.has(chapter.part_idx)) {
        seen.set(chapter.part_idx, chapter.part_title?.trim() || `${chapter.part_idx + 1}`);
      }
    }
    return [...seen].map(([idx, title]) => ({ idx, title }));
  }, [chapters]);

  const here = chapters.find((chapter) => chapter.idx === index);
  const [part, setPart] = useState(here?.part_idx ?? parts[0]?.idx ?? 0);
  const [picked, setPicked] = useState(index);

  const inPart = useMemo(
    () => (parts.length > 1 ? chapters.filter((chapter) => chapter.part_idx === part) : chapters),
    [chapters, parts.length, part]
  );

  return (
    <View style={[styles.panel, { backgroundColor: palette.bg, borderColor: palette.tint }]}>
      <View style={styles.wheels}>
        {/* One level or two, decided by the book rather than by the screen. */}
        {parts.length > 1 ? (
          <Picker
            selectedValue={part}
            onValueChange={(value) => {
              const next = Number(value);
              setPart(next);
              const first = chapters.find((chapter) => chapter.part_idx === next);
              if (first) setPicked(first.idx);
            }}
            itemStyle={[styles.item, { color: palette.text }]}
            style={styles.wheel}
          >
            {parts.map((entry) => (
              <Picker.Item key={entry.idx} label={entry.title} value={entry.idx} />
            ))}
          </Picker>
        ) : null}
        <Picker
          selectedValue={picked}
          onValueChange={(value) => setPicked(Number(value))}
          itemStyle={[styles.item, { color: palette.text }]}
          style={styles.wheel}
        >
          {inPart.map((entry) => (
            <Picker.Item
              key={entry.id}
              label={entry.title.trim() || `${entry.idx + 1}`}
              value={entry.idx}
            />
          ))}
        </Picker>
      </View>
      <View style={styles.actions}>
        <Pressable onPress={onClose} style={styles.action} hitSlop={8}>
          <Text style={{ color: palette.dim, fontSize: 16 }}>{t('settings.cancel')}</Text>
        </Pressable>
        <Pressable onPress={() => onGo(picked)} style={styles.action} hitSlop={8}>
          <Text style={{ color: palette.accent, fontSize: 16, fontWeight: '600' }}>
            {t('reader.go')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.md,
  },
  wheels: { flexDirection: 'row', gap: space.md },
  wheel: { flex: 1 },
  item: { fontSize: 17 },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
  },
  action: { paddingVertical: space.sm, minWidth: 72, alignItems: 'center' },
});
