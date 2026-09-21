import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Paths } from '../storage/fs';

import { drive, type DriveFile, type DriveStatus } from '../../modules/icloud';
import { contentHash } from '../ai/cache';
import { lastUploadedAnywhere, lastUploadHash, recordUpload } from '../db/jobs';
import { listBookIds } from '../db/repo';
import { buildBundle, fingerprint, openBundle } from './bundle';
import { bundleName, isBundleName } from './format';
import { subscribeToChanges } from './changes';
import { restoreBundle, type RestoreReport } from './restore';

const AUTO = 'icloud.auto';
const RESTORED = 'icloud.restoredAt';
const STAGED = 'icloud-upload.zip';
/**
 * One file per month, overwritten all month long: `202609-library.zip`. This
 * is not a version history and was never meant to be one — it exists so that
 * deleting the app doesn't delete the work, and for that the newest copy is
 * the answer. A file per write would ask the reader to choose between a
 * thousand of them; a file per month asks them to choose between twelve, which
 * is a question someone can actually answer when a month of work went wrong.
 */
const backupName = () => bundleName('library');
/**
 * Reuses the upload ledger the bucket sync already keeps; there is no bucket.
 * Keyed by the file name, so a new month is itself a reason to write — the
 * first change of March writes March's file rather than finding February's
 * hash unchanged and skipping.
 */
const LEDGER = 'icloud';

let running = false;

export type { DriveFile, DriveStatus };

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

/** Across months: on the 1st, the last backup is still last month's. */
export async function lastBackupAt(): Promise<number | null> {
  return lastUploadedAnywhere(LEDGER);
}

/** The native side works in paths, not URIs — and a URI can be percent-encoded. */
function nativePath(file: File): string {
  return decodeURIComponent(file.uri.replace('file://', ''));
}


/**
 * The manuscripts stay out of it. Notes, profiles, structure, progress and
 * settings are what the reader made and what a reinstall would otherwise
 * lose; the books themselves came from files they still have.
 */
export async function backUp(): Promise<boolean> {
  // Recording the upload is itself a write, so without this the backup would
  // schedule the next one forever. It also keeps two from overlapping.
  if (running) return false;
  if (!drive || (await refreshDriveStatus()) !== 'available') return false;
  running = true;
  try {
    const name = backupName();
    const bundle = await buildBundle(undefined, { includeText: false });
    const body = bundle.body as Uint8Array;
    const hash = contentHash('icloud', fingerprint(body));
    if ((await lastUploadHash(LEDGER, name)) === hash) return false;

    const staged = new File(Paths.cache, STAGED);
    if (staged.exists) staged.delete();
    staged.create();
    staged.write(body);
    try {
      await drive.copyIn(nativePath(staged), name);
    } finally {
      staged.delete();
    }
    await recordUpload(LEDGER, name, hash);
    await prune();
    return true;
  } finally {
    running = false;
  }
}

/**
 * The user pays for iCloud, so a count is what bounds the bill — ten days of
 * daily copies, and the eleventh takes the oldest with it. The bucket tier
 * keeps everything instead; that is the one that answers "what did this look
 * like in March".
 *
 * Only ever deletes bundles this app named. A file someone dropped in the
 * folder themselves is not ours to tidy up.
 */
const KEEP = 10;

async function prune(): Promise<void> {
  if (!drive?.list || !drive.remove) return;
  try {
    const files = (await drive.list())
      .filter((file) => !file.name.includes('/') && isBundleName(file.name))
      .sort((a, b) => b.modifiedAt - a.modifiedAt);
    for (const file of files.slice(KEEP)) await drive.remove(file.name);
  } catch {
    // A backup that was written is a backup that worked; tidying is not.
  }
}

/**
 * Every backup in the container, newest first — the ten the app keeps, and
 * anything a reader dropped in the folder themselves.
 */
export async function listBackups(): Promise<DriveFile[]> {
  if (!drive?.list) return [];
  return (await drive.list())
    .filter((file) => isBundleName(file.name))
    .sort((a, b) => b.modifiedAt - a.modifiedAt);
}

/**
 * One of them, as bytes. It comes down through a file because that is what
 * the native side speaks, and because a bundle iCloud has only a placeholder
 * for has to be pulled down before it can be read at all.
 */
export async function readBackup(name: string): Promise<Uint8Array> {
  if (!drive) throw new Error('unsupported');
  const staged = new File(Paths.cache, 'icloud-restore.zip');
  if (staged.exists) staged.delete();
  await drive.copyOut(name, nativePath(staged));
  try {
    return staged.bytesSync();
  } finally {
    staged.delete();
  }
}

export async function removeBackup(name: string): Promise<void> {
  if (drive?.remove) await drive.remove(name);
}

export async function backUpIfAuto(): Promise<void> {
  if (!(await isAuto())) return;
  await backUp();
}

/**
 * A change is a write, and the wait is what makes that affordable: importing a
 * novel is thousands of writes, and typing a note is one every keystroke, so
 * the backup runs once the writing has stopped rather than once per row.
 */
const QUIET = 8000;
let pending: ReturnType<typeof setTimeout> | null = null;

function schedule() {
  if (running) return;
  if (pending) clearTimeout(pending);
  // Nothing is awaited anywhere in here: a backup never makes anyone wait,
  // and a failed one is answered by the next change, not by an alert.
  pending = setTimeout(() => {
    pending = null;
    backUpIfAuto().catch(() => undefined);
  }, QUIET);
}

/**
 * Backs up whenever the data changes, and again on the way out — leaving the
 * app is the one moment a pending wait would otherwise be lost, and a real
 * background task would need a permission this feature hasn't earned.
 */
export function watchForChanges(): () => void {
  const unsubscribe = subscribeToChanges(schedule);
  const subscription = AppState.addEventListener('change', (next) => {
    if (next !== 'background') return;
    if (pending) clearTimeout(pending);
    pending = null;
    backUpIfAuto().catch(() => undefined);
  });
  return () => {
    unsubscribe();
    subscription.remove();
  };
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
