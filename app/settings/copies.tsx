import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, View } from 'react-native';
import { router, Stack, useFocusEffect } from '../../src/navigation/router';
import { useTranslation } from 'react-i18next';

import { buildBundle, buildPlainCopy, openBundle, type OpenedBundle } from '../../src/backup/bundle';
import { keptExports, localCopies, totalBytes, type LocalCopy } from '../../src/backup/copies';
import { lastAttempt, type Attempt } from '../../src/backup/attempts';
import { isAuto, lastBackupAt, listBackups, type DriveFile } from '../../src/backup/icloud';
import { trashCount } from '../../src/backup/trash';
import { listConnections } from '../../src/cloud/connections';
import type { Connection } from '../../src/cloud/providers';
import { restoreBundle, type RestoreReport } from '../../src/backup/restore';
import { BundleError, isBundleName } from '../../src/backup/format';
import { RestoreReportView } from '../../src/settings/RestoreReport';
import { pickBackupBundle } from '../../src/import/sources/picker';
import { deliver } from '../../src/export/deliver';
import { File } from '../../src/storage/fs';
import { PickerSheet, type PickerOption } from '../../src/ui/PickerSheet';
import { Hint, Row, Section } from '../../src/ui/primitives';
import { sizeOf } from '../../src/ui/fields';
import { space, usePalette } from '../../src/theme';

/**
 * Every copy of this library that exists, on one page.
 *
 * The app was already careful — a snapshot before every migration, a rolling
 * daily bundle, a verified copy before a wipe, ten in iCloud — and said so
 * nowhere, which is the same as not having done it. Nobody trusts a promise
 * about backups; they trust a list of files with dates on them, a size beside
 * each, and a way to open one. So this page states what is kept and then proves
 * it, and every number on it is read off the disk at the moment you look.
 */
const ALL = 'all';

export default function YourCopies() {
  const { t } = useTranslation();
  const palette = usePalette();
  const [local, setLocal] = useState<LocalCopy[]>([]);
  const [kept, setKept] = useState<LocalCopy[]>([]);
  const [cloud, setCloud] = useState<DriveFile[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [icloudOn, setIcloudOn] = useState(false);
  const [icloudAt, setIcloudAt] = useState<number | null>(null);
  const [attempts, setAttempts] = useState<{ icloud: Attempt | null; local: Attempt | null }>({
    icloud: null,
    local: null,
  });
  const [deleted, setDeleted] = useState(0);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<RestoreReport | null>(null);
  // The opened bundle, not its bytes: parsing a library's snapshot twice —
  // once to list what is in it, once to restore one of them — is seconds of a
  // phone's time for an answer it already had.
  const [choosing, setChoosing] = useState<{ options: PickerOption[]; opened: OpenedBundle } | null>(
    null
  );

  const load = useCallback(() => {
    setLocal(localCopies());
    setKept(keptExports());
    isAuto().then(setIcloudOn);
    lastBackupAt().then(setIcloudAt);
    trashCount().then(setDeleted);
    listConnections().then(setConnections);
    Promise.all([lastAttempt('icloud'), lastAttempt('local')]).then(([icloud, both]) =>
      setAttempts({ icloud, local: both })
    );
    // The only slow read on the page, and the only one that can fail: it goes
    // out to the ubiquity container. Everything above is already on screen.
    listBackups().then(setCloud).catch(() => setCloud([]));
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
   * A bundle holding one book restores it; a bundle holding a library asks
   * which. Coming back from a whole backup to get one book used to mean
   * restoring all nine hundred alongside the ones already here.
   */
  function restoreFromFile() {
    void guard(async () => {
      const picked = await pickBackupBundle();
      if (!picked) return;
      if (!isBundleName(picked.name)) throw new BundleError('not-a-bundle');
      const opened = openBundle(new File(picked.uri).bytesSync());
      if (opened.snapshot.books.length <= 1) {
        confirmRestore(opened);
        return;
      }
      setChoosing({
        opened,
        options: [
          { id: ALL, label: t('copies.restoreAll', { count: opened.snapshot.books.length }) },
          ...opened.snapshot.books.map((held) => ({
            id: held.book.id,
            label: held.book.title,
            detail: held.book.author ?? undefined,
          })),
        ],
      });
    });
  }

  function confirmRestore(opened: OpenedBundle, only?: string) {
    Alert.alert(t('backup.restore'), t('backup.restoreConfirm'), [
      { text: t('settings.cancel'), style: 'cancel' },
      {
        text: t('backup.restore'),
        onPress: () =>
          void guard(async () => {
            setReport(
              await restoreBundle(opened, { only: only ? new Set([only]) : undefined })
            );
          }),
      },
    ]);
  }

  const localSize = totalBytes(local);

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}
    >
      <Stack.Screen options={{ title: t('copies.title'), headerBackTitle: ' ' }} />

      <Hint>{t('copies.promise')}</Hint>

      {attempts.icloud && !attempts.icloud.ok ? (
        <Section title={t('copies.trouble')}>
          <Row
            label={t('copies.icloudFailed')}
            detail={attempts.icloud.error ?? undefined}
            value={new Date(attempts.icloud.at).toLocaleDateString()}
            alarm
            last
          />
        </Section>
      ) : null}

      {!icloudOn ? <Hint>{t('copies.nothingLeaves')}</Hint> : null}

      <Section
        title={t('copies.onPhone', {
          count: local.length,
          size: sizeOf(localSize) || '0 KB',
        })}
      >
        {local.length === 0 ? (
          <Row label={t('copies.noneYet')} last />
        ) : (
          local.map((copy, index) => (
            <Row
              key={copy.name}
              label={t(`copies.kind_${copy.kind}`)}
              detail={copy.name}
              value={sizeOf(copy.bytes)}
              onPress={() =>
                void deliver({ fileName: copy.name, mimeType: 'application/zip', uri: copy.uri }, 'share')
              }
              last={index === local.length - 1}
            />
          ))
        )}
      </Section>
      <Hint>{t('copies.onPhoneHint')}</Hint>

      <Section title={t('copies.offPhone')}>
        <Row
          label={t('backup.icloud')}
          detail={
            icloudOn
              ? t('copies.icloudCount', { count: cloud.length })
              : t('copies.icloudOff')
          }
          value={icloudAt ? new Date(icloudAt).toLocaleDateString() : t('copies.never')}
          alarm={!icloudOn}
          onPress={() => router.push('/settings/icloud-backups')}
        />
        {connections.map((connection) => (
          <Row
            key={connection.id}
            label={connection.name}
            detail={t('copies.bucketHint')}
            value="›"
            onPress={() => router.push(`/settings/cloud-library?id=${connection.id}`)}
          />
        ))}
        <Row
          label={t('trash.title')}
          detail={t('copies.deletedHint')}
          value={`${deleted}`}
          onPress={() => router.push('/settings/deleted')}
          last
        />
      </Section>

      <Section title={t('copies.take')}>
        <Row
          label={t('backup.exportLibrary')}
          detail={t('copies.bundleHint')}
          link
          onPress={() => void guard(async () => void (await deliver(await buildBundle(), 'share')))}
        />
        <Row
          label={t('copies.exportPlain')}
          detail={t('copies.exportPlainHint')}
          link
          onPress={() => void guard(async () => void (await deliver(await buildPlainCopy(), 'share')))}
        />
        <Row
          label={t('backup.restoreFromFile')}
          detail={t('copies.restoreHint')}
          link
          onPress={restoreFromFile}
          last
        />
      </Section>

      {busy ? <ActivityIndicator style={{ marginTop: space.xl }} /> : null}
      {report ? <RestoreReportView report={report} /> : null}

      {kept.length ? (
        <>
          <Section title={t('copies.kept')}>
            {kept.map((copy, index) => (
              <Row
                key={copy.name}
                label={copy.name}
                value={sizeOf(copy.bytes)}
                onPress={() =>
                  void deliver(
                    { fileName: copy.name, mimeType: 'application/octet-stream', uri: copy.uri },
                    'share'
                  )
                }
                last={index === kept.length - 1}
              />
            ))}
          </Section>
          <Hint>{t('copies.keptHint')}</Hint>
        </>
      ) : null}

      <View style={{ height: space.xl }} />

      <PickerSheet
        visible={Boolean(choosing)}
        title={t('copies.restoreWhich')}
        options={choosing?.options ?? []}
        onPick={(id) => {
          const held = choosing;
          setChoosing(null);
          if (held) confirmRestore(held.opened, id === ALL ? undefined : id);
        }}
        onClose={() => setChoosing(null)}
      />
    </ScrollView>
  );
}

function describe(error: unknown, t: ReturnType<typeof useTranslation>['t']): string {
  if (error instanceof BundleError) {
    return error.code === 'too-new'
      ? t('backup.tooNew', { version: error.detail })
      : t('backup.notABundle');
  }
  return String(error);
}
