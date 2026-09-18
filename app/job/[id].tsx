import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { retryJob, subscribeToQueue, type ImportJob } from '../../src/import/queue';
import { describeImportError, JobPreview, JobRow } from '../../src/ui/ImportQueue';
import { Action } from '../../src/ui/detail';
import { Hint } from '../../src/ui/primitives';
import { space, usePalette } from '../../src/theme';

/**
 * Where a download goes while it is still a download. Tapping the button used
 * to drop you back on the page you came from, which reads as "nothing
 * happened" — or worse, as a failure. This page is the book before the book:
 * its name, what is being done to it, and the way in the moment there is one.
 */
export default function JobPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const palette = usePalette();
  const [job, setJob] = useState<ImportJob | null>(null);

  useEffect(
    () => subscribeToQueue((jobs) => setJob(jobs.find((entry) => entry.id === id) ?? null)),
    [id]
  );

  // The moment it is a book, it is the book's page: nobody wants to be left
  // looking at a finished progress bar.
  useEffect(() => {
    if (job?.status === 'done' && job.bookId) router.replace(`/book/${job.bookId}`);
  }, [job?.status, job?.bookId]);

  if (!job) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.bg }}>
        <Stack.Screen options={{ title: t('job.title'), headerBackTitle: ' ' }} />
        <ActivityIndicator />
      </View>
    );
  }

  const failed = job.status === 'failed';
  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={{ padding: space.lg }}
    >
      <Stack.Screen options={{ title: t('job.title'), headerBackTitle: ' ' }} />

      <Text style={{ color: palette.text, fontSize: 22, fontWeight: '700' }}>{job.name}</Text>
      <Text style={{ color: palette.dim, fontSize: 14, marginTop: space.xs }}>
        {failed ? describeImportError(job.error, t) : t('job.working')}
      </Text>

      <View style={{ marginTop: space.lg }}>
        <JobRow job={job} />
        {job.status === 'awaiting' ? <JobPreview job={job} /> : null}
      </View>

      {failed ? (
        <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md }}>
          <Action label={t('queue.retry')} tone="loud" onPress={() => retryJob(job.id)} />
          <Action label={t('job.leave')} onPress={() => router.back()} />
        </View>
      ) : null}

      <Hint>{failed ? t('job.failedHint') : t('job.hint')}</Hint>
    </ScrollView>
  );
}
