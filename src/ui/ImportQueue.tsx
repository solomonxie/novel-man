import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import { clearFinished, retryJob, type ImportJob } from '../import/queue';
import { ImportError } from '../import/pipeline';
import { radius, space, usePalette } from '../theme';

/** The one-line summary that lives on the shelf while anything is running. */
export function QueueStrip({ jobs, onPress }: { jobs: ImportJob[]; onPress: () => void }) {
  const { t } = useTranslation();
  const palette = usePalette();
  const active = jobs.filter((job) => job.status === 'pending' || job.status === 'running');
  const failed = jobs.filter((job) => job.status === 'failed');
  if (!active.length && !failed.length) return null;

  const running = active.find((job) => job.status === 'running');
  return (
    <Pressable
      onPress={onPress}
      style={[styles.strip, { backgroundColor: palette.surface, borderColor: palette.border }]}
    >
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ color: palette.text, fontSize: 14 }}>
          {running
            ? t(`import.${running.stage ?? 'reading'}`, { format: '' }).trim()
            : t('queue.failedCount', { count: failed.length })}
        </Text>
        <Text numberOfLines={1} style={{ color: palette.dim, fontSize: 12 }}>
          {running?.name ?? ''}
          {active.length > 1 ? `  ·  ${t('queue.waiting', { count: active.length - 1 })}` : ''}
        </Text>
        <View style={[styles.track, { backgroundColor: palette.border }]}>
          <View
            style={[
              styles.fill,
              { backgroundColor: palette.accent, width: `${Math.round((running?.fraction ?? 0) * 100)}%` },
            ]}
          />
        </View>
      </View>
      <Text style={{ color: palette.dim, fontSize: 18 }}>›</Text>
    </Pressable>
  );
}

export function QueueSheet({ jobs, visible, onClose }: {
  jobs: ImportJob[];
  visible: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const palette = usePalette();
  const unfinished = jobs.filter((job) => job.status !== 'done');
  const finished = jobs.filter((job) => job.status === 'done');

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <SafeAreaView style={{ flex: 1, backgroundColor: palette.bg }}>
        <View style={styles.sheetBar}>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={{ color: palette.accent, fontSize: 16 }}>{t('queue.close')}</Text>
          </Pressable>
          <Text style={{ color: palette.text, fontSize: 16, fontWeight: '600' }}>
            {t('queue.title', { count: jobs.length })}
          </Text>
          <Pressable onPress={clearFinished} hitSlop={12} disabled={!finished.length}>
            <Text style={{ color: finished.length ? palette.accent : palette.faint, fontSize: 16 }}>
              {t('queue.clear')}
            </Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: space.lg }}>
          {jobs.length === 0 && (
            <Text style={{ color: palette.dim, textAlign: 'center', marginTop: space.xxl }}>
              {t('queue.empty')}
            </Text>
          )}
          {[...unfinished, ...finished].map((job) => (
            <Row key={job.id} job={job} />
          ))}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function Row({ job }: { job: ImportJob }) {
  const { t } = useTranslation();
  const palette = usePalette();
  const failed = job.status === 'failed';
  return (
    <View style={[styles.row, { borderColor: palette.border, backgroundColor: palette.surface }]}>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ color: palette.text, fontSize: 15 }}>{job.name}</Text>
        <Text style={{ color: failed ? palette.danger : palette.dim, fontSize: 12, marginTop: 2 }}>
          {failed
            ? describe(job.error, t)
            : job.status === 'done'
              ? t('queue.doneChapters', { count: job.chapters ?? 0 })
              : job.status === 'running'
                ? t(`import.${job.stage ?? 'reading'}`, { format: '' }).trim()
                : t('queue.pending')}
        </Text>
        {job.status === 'running' && (
          <View style={[styles.track, { backgroundColor: palette.border }]}>
            <View style={[styles.fill, { backgroundColor: palette.accent, width: `${Math.round(job.fraction * 100)}%` }]} />
          </View>
        )}
      </View>
      {failed ? (
        <Pressable onPress={() => retryJob(job.id)} hitSlop={8}>
          <Text style={{ color: palette.accent, fontSize: 14 }}>{t('queue.retry')}</Text>
        </Pressable>
      ) : job.status === 'done' ? (
        <Text style={{ color: palette.dim, fontSize: 16 }}>✓</Text>
      ) : null}
    </View>
  );
}

function describe(error: unknown, t: TFunction): string {
  if (error instanceof ImportError) {
    if (error.code === 'unsupported') return t('import.unsupported', { ext: `.${error.detail}` });
    if (error.code === 'no-text') return t('import.noText');
  }
  return t('import.failed');
}

const styles = StyleSheet.create({
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
  sheetBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    marginBottom: space.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  track: { height: 3, borderRadius: 2, overflow: 'hidden', marginTop: space.sm },
  fill: { height: 3, borderRadius: 2 },
});
