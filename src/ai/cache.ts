import { db } from '../db';

const SEPARATOR = String.fromCharCode(0);

/**
 * Cheap, stable and local. Not a cryptographic hash — it only has to tell two
 * different prompts apart, and a 27MB manuscript can't afford anything slower.
 */
export function contentHash(...parts: string[]): string {
  const joined = parts.join(SEPARATOR);
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < joined.length; i++) {
    const code = joined.charCodeAt(i);
    a = Math.imul(a ^ code, 0x01000193) >>> 0;
    b = Math.imul(b + code + i, 0x85ebca6b) >>> 0;
  }
  return `${joined.length.toString(36)}-${a.toString(36)}-${b.toString(36)}`;
}

export async function readCache(hash: string): Promise<string | null> {
  const database = await db();
  const row = await database.getFirstAsync<{ response: string }>(
    'SELECT response FROM ai_cache WHERE hash = ?',
    hash
  );
  return row?.response ?? null;
}

/** Answers are cheap to keep and cheaper to re-read, but not free to keep forever. */
const MAX_ROWS = 5000;

export async function writeCache(hash: string, kind: string, response: string) {
  const database = await db();
  await database.runAsync(
    `INSERT INTO ai_cache (hash, kind, response, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(hash) DO UPDATE SET response = excluded.response, created_at = excluded.created_at`,
    hash,
    kind,
    response,
    Date.now()
  );
  // Trimmed here rather than behind a button: an unbounded table nobody can
  // see is worse than a bound nobody has to think about. Sampled, because a
  // 500-chapter run would otherwise pay for the sweep 500 times.
  if (Math.random() < 0.02) await prune(database);
}

async function prune(database: Awaited<ReturnType<typeof db>>) {
  await database.runAsync(
    `DELETE FROM ai_cache WHERE hash IN (
       SELECT hash FROM ai_cache ORDER BY created_at DESC LIMIT -1 OFFSET ?)`,
    MAX_ROWS
  );
}

