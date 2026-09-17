import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Paths } from 'expo-file-system';

import { drive, type DriveStatus } from '../../modules/icloud';
import { contentHash } from '../ai/cache';
import { lastUploadedAt, lastUploadHash, recordUpload } from '../db/jobs';
import { listBookIds } from '../db/repo';
import { buildBundle, fingerprint, openBundle } from './bundle';
import { restoreBundle, type RestoreReport } from './restore';

const AUTO = 'icloud.auto';
const RESTORED = 'icloud.restoredAt';
/** Reuses the upload ledger the bucket sync already keeps; there is no bucket. */
const LEDGER = { connection: 'icloud', key: 'library' };
const STAGED = 'icloud-upload.nmbak';

export type { DriveStatus };

export async function isAuto(): Promise<boolean> {
  return (await AsyncStorage.getItem(AUTO)) === 'on';
}

/**
 * The switch is the whole interface: on means every change ends up there, off
 * means nothing does. Flipping it on backs up at once rather than waiting for
 * a next launch that could be days away — which is also how "did that work?"
 * gets answered without a Sync Now button next to it.
 */
export async function setAuto(on: boolean) {
  await AsyncStorage.setItem(AUTO, on ? 'on' : 'off');
  if (on) await backUp();
}

// The status can only change while the app is in the background — the fix for
// every blocked state lives in the Settings app — so it is read once and
// re-read on the way back in.
let status: DriveStatus | null = null;
const listeners = new Set<() => void>();

export async function refreshDriveStatus(): Promise<DriveStatus> {
  status = drive ? await drive.status() : 'unsupported';
  for (const listener of listeners) listener();
  return status;
}

export function useDriveStatus(): DriveStatus | null {
  const [current, setCurrent] = useState(status);
  useEffect(() => {
    const listener = () => setCurrent(status);
    listeners.add(listener);
    void refreshDriveStatus();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refreshDriveStatus();
    });
    return () => {
      listeners.delete(listener);
      subscription.remove();
    };
  }, []);
  return current;
}

export async function lastBackupAt(): Promise<number | null> {
  return lastUploadedAt(LEDGER.connection, LEDGER.key);
}

/** The native side works in paths, not URIs — and a URI can be percent-encoded. */
function nativePath(file: File): string {
  return decodeURIComponent(file.uri.replace('file://', ''));
}

/** Month folders and a dated name, because this folder is one the user opens. */
function keyFor(at = new Date()): string {
  const day = at.toISOString().slice(0, 10);
  return `${day.slice(0, 7)}/novel-man-${day}.nmbak`;
}

/**
 * The manuscripts stay out of it. Notes, profiles, structure, progress and
 * settings are what the reader made and what a reinstall would otherwise
 * lose; the books themselves came from files they still have.
 */
export async function backUp(): Promise<boolean> {
  if (!drive || (await refreshDriveStatus()) !== 'available') return false;

  const bundle = await buildBundle(undefined, { includeText: false });
  const body = bundle.body as Uint8Array;
  const hash = contentHash('icloud', fingerprint(body));
  if ((await lastUploadHash(LEDGER.connection, LEDGER.key)) === hash) return false;

  const staged = new File(Paths.cache, STAGED);
  if (staged.exists) staged.delete();
  staged.create();
  staged.write(body);
  try {
    await drive.copyIn(nativePath(staged), keyFor());
  } finally {
    staged.delete();
  }
  await recordUpload(LEDGER.connection, LEDGER.key, hash);
  return true;
}

export async function backUpIfAuto(): Promise<void> {
  if (!(await isAuto())) return;
  await backUp();
}

/**
 * Leaving the app is the other honest moment: a launch-only backup would
 * always be one session behind, and a real background task would need a
 * permission this feature hasn't earned.
 */
export function backUpWhenLeaving(): () => void {
  const subscription = AppState.addEventListener('change', (next) => {
    if (next === 'background') void backUpIfAuto();
  });
  return () => subscription.remove();
}

/**
 * A fresh install, once, before the shelf has anything on it — no prompt. The
 * user has no context for a "restore from backup?" dialog on first launch,
 * and getting their work back is the entire point of having backed it up.
 */
export async function restoreOnLaunch(): Promise<RestoreReport | null> {
  if (!drive) return null;
  if (await AsyncStorage.getItem(RESTORED)) return null;
  if ((await listBookIds()).length > 0) return null;
  if ((await refreshDriveStatus()) !== 'available') return null;

  const newest = await drive.latest();
  if (!newest) return null;

  const staged = new File(Paths.cache, STAGED);
  await drive.copyOut(newest.name, nativePath(staged));
  const bytes = staged.bytesSync();
  staged.delete();

  const report = await restoreBundle(openBundle(bytes), { settings: true });
  await AsyncStorage.setItem(RESTORED, String(Date.now()));
  // The backup only exists because the switch was on before the reinstall.
  await AsyncStorage.setItem(AUTO, 'on');
  return report;
}
