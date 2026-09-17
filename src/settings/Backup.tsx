import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { File } from 'expo-file-system';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import { buildBundle, openBundle } from '../backup/bundle';
import { restoreBundle, type RestoreReport } from '../backup/restore';
import {
  getFrequency,
  latestSnapshot,
  listSnapshots,
  setFrequency,
  takeSnapshot,
  type Frequency,
} from '../backup/snapshots';
import { BUNDLE_EXTENSION, BundleError } from '../backup/format';
import { isAuto, lastBackupAt, setAuto, useDriveStatus } from '../backup/icloud';
import { waitingCount } from '../backup/pending';
import { deliver } from '../export/deliver';
import { pickBackupBundle } from '../import/sources/picker';
import { Hint, Row, Section, Toggle } from '../ui/primitives';
import { PickerSheet } from '../ui/PickerSheet';
import { space, usePalette } from '../theme';

const FREQUENCIES: Frequency[] = ['off', 'daily', 'weekly'];

export function BackupSettings() {
  const { t } = useTranslation();
  const palette = usePalette();
  const [frequency, setStoredFrequency] = useState<Frequency>('off');
  const [snapshots, setSnapshots] = useState(() => [] as ReturnType<typeof listSnapshots>);
  const [frequencyOpen, setFrequencyOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<RestoreReport | null>(null);

  const load = useCallback(() => {
    getFrequency().then(setStoredFrequency);
    setSnapshots(listSnapshots());
  }, []);

  useFocusEffect(load);

  async function guard(work: () => Promise<void>) {
    setBusy(true);
    setReport(null);
    try {
      await work();
    } catch (error) {
      Alert.alert(t('backup.failed'), describe(error, t));
    } finally {
      setBusy(false);
      load();
    }
  }

  const exportLibrary = () =>
    guard(async () => {
      await deliver(await buildBundle(), 'share');
    });

  const snapshotNow = () =>
    guard(async () => {
      await takeSnapshot();
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
      if (!picked.name.endsWith(BUNDLE_EXTENSION)) throw new BundleError('not-a-bundle');
      confirmRestore(() => openBundle(new File(picked.uri).bytesSync()));
    });
  }

  return (
    <>
      <IcloudSection />

      <Section title={t('backup.file')}>
        <Row label={t('backup.exportLibrary')} onPress={exportLibrary} />
        <Row label={t('backup.restoreFromFile')} onPress={restoreFromFile} last />
      </Section>
      <Hint>{t('backup.fileHint')}</Hint>

      <Section title={t('backup.onDevice')}>
        <Row
          label={t('backup.frequency')}
          value={t(`backup.freq_${frequency}`)}
          onPress={() => setFrequencyOpen(true)}
        />
        <Row label={t('backup.snapshotNow')} onPress={snapshotNow} />
        <Row
          label={t('backup.restoreLatest')}
          value={snapshots[0] ? new Date(snapshots[0].at).toLocaleString() : t('backup.none')}
          onPress={snapshots[0] ? () => confirmRestore(latestSnapshot) : undefined}
          last
        />
      </Section>
      <Hint>{t('backup.deviceHint')}</Hint>


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

      <PickerSheet
        visible={frequencyOpen}
        title={t('backup.frequency')}
        options={FREQUENCIES.map((option) => ({ id: option, label: t(`backup.freq_${option}`) }))}
        selectedId={frequency}
        onPick={async (option) => {
          await setFrequency(option as Frequency);
          setStoredFrequency(option as Frequency);
          setFrequencyOpen(false);
        }}
        onClose={() => setFrequencyOpen(false)}
      />
    </>
  );
}

/**
 * The one destination that outlives the app, so it sits first — and it is one
 * switch, not a menu: on means every launch ends up there, off means nothing
 * does. A state the user cannot fix gets a reason and no instruction; an
 * imperative they can't carry out is worse than silence, because they try it.
 */
function IcloudSection() {
  const { t } = useTranslation();
  const status = useDriveStatus();
  const [auto, setAutoState] = useState(false);
  const [at, setAt] = useState<number | null>(null);
  const [waiting, setWaiting] = useState(0);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    isAuto().then(setAutoState);
    lastBackupAt().then(setAt);
    waitingCount().then(setWaiting);
  }, []);

  useFocusEffect(load);

  // Hidden rather than disabled: on Android, or in Expo Go where the native
  // module isn't built in, this row could never work at all.
  if (!status || status === 'unsupported') return null;

  const blocked = status !== 'available';
  const where = t('backup.icloudWhere');
  const detail =
    status === 'driveOff'
      ? t('backup.icloudOff')
      : status === 'notEntitled'
        ? t('backup.icloudUnsigned')
        : status === 'notReady'
          ? t('backup.icloudNotReady')
          : at
            ? `${where} · ${new Date(at).toLocaleString()}`
            : where;

  async function toggle(next: boolean) {
    setAutoState(next);
    setBusy(true);
    try {
      await setAuto(next);
    } finally {
      setBusy(false);
      load();
    }
  }

  return (
    <>
      <Section title={t('backup.survives')}>
        <Toggle
          label={t('backup.icloud')}
          detail={detail}
          directions={status === 'driveOff' ? t('backup.icloudDirections') : undefined}
          value={auto}
          onChange={toggle}
          disabled={blocked || busy}
          last={waiting === 0}
        />
        {waiting > 0 ? (
          <Row label={t('backup.waiting', { count: waiting })} detail={t('backup.waitingDetail')} last />
        ) : null}
      </Section>
      {/* A blocked row has already said what is wrong; saying it twice reads as two faults. */}
      {blocked ? null : <Hint>{t('backup.icloudHint')}</Hint>}
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
