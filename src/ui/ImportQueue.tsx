import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import { answerPreview, clearFinished, retryJob, type ImportJob } from '../import/queue';
import { ImportError } from '../import/pipeline';
import { StandardEbooksError } from '../sources/standardEbooks';
import { RepoError } from '../sources/repoBible';
import { radius, space, usePalette } from '../theme';

/** The one-line summary that lives on the shelf while anything is running. */
export function QueueStrip({ jobs, onPress }: { jobs: ImportJob[]; onPress: () => void }) {
  const { t } = useTranslation();
  const palette = usePalette();
  const active = jobs.filter((job) => job.status !== 'done' && job.status !== 'failed');
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
          {active.some((job) => job.status === 'awaiting')
            ? t('import.needsYou')
            : running
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
  const { height } = useWindowDimensions();
  const unfinished = jobs.filter((job) => job.status !== 'done');
  const finished = jobs.filter((job) => job.status === 'done');
  // Exactly what `clearFinished` removes — a failure is finished with too, and
  // a queue of nothing but failures used to be one nothing could dismiss.
  const clearable = jobs.filter((job) => job.status === 'done' || job.status === 'failed');

  // Half the screen: a queue is a glance at a few short rows, and a full-height
  // card makes checking on one read as leaving what you were doing.
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={[styles.scrim, { backgroundColor: palette.scrim }]} onPress={onClose}>
      <Pressable
        onPress={(event) => event.stopPropagation()}
        style={[
          styles.sheet,
          { height: height * 0.6, backgroundColor: palette.bg, borderColor: palette.border },
        ]}
      >
        <View style={[styles.grabber, { backgroundColor: palette.faint }]} />
        <View style={styles.sheetBar}>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={{ color: palette.accent, fontSize: 16 }}>{t('queue.close')}</Text>
          </Pressable>
          <Text style={{ color: palette.text, fontSize: 16, fontWeight: '600' }}>
            {t('queue.title', { count: jobs.length })}
          </Text>
          <Pressable onPress={clearFinished} hitSlop={12} disabled={!clearable.length}>
            <Text style={{ color: clearable.length ? palette.accent : palette.faint, fontSize: 16 }}>
              {t('queue.clear')}
            </Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}>
          {jobs.length === 0 && (
            <Text style={{ color: palette.dim, textAlign: 'center', marginTop: space.xxl }}>
              {t('queue.empty')}
            </Text>
          )}
          {[...unfinished, ...finished].map((job) => (
            <View key={job.id}>
              <JobRow job={job} />
              {job.status === 'awaiting' ? <JobPreview job={job} /> : null}
            </View>
          ))}
        </ScrollView>
      </Pressable>
      </Pressable>
    </Modal>
  );
}

export function JobRow({ job }: { job: ImportJob }) {
  const { t } = useTranslation();
  const palette = usePalette();
  const failed = job.status === 'failed';
  return (
    <View style={[styles.row, { borderColor: palette.border, backgroundColor: palette.surface }]}>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ color: palette.text, fontSize: 15 }}>{job.name}</Text>
        <Text style={{ color: failed ? palette.danger : palette.dim, fontSize: 12, marginTop: 2 }}>
          {failed
            ? describeImportError(job.error, t)
            : job.status === 'done'
              ? job.kept !== undefined
                ? t('queue.doneList', { count: job.kept })
                : t('queue.doneChapters', { count: job.chapters ?? 0 })
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

/** What was actually extracted, before it becomes a book on the shelf. */
export function JobPreview({ job }: { job: ImportJob }) {
  const { t } = useTranslation();
  const palette = usePalette();
  if (!job.preview) return null;
  return (
    <View style={[styles.preview, { borderColor: palette.border, backgroundColor: palette.surface }]}>
      <Text style={{ color: palette.text, fontSize: 14, fontWeight: '600' }}>
        {t('import.previewTitle')}
      </Text>
      <Text style={{ color: palette.dim, fontSize: 12, marginTop: 2 }}>
        {t('import.previewStats', {
          format: job.preview.format,
          characters: job.preview.characters.toLocaleString(),
          chapters: job.preview.chapters,
        })}
      </Text>
      <Text
        numberOfLines={8}
        style={{ color: palette.text, fontSize: 13, lineHeight: 19, marginTop: space.sm }}
      >
        {job.preview.sample || t('import.previewEmpty')}
      </Text>
      <View style={styles.previewActions}>
        <Pressable onPress={() => answerPreview(job.id, false)} hitSlop={8}>
          <Text style={{ color: palette.danger, fontSize: 15 }}>{t('import.discard')}</Text>
        </Pressable>
        <Pressable onPress={() => answerPreview(job.id, true)} hitSlop={8}>
          <Text style={{ color: palette.accent, fontSize: 15 }}>{t('import.keep')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function describeImportError(error: unknown, t: TFunction): string {
  // A source's own refusal is not an import failure, and reads nothing like one.
  if (error instanceof StandardEbooksError) return t(`add.se_${error.code}`);
  if (error instanceof RepoError) return t(`repo.err_${error.code}`, { detail: error.detail ?? '' });
  if (error instanceof ImportError) {
    if (error.code === 'unsupported') return t('import.unsupported', { ext: `.${error.detail}` });
    if (error.code === 'no-text') return t('import.noText');
    if (error.code === 'rejected') return t('import.discarded');
  }
  return t('import.failed');
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  grabber: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: space.sm },
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
  preview: {
    padding: space.md,
    marginBottom: space.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  previewActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: space.md,
  },
  track: { height: 3, borderRadius: 2, overflow: 'hidden', marginTop: space.sm },
  fill: { height: 3, borderRadius: 2 },
});
