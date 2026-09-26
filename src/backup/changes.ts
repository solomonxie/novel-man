import AsyncStorage from '@react-native-async-storage/async-storage';

type Listener = () => void;
const listeners = new Set<Listener>();

/**
 * One signal for "the user changed something worth backing up". The database
 * raises it from its single write path, so no future query has to remember
 * to; the preference stores, which are not in the database, raise it by hand.
 */
export function subscribeToChanges(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function noticeChange() {
  for (const listener of listeners) listener();
  void bump();
}

/**
 * Which state of the library a backup was taken of. A backup used to find out
 * whether it had anything new to say by building the whole bundle and hashing
 * it — ten seconds of work on an untouched library, thrown away at the end.
 * This answers the same question in two small reads, before any of it starts.
 *
 * A token rather than a count, because a count in memory starts again at zero
 * on the next launch and would read as "nothing has changed since".
 */
const TOKEN = 'backup.token';
const markOf = (who: string) => `backup.token.${who}`;

let token: string | null = null;
/** Whether the current token is already newer than every backup's mark. */
let ahead = false;

async function bump(): Promise<void> {
  if (ahead) return;
  ahead = true;
  token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  await AsyncStorage.setItem(TOKEN, token);
}

export async function libraryToken(): Promise<string> {
  token ??= (await AsyncStorage.getItem(TOKEN)) ?? 'first';
  return token;
}

/** Null until this destination has ever been written to. */
export async function backedUpAt(who: string): Promise<string | null> {
  return AsyncStorage.getItem(markOf(who));
}

/**
 * Recorded against the token read before the bundle was built, so a change
 * made while it was building is still a change the next backup will see.
 */
export async function markBackedUp(who: string, at: string): Promise<void> {
  ahead = false;
  await AsyncStorage.setItem(markOf(who), at);
}

const afterRestore = new Set<Listener>();

/**
 * Everything rewritten from somewhere no screen controls: the launch pull, a
 * bucket sync, a file chosen in a settings section of the page already showing
 * the books — or a wipe, which empties the same tables from the same page.
 * Waiting for a focus that never comes is how a restored library stays
 * invisible until the app is reopened, and how a switch someone just turned
 * off by deleting everything stays looking on.
 */
export function subscribeToRestores(listener: Listener): () => void {
  afterRestore.add(listener);
  return () => afterRestore.delete(listener);
}

export function noticeRestore() {
  for (const listener of afterRestore) listener();
}
