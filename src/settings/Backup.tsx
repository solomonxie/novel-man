import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text } from 'react-native';
import { Directory, File, Paths } from '../storage/fs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import { buildBundle, openBundle } from '../backup/bundle';
import { backupBeforeRemoval } from '../backup/removal';
import { restoreBundle, type RestoreReport } from '../backup/restore';
import { BundleError, isBundleName } from '../backup/format';
import { deliver } from '../export/deliver';
import { pickBackupBundle } from '../import/sources/picker';
import { RestoreReportView } from './RestoreReport';
import { Hint, Row, Section } from '../ui/primitives';
import { space, usePalette } from '../theme';
import { db, transaction } from '../db';
import * as SecureStore from '../storage/secrets';
import { resetAppearance } from '../theme/appearance';
import { setUiLanguage } from '../i18n';
import { cancelAllWork } from '../work/queue';
import { settled as cloudSettled } from '../cloud/sync';
import { suppressLaunchRestore } from '../backup/icloud';
import { listConnections } from '../cloud/connections';
import { listKeys } from '../ai/keys';
import { noticeChange } from '../backup/changes';

export function BackupSettings({ onRemoved }: { onRemoved?: () => void }) {
  const { t } = useTranslation();
  const palette = usePalette();
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<RestoreReport | null>(null);
  const [removing, setRemoving] = useState(false);

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

  function confirmRemoveAll() {
    Alert.alert(t('settings.removeAllTitle'), t('settings.removeAllWarning'), [
      { text: t('settings.cancel'), style: 'cancel' },
      {
        text: t('settings.removeAll'),
        style: 'destructive',
        onPress: () => {
          void guard(async () => {
            const backup = await backupBeforeRemoval();
            setRemoving(true);
            try {
              await clearAppData(backup.fileName);
              setUiLanguage('system');
              resetAppearance();
              onRemoved?.();
            } finally {
              setRemoving(false);
            }
          });
        },
      },
    ]);
  }

  return (
    <>
      <Section title={t('backup.file')}>
        <Row label={t('backup.exportLibrary')} onPress={exportLibrary} />
        <Row label={t('backup.restoreFromFile')} onPress={restoreFromFile} last />
      </Section>
      <Hint>{t('backup.fileHint')}</Hint>

      {busy ? <ActivityIndicator style={{ marginTop: space.xl }} /> : null}

      {report ? <RestoreReportView report={report} /> : null}

      <Pressable
        onPress={confirmRemoveAll}
        disabled={busy || removing}
        style={{ alignSelf: 'flex-start', marginTop: space.xxl, paddingVertical: space.sm }}
        hitSlop={8}
      >
        <Text style={{ color: palette.danger, fontSize: 14 }}>
          {t('settings.removeAll')}
        </Text>
      </Pressable>
    </>
  );
}

async function clearAppData(keepBackup: string) {
  // Both queues first, and awaited: a handler mid-write would otherwise put
  // its rows back after the tables were emptied.
  await cancelAllWork();
  await cloudSettled();
  const keys = await listKeys();
  const connections = await listConnections();
  const database = await db();
  await database.execAsync('PRAGMA foreign_keys = OFF');
  try {
    await transaction(async () => {
      const tables = await database.getAllAsync<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
      );
      for (const { name } of tables) {
        if (!/^[a-zA-Z0-9_]+$/.test(name)) continue;
        await database.execAsync(`DELETE FROM "${name}"`);
      }
    });
    noticeChange();
  } finally {
    await database.execAsync('PRAGMA foreign_keys = ON');
  }
  await database.execAsync('PRAGMA wal_checkpoint(TRUNCATE); VACUUM');

  await AsyncStorage.clear();
  await suppressLaunchRestore();
  await Promise.all([
    ...keys.map((key) => SecureStore.deleteItemAsync(`ai.key.${key.id}`)),
    ...connections.map((connection) => SecureStore.deleteItemAsync(`cloud.secret.${connection.id}`)),
    SecureStore.deleteItemAsync('ai.keys.index'),
    SecureStore.deleteItemAsync('ai.keys.strategy'),
    SecureStore.deleteItemAsync('cloud.connections'),
    SecureStore.deleteItemAsync('esv.apiKey'),
    SecureStore.deleteItemAsync('standardebooks.email'),
  ]);

  // The picker keeps a copy of every file ever imported, and printing keeps
  // the PDF. Both are the reader's own words, and neither is under Documents.
  // A cache the system holds open is not worth failing a finished wipe over.
  try {
    new Directory(Paths.cache).deleteContents();
  } catch {
    // Left for the system to reclaim.
  }

  const documents = new Directory(Paths.document);
  for (const entry of documents.list()) {
    // The live database is emptied above rather than deleted, because it is
    // open. Anything else in there is data this wipe promised to remove.
    if (entry.name === 'SQLite' && entry instanceof Directory) {
      for (const file of entry.list()) {
        if (file.name.startsWith('novelman.db')) continue;
        if (file instanceof Directory) file.deleteContents();
        file.delete();
      }
      continue;
    }
    if (entry.name === 'Backups' && entry instanceof Directory) {
      for (const backup of entry.list()) {
        if (backup.name === keepBackup) continue;
        if (backup instanceof Directory) backup.deleteContents();
        backup.delete();
      }
      continue;
    }
    if (entry instanceof Directory) entry.deleteContents();
    entry.delete();
  }
}

function describe(error: unknown, t: TFunction): string {
  if (error instanceof BundleError) {
    return error.code === 'too-new'
      ? t('backup.tooNew', { version: error.detail })
      : t('backup.notABundle');
  }
  return String(error);
}
