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
}

const afterRestore = new Set<Listener>();

/**
 * A restore rewrites the shelf from somewhere no screen controls — the launch
 * pull, a bucket sync, a file chosen in a settings section of the page already
 * showing the books. Waiting for a focus that never comes is how a restored
 * library stays invisible until the app is reopened.
 */
export function subscribeToRestores(listener: Listener): () => void {
  afterRestore.add(listener);
  return () => afterRestore.delete(listener);
}

export function noticeRestore() {
  for (const listener of afterRestore) listener();
}
