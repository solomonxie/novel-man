import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import type { WorkCounts, WorkUnit } from '../db/work';
import {
  cancelAllWork,
  cancelWorkUnit,
  clearFinishedWork,
  isPaused,
  retryWorkUnit,
  setWorkPaused,
  subscribeToWork,
  type WorkFeed,
} from '../work/queue';
import { radius, space, usePalette } from '../theme';

const EMPTY: WorkFeed = { units: [], counts: { pending: 0, running: 0, failed: 0, done: 0 } };

/**
 * What a task is, in the words someone would use for it — "Summarize 第3章",
 * not "Briefing each chapter". A category tells you which machine is running;
 * a sentence tells you what is happening to your book.
 */
function taskLabel(unit: WorkUnit, t: TFunction): string {
  const named = unit.label.trim();
  const what =
    unit.chapter_idx !== null && (!named || /^\d+$/.test(named))
      ? t('work.chapterN', { n: unit.chapter_idx + 1 })
      : named;
  return t(`work.task_${unit.kind}`, { what });
}

function isActive(unit: WorkUnit): boolean {
  return unit.status === 'pending' || unit.status === 'running';
}

/** The one line that lives on Home while anything is working. */
export function WorkStrip({ feed, onPress }: { feed: WorkFeed; onPress: () => void }) {
  const { t } = useTranslation();
  const palette = usePalette();
  const { counts, units } = feed;
  const waiting = counts.pending + counts.running;
  if (!waiting && !counts.failed) return null;

  const current = units.find((unit) => unit.status === 'running') ?? units.find(isActive);
  const total = waiting + counts.done + counts.failed;
  const settled = counts.done + counts.failed;
  const alarming = !waiting;
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.strip,
        styles.raised,
        {
          backgroundColor: alarming ? palette.danger : palette.accent,
          borderColor: alarming ? palette.danger : palette.accent,
        },
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ color: palette.onAccent, fontSize: 15, fontWeight: '600' }}>
          {current ? taskLabel(current, t) : t('work.failedCount', { count: counts.failed })}
        </Text>
        <Text numberOfLines={1} style={{ color: palette.onAccent, fontSize: 12, opacity: 0.85 }}>
          {waiting ? t('work.progress', { done: settled, total }) : ''}
          {counts.failed ? `  ·  ${t('work.failedCount', { count: counts.failed })}` : ''}
        </Text>
        <View style={[styles.track, { backgroundColor: palette.onAccent, opacity: 0.35 }]}>
          <View
            style={[
              styles.fill,
              {
                backgroundColor: palette.onAccent,
                width: `${Math.round((settled / Math.max(1, total)) * 100)}%`,
              },
            ]}
          />
        </View>
      </View>
      {waiting > 0 && <ActivityIndicator color={palette.onAccent} />}
      <Text style={{ color: palette.onAccent, fontSize: 18 }}>›</Text>
    </Pressable>
  );
}

function Mark({ unit }: { unit: WorkUnit }) {
  const palette = usePalette();
  if (unit.status === 'running') return <ActivityIndicator size="small" />;
  const glyph = unit.status === 'done' ? '✓' : unit.status === 'failed' ? '✕' : '·';
  const color =
    unit.status === 'done' ? palette.dim : unit.status === 'failed' ? palette.danger : palette.faint;
  return <Text style={{ color, fontSize: 15, width: 16, textAlign: 'center' }}>{glyph}</Text>;
}

function Task({ unit }: { unit: WorkUnit }) {
  const { t } = useTranslation();
  const palette = usePalette();
  const settled = !isActive(unit);
  return (
    <View style={[styles.task, { borderColor: palette.border }]}>
      <Mark unit={unit} />
      <View style={{ flex: 1 }}>
        <Text
          numberOfLines={1}
          style={{ color: settled ? palette.dim : palette.text, fontSize: 15 }}
        >
          {taskLabel(unit, t)}
        </Text>
        <Text numberOfLines={1} style={{ color: palette.faint, fontSize: 12, marginTop: 1 }}>
          {[unit.title, t(`work.engine_${unit.engine}`)].filter(Boolean).join('  ·  ')}
        </Text>
      </View>
      {unit.status === 'failed' && (
        <Pressable onPress={() => retryWorkUnit(unit.id)} hitSlop={10}>
          <Text style={{ color: palette.accent, fontSize: 13 }}>{t('queue.retry')}</Text>
        </Pressable>
      )}
      {isActive(unit) && (
        <Pressable onPress={() => cancelWorkUnit(unit.id)} hitSlop={10}>
          <Text style={{ color: palette.danger, fontSize: 13 }}>{t('work.stop')}</Text>
        </Pressable>
      )}
    </View>
  );
}

/**
 * Every task on its own line, in the order they will run. The list used to
 * fold into one row per run, which answered "how far along is it" and hid the
 * only thing anyone actually wanted to see: what it is working on right now,
 * and what is queued behind it. Bulk control lives at the bottom, because
 * stopping everything is the bulk action people mean.
 */
export function WorkSheet({ feed, visible, onClose }: {
  feed: WorkFeed;
  visible: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const palette = usePalette();
  const paused = isPaused();
  const { counts, units } = feed;
  const active = counts.pending + counts.running;
  const settled = counts.done + counts.failed;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: palette.bg }}>
        <View style={styles.bar}>
          <Pressable onPress={onClose} hitSlop={12} style={styles.barButton}>
            <Text style={{ color: palette.accent, fontSize: 16 }}>{t('queue.close')}</Text>
          </Pressable>
          <Text style={{ color: palette.text, fontSize: 16, fontWeight: '600' }}>{t('work.title')}</Text>
          <Pressable onPress={() => clearFinishedWork()} hitSlop={12} disabled={!settled} style={styles.barButton}>
            <Text style={{ color: settled ? palette.accent : palette.faint, fontSize: 16 }}>
              {t('queue.clear')}
            </Text>
          </Pressable>
        </View>

        <FlatList
          data={units}
          keyExtractor={(unit) => unit.id}
          renderItem={({ item }) => <Task unit={item} />}
          contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xl }}
          ListEmptyComponent={
            <Text style={{ color: palette.dim, textAlign: 'center', marginTop: space.xxl }}>
              {t('work.empty')}
            </Text>
          }
          ListFooterComponent={
            <View style={{ paddingTop: space.lg, gap: space.md, alignItems: 'center' }}>
              {units.length < active + settled && (
                <Text style={{ color: palette.faint, fontSize: 12 }}>
                  {t('work.andMore', { count: active + settled - units.length })}
                </Text>
              )}
              {active > 0 && (
                <>
                  <Pressable onPress={() => setWorkPaused(!paused)} hitSlop={8}>
                    <Text style={{ color: palette.accent, fontSize: 16 }}>
                      {paused ? t('work.resume') : t('work.pause')}
                    </Text>
                  </Pressable>
                  <Pressable onPress={() => cancelAllWork()} hitSlop={8}>
                    <Text style={{ color: palette.danger, fontSize: 15 }}>{t('work.stopAll')}</Text>
                  </Pressable>
                </>
              )}
              <Text style={{ color: palette.faint, fontSize: 12, textAlign: 'center' }}>
                {t('work.hint')}
              </Text>
            </View>
          }
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', left: 0, right: 0 },
  raised: {
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginHorizontal: space.lg,
    marginBottom: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  barButton: { minWidth: 64, minHeight: 44, justifyContent: 'center', paddingHorizontal: space.sm },
  task: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  track: { height: 3, borderRadius: 2, overflow: 'hidden', marginTop: space.sm },
  fill: { height: 3, borderRadius: 2 },
});

/**
 * Analysis is started from a book's own pages but used to be watchable only
 * from Home, which made a long run look like nothing had happened. Mounted
 * once at the root so the answer to "is it working" is on whatever screen you
 * are already on.
 */
export function WorkOverlay() {
  const [feed, setFeed] = useState<WorkFeed>(EMPTY);
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => subscribeToWork(setFeed), []);
  useEffect(() => {
    opener = () => setOpen(true);
    return () => {
      opener = null;
    };
  }, []);

  const showing = feed.counts.pending + feed.counts.running + feed.counts.failed > 0;
  return (
    <>
      {showing && (
        <View
          style={[styles.overlay, { bottom: insets.bottom + space.md }]}
          pointerEvents="box-none"
        >
          <WorkStrip feed={feed} onPress={() => setOpen(true)} />
        </View>
      )}
      <WorkSheet feed={feed} visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

/**
 * The sheet is mounted once, at the root, so a second way in is a call rather
 * than a second modal — two of them would fight over which is on top.
 */
let opener: (() => void) | null = null;

export function openWorkQueue() {
  opener?.();
}

/** For anywhere that shows how much is queued without showing the queue. */
export function useWorkFeed(): WorkFeed {
  const [feed, setFeed] = useState<WorkFeed>(EMPTY);
  useEffect(() => subscribeToWork(setFeed), []);
  return feed;
}

export type { WorkCounts };
