import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import type { RunSummary } from '../db/work';
import {
  cancelWorkRun,
  clearFinishedWork,
  isPaused,
  retryWorkRun,
  setWorkPaused,
  subscribeToWork,
} from '../work/queue';
import { radius, space, usePalette } from '../theme';

function isActive(run: RunSummary): boolean {
  return run.pending + run.running > 0;
}

/** The one line that lives on Home while anything is working. */
export function WorkStrip({ runs, onPress }: { runs: RunSummary[]; onPress: () => void }) {
  const { t } = useTranslation();
  const palette = usePalette();
  const active = runs.filter(isActive);
  const failed = runs.filter((run) => !isActive(run) && run.failed > 0);
  if (!active.length && !failed.length) return null;

  const current = active[0] ?? failed[0];
  const settled = current.done + current.failed;
  const alarming = !active.length;
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
          {t(`work.kind_${current.kind}`)}
          {current.title ? ` · ${current.title}` : ''}
        </Text>
        <Text numberOfLines={1} style={{ color: palette.onAccent, fontSize: 12, opacity: 0.85 }}>
          {active.length
            ? t('work.progress', { done: settled, total: current.total })
            : t('work.failedCount', { count: current.failed })}
          {active.length > 1 ? `  ·  ${t('work.alsoWaiting', { count: active.length - 1 })}` : ''}
        </Text>
        <Bar run={current} />
      </View>
      {active.length > 0 && <ActivityIndicator color={palette.onAccent} />}
      <Text style={{ color: palette.onAccent, fontSize: 18 }}>›</Text>
    </Pressable>
  );
}

function Bar({ run }: { run: RunSummary }) {
  const palette = usePalette();
  const settled = run.done + run.failed;
  return (
    <View style={[styles.track, { backgroundColor: palette.onAccent, opacity: 0.35 }]}>
      <View
        style={[
          styles.fill,
          {
            backgroundColor: palette.onAccent,
            width: `${Math.round((settled / Math.max(1, run.total)) * 100)}%`,
          },
        ]}
      />
    </View>
  );
}

/**
 * Runs, not units. A 500-row list of chapters is not progress — the question
 * a reader has is "how far along is the analysis", and each run answers it in
 * one line with the controls that apply to it.
 */
export function WorkSheet({ runs, visible, onClose }: {
  runs: RunSummary[];
  visible: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const palette = usePalette();
  const paused = isPaused();
  const anyActive = runs.some(isActive);
  const anySettled = runs.some((run) => !isActive(run));

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: palette.bg }}>
        <View style={styles.bar}>
          <Pressable onPress={onClose} hitSlop={12} style={styles.barButton}>
            <Text style={{ color: palette.accent, fontSize: 16 }}>{t('queue.close')}</Text>
          </Pressable>
          <Text style={{ color: palette.text, fontSize: 16, fontWeight: '600' }}>{t('work.title')}</Text>
          <Pressable onPress={() => clearFinishedWork()} hitSlop={12} disabled={!anySettled} style={styles.barButton}>
            <Text style={{ color: anySettled ? palette.accent : palette.faint, fontSize: 16 }}>
              {t('queue.clear')}
            </Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: space.lg }}>
          {runs.length === 0 && (
            <Text style={{ color: palette.dim, textAlign: 'center', marginTop: space.xxl }}>
              {t('work.empty')}
            </Text>
          )}

          {runs.map((run) => {
            const active = isActive(run);
            return (
              <View
                key={run.run_id}
                style={[styles.row, { backgroundColor: palette.surface, borderColor: palette.border }]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                  <Text numberOfLines={1} style={{ color: palette.text, fontSize: 15, flex: 1 }}>
                    {t(`work.kind_${run.kind}`)}
                  </Text>
                  {/* What the row costs is part of what the row is. */}
                  <Text style={{ color: palette.faint, fontSize: 11 }}>
                    {t(`work.engine_${run.engine}`)}
                  </Text>
                </View>
                <Text numberOfLines={1} style={{ color: palette.dim, fontSize: 12, marginTop: 2 }}>
                  {run.title}
                </Text>

                <Bar run={run} />

                <View style={styles.footer}>
                  <Text style={{ color: run.failed ? palette.danger : palette.dim, fontSize: 12 }}>
                    {active
                      ? t('work.progress', { done: run.done + run.failed, total: run.total })
                      : t('work.finished', { done: run.done, total: run.total })}
                    {run.failed ? `  ·  ${t('work.failedCount', { count: run.failed })}` : ''}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: space.lg }}>
                    {run.failed > 0 && (
                      <Pressable onPress={() => retryWorkRun(run.run_id)} hitSlop={8}>
                        <Text style={{ color: palette.accent, fontSize: 13 }}>{t('queue.retry')}</Text>
                      </Pressable>
                    )}
                    {active && (
                      <Pressable onPress={() => cancelWorkRun(run.run_id)} hitSlop={8}>
                        <Text style={{ color: palette.danger, fontSize: 13 }}>{t('work.stop')}</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              </View>
            );
          })}

          {anyActive && (
            <Pressable
              onPress={() => setWorkPaused(!paused)}
              style={{ alignItems: 'center', paddingVertical: space.lg }}
            >
              <Text style={{ color: palette.accent, fontSize: 16 }}>
                {paused ? t('work.resume') : t('work.pause')}
              </Text>
            </Pressable>
          )}
          <Text style={{ color: palette.faint, fontSize: 12, textAlign: 'center' }}>
            {t('work.hint')}
          </Text>
        </ScrollView>
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
  row: {
    padding: space.md,
    marginBottom: space.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: space.sm,
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
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => subscribeToWork(setRuns), []);

  const showing = runs.some(isActive) || runs.some((run) => run.failed > 0);
  return (
    <>
      {showing && (
        <View
          style={[styles.overlay, { bottom: insets.bottom + space.md }]}
          pointerEvents="box-none"
        >
          <WorkStrip runs={runs} onPress={() => setOpen(true)} />
        </View>
      )}
      <WorkSheet runs={runs} visible={open} onClose={() => setOpen(false)} />
    </>
  );
}
