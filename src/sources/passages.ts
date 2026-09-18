import { db } from '../db';

/**
 * What was looked up, kept for reading again. A licensed edition may be asked
 * for a passage and may not be copied wholesale, so this is bounded and stays
 * here: the oldest fall out past the cap, and no backup carries any of it,
 * because a backup is a file that can be handed to somebody else.
 */
export type CachedPassage = { reference: string; text: string; fetchedAt: number };

/** Enough that re-reading what you have been studying is instant. Not a bible. */
const CAP = 500;

/** `John 3:16`, `john 3 :16` and ` JOHN 3:16 ` are one question. */
export function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ').replace(/\s*:\s*/g, ':');
}

export async function cachedPassage(source: string, query: string): Promise<CachedPassage | null> {
  const database = await db();
  const row = await database.getFirstAsync<{ reference: string; text: string; fetched_at: number }>(
    'SELECT reference, text, fetched_at FROM passage_cache WHERE source = ? AND query = ?',
    source, normalizeQuery(query)
  );
  return row ? { reference: row.reference, text: row.text, fetchedAt: row.fetched_at } : null;
}

export async function cachePassage(
  source: string,
  query: string,
  passage: { reference: string; text: string }
): Promise<void> {
  const database = await db();
  await database.runAsync(
    `INSERT OR REPLACE INTO passage_cache (source, query, reference, text, fetched_at)
     VALUES (?, ?, ?, ?, ?)`,
    source, normalizeQuery(query), passage.reference, passage.text, Date.now()
  );
  // Oldest out, so this can never grow into the thing it must not become.
  await database.runAsync(
    `DELETE FROM passage_cache WHERE source = ? AND query NOT IN (
       SELECT query FROM passage_cache WHERE source = ? ORDER BY fetched_at DESC LIMIT ?
     )`,
    source, source, CAP
  );
}

export async function countCached(source: string): Promise<number> {
  const database = await db();
  const row = await database.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM passage_cache WHERE source = ?',
    source
  );
  return row?.n ?? 0;
}

export async function clearCached(source: string): Promise<void> {
  const database = await db();
  await database.runAsync('DELETE FROM passage_cache WHERE source = ?', source);
}
