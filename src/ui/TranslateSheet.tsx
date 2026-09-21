import { useEffect, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { formatUsd, type Estimate } from '../ai/cost';
import type { Chapter } from '../db/repo';
import { PrimaryAction } from './primitives';
import { radius, space, usePalette } from '../theme';

export type Pending = { chapter_idx: number; pending: number };

/**
 * Which chapters, not whether. A book is rarely translated in one sitting —
 * the chapter being read tonight should not wait behind the nine hundred that
 * are not — so this asks for a selection and hands it to the queue, where the
 * work survives leaving the page and can be paused, retried or abandoned.
 *
 * A `FlatList` because a bible is 1,189 rows of this.
 */
export function TranslateSheet({
  visible, chapters, pending, language, estimate, hasKey, onQueue, onClose,
}: {
  visible: boolean;
  chapters: Chapter[];
  pending: Pending[];
  language: string;
  estimate: Estimate | null;
  hasKey: boolean;
  onQueue: (picked: Chapter[]) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const [picked, setPicked] = useState<Set<number>>(new Set());

  const left = new Map(pending.map((row) => [row.chapter_idx, row.pending]));
  const waiting = chapters.filter((chapter) => (left.get(chapter.idx) ?? 0) > 0);

  // Opening on a fresh selection every time: the last one was queued, and a
  // sheet that remembers it invites queueing the same chapters twice.
  useEffect(() => {
    if (visible) setPicked(new Set());
  }, [visible]);

  if (!visible) return null;

  const total = [...picked].reduce((sum, idx) => sum + (left.get(idx) ?? 0), 0);
  const share = estimate && waiting.length ? picked.size / waiting.length : 0;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.scrim}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            { backgroundColor: palette.bg, paddingBottom: insets.bottom + space.md },
          ]}
        >
          <View style={styles.head}>
            <Text style={{ color: palette.text, fontSize: 17, fontWeight: '600' }}>
              {t('translate.title', { language })}
            </Text>
            <Pressable onPress={() => setPicked(new Set(waiting.map((chapter) => chapter.idx)))} hitSlop={8}>
              <Text style={{ color: palette.accent, fontSize: 15 }}>{t('translate.pickAll')}</Text>
            </Pressable>
          </View>

          <FlatList
            data={waiting}
            keyExtractor={(chapter) => chapter.id}
            style={{ flexGrow: 0 }}
            renderItem={({ item }) => {
              const on = picked.has(item.idx);
              return (
                <Pressable
                  onPress={() =>
                    setPicked((was) => {
                      const next = new Set(was);
                      if (!next.delete(item.idx)) next.add(item.idx);
                      return next;
                    })
                  }
                  style={[styles.row, { borderColor: palette.border }]}
                >
                  <Text style={{ color: on ? palette.accent : palette.faint, fontSize: 17, width: 24 }}>
                    {on ? '✓' : '○'}
                  </Text>
                  <Text numberOfLines={1} style={{ color: palette.text, fontSize: 16, flex: 1 }}>
                    {item.title.trim() || `${item.idx + 1}`}
                  </Text>
                  <Text style={{ color: palette.dim, fontSize: 13 }}>
                    {t('translate.sentencesLeft', { count: left.get(item.idx) ?? 0 })}
                  </Text>
                </Pressable>
              );
            }}
          />

          <Text style={{ color: palette.dim, fontSize: 13, marginTop: space.md }}>
            {hasKey
              ? estimate
                ? t('translate.pickedCost', {
                    count: total,
                    price: formatUsd(estimate.usd * share),
                  })
                : t('translate.picked', { count: total })
              : t('ai.noKey')}
          </Text>

          <PrimaryAction
            label={t('translate.queue', { count: picked.size })}
            onPress={() => picked.size && onQueue(waiting.filter((chapter) => picked.has(chapter.idx)))}
            style={{ marginTop: space.md, opacity: picked.size && hasKey ? 1 : 0.4 }}
          />
          <Pressable onPress={onClose} style={styles.cancel}>
            <Text style={{ color: palette.dim, fontSize: 16 }}>{t('settings.cancel')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '80%',
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: space.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cancel: { alignItems: 'center', paddingVertical: space.md },
});
