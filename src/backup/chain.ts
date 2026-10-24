import type { BundledBook, Snapshot } from './format';

/** The heavy rows a daily copy leaves to its weekly one. Kept in step with `HEAVY_BOOK_TABLES`. */
export const HEAVY_CARRIED = [
  'chapter_versions',
  'translation_units',
  'translation_memory',
  'verses',
  'images',
  'mentions',
] as const;

export type Opened = {
  snapshot: Snapshot;
  assets: Record<string, Uint8Array>;
  bytes: Uint8Array;
};

/**
 * A daily copy and its weekly one, as the one library they describe that day.
 * A book the daily holds whole wins; one it holds light takes its text,
 * chapters, heavy rows and files from the weekly; one it does not hold is the
 * weekly's, at the day's reading position. A book the weekly had and the day
 * did not is gone.
 */
export function withBase(daily: Opened, base: Opened): Opened {
  const changes = daily.snapshot.changes;
  if (!changes) return daily;
  const weekly = new Map(base.snapshot.books.map((held) => [held.book.id, held]));
  const changed = new Map(daily.snapshot.books.map((held) => [held.book.id, held]));
  const assets: Record<string, Uint8Array> = {};
  const take = (from: Opened, path: string | undefined) => {
    if (path && from.assets[path]) assets[path] = from.assets[path];
  };
  const takeAll = (from: Opened, held: BundledBook) => {
    take(from, held.assets?.cover);
    take(from, held.assets?.source);
    for (const path of Object.values(held.assets?.portraits ?? {})) take(from, path);
    for (const path of held.assets?.pictures ?? []) take(from, path);
  };

  const books: BundledBook[] = [];
  for (const id of changes.present) {
    const now = changed.get(id);
    const then = weekly.get(id);
    if (now && !now.fromBase) {
      takeAll(daily, now);
      books.push(now);
    } else if (now && then) {
      const carried = { ...(now.carried ?? {}) };
      for (const table of HEAVY_CARRIED) {
        if (then.carried?.[table]) carried[table] = then.carried[table];
      }
      takeAll(daily, now);
      take(base, then.assets?.source);
      for (const path of then.assets?.pictures ?? []) take(base, path);
      const { fromBase: _, ...rest } = now;
      books.push({
        ...rest,
        text: then.text,
        hints: then.hints,
        chapters: then.chapters,
        carried,
        assets: { ...now.assets, source: then.assets?.source, pictures: then.assets?.pictures },
      });
    } else if (then) {
      takeAll(base, then);
      books.push({ ...then, offset: changes.offsets[id] ?? then.offset });
    }
  }
  const { changes: _, ...snapshot } = daily.snapshot;
  return { snapshot: { ...snapshot, books }, assets, bytes: daily.bytes };
}
