import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { buildBundle, openBundle, type OpenedBundle } from './bundle';
import { BUNDLE_EXTENSION, bundleName } from './format';

const SNAPSHOTS = 'snapshots';
const LAST_RUN = 'backup.lastRun';
const FREQUENCY = 'backup.frequency';
/** More than a handful of snapshots is storage spent on the same book. */
const KEEP = 5;

export type Frequency = 'off' | 'daily' | 'weekly';
const INTERVALS: Record<Frequency, number> = {
  off: Infinity,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};

function snapshotsDir(): Directory {
  const dir = new Directory(Paths.document, SNAPSHOTS);
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

export function listSnapshots(): { name: string; uri: string; size: number; at: number }[] {
  return snapshotsDir()
    .list()
    .filter((entry): entry is File => entry instanceof File && entry.name.endsWith(BUNDLE_EXTENSION))
    .map((file) => ({
      name: file.name,
      uri: file.uri,
      size: file.size ?? 0,
      at: file.lastModified ?? 0,
    }))
    .sort((a, b) => b.at - a.at || b.name.localeCompare(a.name));
}

export async function takeSnapshot(): Promise<string> {
  const bundle = await buildBundle();
  const file = new File(snapshotsDir(), bundleName('library'));
  file.create();
  file.write(bundle.body ?? '');
  await AsyncStorage.setItem(LAST_RUN, String(Date.now()));
  prune();
  return file.uri;
}

function prune() {
  for (const stale of listSnapshots().slice(KEEP)) new File(stale.uri).delete();
}

export async function getFrequency(): Promise<Frequency> {
  return ((await AsyncStorage.getItem(FREQUENCY)) as Frequency) ?? 'off';
}

export async function setFrequency(frequency: Frequency) {
  await AsyncStorage.setItem(FREQUENCY, frequency);
}

/**
 * Runs at launch rather than on a timer: an app that isn't open isn't changing
 * anything worth snapshotting, and a background task would need a permission
 * the feature doesn't earn.
 */
export async function snapshotIfDue(): Promise<boolean> {
  const frequency = await getFrequency();
  if (frequency === 'off') return false;
  const last = Number((await AsyncStorage.getItem(LAST_RUN)) ?? 0);
  if (Date.now() - last < INTERVALS[frequency]) return false;
  await takeSnapshot();
  return true;
}

/** Restore Latest exists so the common case needs no file picker at all. */
export function latestSnapshot(): OpenedBundle | null {
  const [newest] = listSnapshots();
  if (!newest) return null;
  return openBundle(new File(newest.uri).bytesSync());
}
