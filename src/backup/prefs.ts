import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadAppearance } from '../theme/appearance';

/**
 * Preferences are whatever the app has put in AsyncStorage — appearance,
 * reading settings, snapshot frequency. Credentials are not here to be
 * skipped: keys and bucket secrets live in the keychain and never travel.
 */
const SKIP = new Set(['backup.lastRun', 'icloud.restoredAt', 'icloud.pendingApplied']);

export async function readPrefs(): Promise<Record<string, string>> {
  const keys = (await AsyncStorage.getAllKeys()).filter((key) => !SKIP.has(key));
  const pairs = await AsyncStorage.multiGet(keys);
  const prefs: Record<string, string> = {};
  for (const [key, value] of pairs) if (value !== null) prefs[key] = value;
  return prefs;
}

/** A restored preference has to reach the running app, not just the store. */
export async function writePrefs(prefs: Record<string, string>) {
  const entries = Object.entries(prefs).filter(([key]) => !SKIP.has(key));
  if (!entries.length) return;
  await AsyncStorage.multiSet(entries);
  await loadAppearance();
}
