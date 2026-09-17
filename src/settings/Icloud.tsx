import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { isAuto, lastBackupAt, setAuto, useDriveStatus } from '../backup/icloud';
import { waitingCount } from '../backup/pending';
import { Row, Toggle } from '../ui/primitives';

/**
 * The destination that outlives the app, so it sits above the buckets — and it
 * is one switch, not a menu: on means every change ends up there, off means
 * nothing does. A state the user cannot fix gets a reason and no instruction;
 * an imperative they can't carry out is worse than silence, because they try
 * it. Rows rather than a section of its own: to a reader this and a bucket are
 * two answers to the same question.
 */
export function IcloudRows() {
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
      <Toggle
        label={t('backup.icloud')}
        detail={detail}
        directions={status === 'driveOff' ? t('backup.icloudDirections') : undefined}
        value={auto}
        onChange={toggle}
        disabled={blocked || busy}
      />
      {waiting > 0 ? (
        <Row label={t('backup.waiting', { count: waiting })} detail={t('backup.waitingDetail')} />
      ) : null}
    </>
  );
}
