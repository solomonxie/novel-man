import { useCallback, useEffect, useState } from 'react';
import { router, useFocusEffect } from '../navigation/router';
import { useTranslation } from 'react-i18next';

import { isAuto, lastBackupAt, setAuto, useDriveStatus } from '../backup/icloud';
import { subscribeToRestores } from '../backup/changes';
import { Toggle } from '../ui/primitives';

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
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    isAuto().then(setAutoState);
    lastBackupAt().then(setAt);
  }, []);

  useFocusEffect(load);
  // A wipe empties what this is showing, from this very page.
  useEffect(() => subscribeToRestores(load), [load]);

  // Hidden rather than disabled: on Android, or in a build without the native
  // module, this row could never work at all. An unknown status is not that —
  // it is the first ask still out, and a row that isn't there yet reads as a
  // feature that isn't there, which is what makes someone tap the empty space.
  if (status === 'unsupported') return null;

  const blocked = status !== 'available';
  const where = t('backup.icloudWhere');
  const detail =
    status === null
      ? where
      : status === 'driveOff'
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
        // The switch says whether it keeps itself up to date; the row says
        // what is up there, and how to come back from any of it.
        onPress={blocked ? undefined : () => router.push('/settings/icloud-backups')}
        disabled={blocked || busy}
      />
    </>
  );
}
