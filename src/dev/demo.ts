import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * A second, disposable library in the same app.
 *
 * It exists for the App Store: a listing needs screenshots and a review needs
 * something to review, and neither can be the author's own shelf — a real
 * library is half-read books, a rating nobody should see and a note about
 * somebody's funeral. So demo mode is a whole separate library the app can be
 * switched into and out of.
 *
 * **Nothing it does can reach the real library.** That is the only rule here
 * and it is kept by not sharing a single file:
 *
 * - its database is `novelman-demo.db`, a different file in the same folder;
 * - its covers and its manuscripts go in `demo-images` and `demo-sources`.
 *
 * So the real books are not merely hidden while demo mode is on; nothing in
 * demo mode has a path that points at them. Switching back is switching back,
 * and seeding, wiping or corrupting the demo library costs the real one
 * nothing. The keychain is the one thing in common — an API key is per device,
 * not per library, which is what makes the demo able to show the AI features
 * at all.
 */
const KEY = 'demo.mode';

/**
 * Read synchronously by the storage layer, which builds directory names
 * without being able to wait for anything. Loaded once at launch, before the
 * database is opened, and from then on it only changes through `setDemoMode`.
 */
let on = false;
let loaded = false;

export function demoMode(): boolean {
  return on;
}

/**
 * Whether the flag has actually been read off disk yet. The app must not open
 * a database before it knows which one, so this is asserted rather than
 * assumed — `false` here means a bug in the launch order, not "no demo".
 */
export function demoModeKnown(): boolean {
  return loaded;
}

export async function loadDemoMode(): Promise<boolean> {
  try {
    on = (await AsyncStorage.getItem(KEY)) === 'on';
  } catch {
    // A library that cannot be read is the real one. Failing closed here means
    // a broken preference shows the reader their own books, not an empty shelf.
    on = false;
  }
  loaded = true;
  return on;
}

/**
 * Persisted first, then flipped. The caller is responsible for closing the
 * open database and sending the app back to the shelf — see the settings row,
 * which is the only thing that calls this.
 */
export async function setDemoMode(next: boolean): Promise<void> {
  await AsyncStorage.setItem(KEY, next ? 'on' : 'off');
  on = next;
  loaded = true;
}

/** Which database, and which folders. The one place either question is answered. */
export function databaseName(): string {
  return on ? 'novelman-demo.db' : 'novelman.db';
}

export function folderFor(name: string): string {
  return on ? `demo-${name}` : name;
}
