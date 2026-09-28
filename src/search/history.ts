import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * What this reader has looked for, so the box is not blank the second time.
 *
 * Kept on the device and nowhere else: it is a list of what somebody has been
 * reading about, which is not a thing to sync, back up or hand to a catalog.
 *
 * Only a query somebody acted on is remembered — the return key, or a result
 * taken up. Recording every settled keystroke would fill this with the
 * prefixes of one search, and `pri`, `prid`, `pride` are not three things
 * anybody looked for.
 */
const KEY = 'search.recent';

/** Enough to find last week's book, few enough to read without scrolling. */
const KEPT = 12;

export async function recentSearches(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === 'string').slice(0, KEPT);
  } catch {
    return [];
  }
}

/** Newest first, and a repeat moves rather than doubles. */
export async function remember(query: string): Promise<string[]> {
  const asked = query.trim();
  if (!asked) return recentSearches();
  const had = await recentSearches();
  const next = [asked, ...had.filter((entry) => entry.toLowerCase() !== asked.toLowerCase())]
    .slice(0, KEPT);
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // A history that cannot be written is not a reason to fail a search.
  }
  return next;
}

export async function forgetSearches(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // As above.
  }
}
