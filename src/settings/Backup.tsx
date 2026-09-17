import { useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { File } from 'expo-file-system';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import { buildBundle, openBundle } from '../backup/bundle';
import { restoreBundle, type RestoreReport } from '../backup/restore';
import { BundleError, isBundleName } from '../backup/format';
import { deliver } from '../export/deliver';
import { pickBackupBundle } from '../import/sources/picker';
import { Hint, Row, Section } from '../ui/primitives';
import { space, usePalette } from '../theme';

export function BackupSettings() {
  const { t } = useTranslation();
  const palette = usePalette();
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<RestoreReport | null>(null);

  async function guard(work: () => Promise<void>) {
    setBusy(true);
    setReport(null);
    try {
      await work();
    } catch (error) {
      Alert.alert(t('backup.failed'), describe(error, t));
    } finally {
      setBusy(false);
    }
  }

  const exportLibrary = () =>
    guard(async () => {
      await deliver(await buildBundle(), 'share');
    });

  function confirmRestore(open: () => ReturnType<typeof openBundle> | null) {
    Alert.alert(t('backup.restore'), t('backup.restoreConfirm'), [
      { text: t('settings.cancel'), style: 'cancel' },
      {
        text: t('backup.restore'),
        onPress: () =>
          guard(async () => {
            const opened = open();
            if (!opened) throw new BundleError('not-a-bundle');
            setReport(await restoreBundle(opened));
          }),
      },
    ]);
  }

  function restoreFromFile() {
    guard(async () => {
      const picked = await pickBackupBundle();
      if (!picked) return;
      if (!isBundleName(picked.name)) throw new BundleError('not-a-bundle');
      confirmRestore(() => openBundle(new File(picked.uri).bytesSync()));
    });
  }

  return (
    <>
      <Section title={t('backup.file')}>
        <Row label={t('backup.exportLibrary')} onPress={exportLibrary} />
        <Row label={t('backup.restoreFromFile')} onPress={restoreFromFile} last />
      </Section>
      <Hint>{t('backup.fileHint')}</Hint>

      {busy ? <ActivityIndicator style={{ marginTop: space.xl }} /> : null}

      {report ? (
        <View style={{ marginTop: space.xl }}>
          <Text style={{ color: palette.text, fontSize: 15 }}>
            {t('backup.restored', { count: report.restored.length })}
          </Text>
          {report.waiting > 0 && (
            <Text style={{ color: palette.dim, fontSize: 13, marginTop: space.xs }}>
              {t('backup.restoredWaiting', { count: report.waiting })}
            </Text>
          )}
          {report.duplicates.length > 0 && (
            <Text style={{ color: palette.dim, fontSize: 13, marginTop: space.xs }}>
              {t('backup.duplicates', { list: report.duplicates.join(', ') })}
            </Text>
          )}
          {report.unplaceable.map((item, index) => (
            <Text key={index} style={{ color: palette.danger, fontSize: 13, marginTop: space.xs }}>
              {t(`backup.unplaceable_${item.reason}`, { title: item.title })}
            </Text>
          ))}
        </View>
      ) : null}
    </>
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
