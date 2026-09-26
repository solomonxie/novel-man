import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The shelves this phone has read before, so reading them again is one tap.
 *
 * An import from Goodreads is not a one-off: books are added there for years
 * after, and the whole reason to prefer the feed over the export file is that
 * it can be read again. Asking someone to find their profile link a second
 * time throws that away.
 *
 * What is kept is deliberately not the address that was pasted. A feed url for
 * a private profile carries a `key=` that reads that profile's whole library,
 * and everything in AsyncStorage travels in a backup — where this app promises
 * no credential ever goes. So the number and the name are kept, the public
 * feed is rebuilt from them, and a private shelf is pasted again.
 */
const KEY = 'goodreads.shelves';
/** Enough for a person and the shelves they actually reread. */
const KEEP = 6;

export type SavedShelf = {
  /** Their profile number, which is the whole of what a feed needs. */
  id: string;
  /** "Solo's bookshelf: all", as the feed titled itself. */
  name: string;
  shelf: string | null;
  books: number;
  at: number;
};

export function feedUrlFor(saved: Pick<SavedShelf, 'id' | 'shelf'>): string {
  const shelf = saved.shelf ? `?shelf=${encodeURIComponent(saved.shelf)}` : '';
  return `https://www.goodreads.com/review/list_rss/${saved.id}${shelf}`;
}

export async function savedShelves(): Promise<SavedShelf[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as SavedShelf[]) : [];
    return Array.isArray(parsed) ? parsed.filter((entry) => entry?.id) : [];
  } catch {
    return [];
  }
}

/** Newest first, one row per shelf — reading it again updates what it says. */
export async function rememberShelf(entry: SavedShelf): Promise<void> {
  const others = (await savedShelves()).filter(
    (saved) => !(saved.id === entry.id && saved.shelf === entry.shelf)
  );
  await AsyncStorage.setItem(KEY, JSON.stringify([entry, ...others].slice(0, KEEP)));
}

export async function forgetShelf(entry: Pick<SavedShelf, 'id' | 'shelf'>): Promise<void> {
  const left = (await savedShelves()).filter(
    (saved) => !(saved.id === entry.id && saved.shelf === entry.shelf)
  );
  await AsyncStorage.setItem(KEY, JSON.stringify(left));
}
