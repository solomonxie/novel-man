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
