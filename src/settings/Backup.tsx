import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text } from 'react-native';
import { Directory, Paths } from '../storage/fs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import { backupBeforeRemoval } from '../backup/removal';
import { copiesState, type CopiesState } from '../backup/copies';
import { router, useFocusEffect } from '../navigation/router';
import { Hint, Row, Section } from '../ui/primitives';
import { space, usePalette } from '../theme';
import { db, transaction } from '../db';
import * as SecureStore from '../storage/secrets';
import { resetAppearance } from '../theme/appearance';
import { setUiLanguage } from '../i18n';
import { cancelAllWork } from '../work/queue';
import { seedSystemLists } from '../db/shelves';
import { settled as cloudSettled } from '../cloud/sync';
import { suppressLaunchRestore } from '../backup/icloud';
import { listConnections } from '../cloud/connections';
import { listKeys } from '../ai/keys';
import { noticeChange, noticeRestore, subscribeToRestores } from '../backup/changes';

/**
 * Not a feature called Backup: the answer to "is my work safe", one tap away
 * from the shelf. The row says what is true right now — how many copies there
 * are, when the last one left the phone, or that none has — and the page behind
 * it is the list of files that proves it.
 */
export function BackupSettings({ onRemoved }: { onRemoved?: () => void }) {
  const { t } = useTranslation();
  const palette = usePalette();
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [state, setState] = useState<CopiesState | null>(null);

  const load = useCallback(() => {
    copiesState().then(setState);
  }, []);

  useFocusEffect(load);
  // A wipe empties what this is reporting, from this very page.
  useEffect(() => subscribeToRestores(load), [load]);

  async function guard(work: () => Promise<void>) {
    setBusy(true);
    try {
      await work();
    } catch (error) {
      Alert.alert(t('backup.failed'), String(error));
    } finally {
      setBusy(false);
      load();
    }
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
              // Every screen that is holding something this just deleted —
              // the iCloud switch, the list of buckets — re-reads now rather
              // than the next time somebody happens to navigate to it.
              noticeRestore();
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
      <Section title={t('copies.title')}>
        <Row
          label={t('copies.whatYouHave')}
          detail={state ? stateLine(state, t) : undefined}
          value="›"
          alarm={Boolean(state && (state.failing || (state.books && !state.icloudOn)))}
          onPress={() => router.push('/settings/copies')}
        />
        <Row
          label={t('trash.title')}
          detail={t('copies.deletedHint')}
          value={state ? `${state.deleted}` : ''}
          onPress={() => router.push('/settings/deleted')}
          last
        />
      </Section>
      <Hint>{t('copies.promiseShort')}</Hint>

      {busy || removing ? <ActivityIndicator style={{ marginTop: space.xl }} /> : null}

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
      <Hint>{t('settings.removeAllKeeps')}</Hint>
    </>
  );
}

/**
 * One line, and the worst true thing first: a destination that is failing, then
 * a library that has never left the phone, then work that has not been copied
 * yet, and only then the good news with a date on it.
 */
function stateLine(state: CopiesState, t: TFunction): string {
  if (!state.books) return t('copies.stateEmpty');
  if (state.failing) return t('copies.stateFailing', { reason: state.failing });
  if (!state.icloudOn) return t('copies.stateHereOnly', { count: state.onPhone });
  if (state.behind) return t('copies.stateBehind', { count: state.onPhone });
  return t('copies.stateOk', {
    count: state.onPhone,
    when: state.icloudAt ? new Date(state.icloudAt).toLocaleString() : t('copies.never'),
  });
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
  // A wipe leaves what a fresh install has, and a fresh install has this row.
  await seedSystemLists();

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
