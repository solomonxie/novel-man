import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, View } from 'react-native';
import { Stack, useFocusEffect } from '../../src/navigation/router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import {
  backUp,
  listBackups,
  readBackup,
  removeBackup,
  type DriveFile,
} from '../../src/backup/icloud';
import { openBundle } from '../../src/backup/bundle';
import { BundleError, dateOf } from '../../src/backup/format';
import { restoreBundle, type RestoreReport } from '../../src/backup/restore';
import { Hint, PrimaryAction, Row, Section } from '../../src/ui/primitives';
import { space, usePalette } from '../../src/theme';

/**
 * Every copy iCloud is holding, and the way back from any one of them.
 *
 * The switch in settings answers "is this backed up"; this page answers the
 * question that only ever gets asked in a bad hour — "what did it look like on
 * Tuesday". Ten copies, newest first, each one a date you can read and choose.
 */
export default function IcloudBackups() {
  const { t } = useTranslation();
  const palette = usePalette();
  const [files, setFiles] = useState<DriveFile[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<RestoreReport | null>(null);

  const load = useCallback(() => {
    listBackups()
      .then(setFiles)
      .catch(() => setFiles([]));
  }, []);

  useFocusEffect(load);

  async function guard(work: () => Promise<void>) {
    setBusy(true);
    setReport(null);
    try {
      await work();
    } catch (problem) {
      Alert.alert(t('backup.failed'), describe(problem, t));
    } finally {
      setBusy(false);
      load();
    }
  }

  /**
   * Restoring always adds; it never overwrites what is here. So the question
   * asked first is the honest one — this will bring the books in that copy
   * back, beside the ones you have.
   */
  function ask(file: DriveFile) {
    Alert.alert(when(file), t('backup.restoreConfirm'), [
      { text: t('settings.cancel'), style: 'cancel' },
      {
        text: t('backup.restore'),
        onPress: () =>
          guard(async () => {
            setReport(await restoreBundle(openBundle(await readBackup(file.name))));
          }),
      },
      {
        text: t('settings.delete'),
        style: 'destructive',
        onPress: () => guard(() => removeBackup(file.name)),
      },
    ]);
  }

  /** What it is *of* comes from its name; when it was written is its own fact. */
  function when(file: DriveFile): string {
    const day = dateOf(file.name);
    const written = new Date(file.modifiedAt).toLocaleString();
    return day ? `${day.toLocaleDateString()} · ${written}` : written;
  }

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}
    >
      <Stack.Screen options={{ title: t('backup.icloudBrowse'), headerBackTitle: ' ' }} />

      <Section title={t('backup.icloudCopies')}>
        {files === null ? (
          <View style={{ padding: space.xl }}><ActivityIndicator /></View>
        ) : files.length === 0 ? (
          <Row label={t('backup.icloudNone')} last />
        ) : (
          files.map((file, index) => (
            <Row
              key={file.name}
              label={when(file)}
              detail={file.name}
              value="›"
              onPress={() => ask(file)}
              last={index === files.length - 1}
            />
          ))
        )}
      </Section>
      <Hint>{t('backup.icloudBrowseHint')}</Hint>

      <View style={{ marginTop: space.lg }}>
        <PrimaryAction
          label={t('backup.now')}
          onPress={() =>
            guard(async () => {
              const wrote = await backUp();
              if (!wrote) Alert.alert(t('backup.now'), t('backup.nowUnchanged'));
            })
          }
        />
      </View>

      {busy ? <ActivityIndicator style={{ marginTop: space.xl }} /> : null}

      {report ? (
        <Text style={{ color: palette.text, fontSize: 15, marginTop: space.xl }}>
          {t('backup.restored', { count: report.restored.length })}
        </Text>
      ) : null}
    </ScrollView>
  );
}

function describe(error: unknown, t: TFunction): string {
  if (error instanceof BundleError) {
    return error.code === 'too-new'
      ? t('backup.tooNew', { version: error.detail })
      : t('backup.notABundle');
  }
  return String(error);
}
