import { db } from '../db';

/**
 * What happened the last time each destination was tried — including the times
 * it failed, which nothing used to record. Every backup path ends in a
 * `.catch(() => undefined)`, on the sound reasoning that a backup must never
 * interrupt someone who is reading; the unsound part was throwing the reason
 * away with the interruption. A destination that has not worked since the 4th
 * looked exactly like one nobody had changed anything in since the 4th.
 */
export type Attempt = {
  destination: string;
  at: number;
  ok: boolean;
  error: string | null;
  bytes: number | null;
};

export type Outcome = {
  ok: boolean;
  error?: unknown;
  bytes?: number;
  /** The bundle written, where the attempt got as far as naming one. */
  name?: string;
  /** What the library measured at the time, so the log traces the work too. */
  books?: number;
  words?: number;
};

/**
 * Two writes of one event. The upsert above is the state — what this
 * destination is doing now, which is what the shelf and the copies page ask
 * for. The append below is the history, which nothing kept: a bundle is
 * overwritten all day and pruned after ten, so by the time someone wonders
 * when a thing was last safe, the only record of it had been written over.
 */
export async function recordAttempt(destination: string, outcome: Outcome): Promise<void> {
  const database = await db();
  const at = Date.now();
  const error = outcome.ok ? null : reasonOf(outcome.error);
  await database.runAsync(
    `INSERT INTO backup_attempts (destination, at, ok, error, bytes) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(destination) DO UPDATE SET
       at = excluded.at, ok = excluded.ok, error = excluded.error, bytes = excluded.bytes`,
    destination,
    at,
    outcome.ok ? 1 : 0,
    error,
    outcome.bytes ?? null
  );
  await appendToLog(database, destination, at, error, outcome);
}

export type LogEntry = Attempt & {
  id: number;
  name: string | null;
  books: number | null;
  words: number | null;
};

/**
 * Append-only, and bounded — a phone is not a log server, and an append-only
 * anything with no end is a slow leak rather than a record. A thousand entries
 * is years of one reader's backups and tens of kilobytes; past that the oldest
 * fall off, which is the whole of the compromise.
 */
const KEEP = 1000;

async function appendToLog(
  database: Awaited<ReturnType<typeof db>>,
  destination: string,
  at: number,
  error: string | null,
  outcome: Outcome
): Promise<void> {
  await database.runAsync(
    `INSERT INTO backup_log (destination, at, ok, error, bytes, name, books, words)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    destination,
    at,
    outcome.ok ? 1 : 0,
    error,
    outcome.bytes ?? null,
    outcome.name ?? null,
    outcome.books ?? null,
    outcome.words ?? null
  );
  // Off the primary key, so trimming costs nothing next to the backup that
  // just ran. Ids only ever climb: `AUTOINCREMENT` never reuses one.
  await database.runAsync(
    'DELETE FROM backup_log WHERE id <= (SELECT MAX(id) FROM backup_log) - ?',
    KEEP
  );
}

/** Newest first, which is the order the question is always asked in. */
export async function readBackupLog(limit = 200): Promise<LogEntry[]> {
  const database = await db();
  const rows = await database.getAllAsync<{
    id: number;
    destination: string;
    at: number;
    ok: number;
    error: string | null;
    bytes: number | null;
    name: string | null;
    books: number | null;
    words: number | null;
  }>('SELECT * FROM backup_log ORDER BY at DESC, id DESC LIMIT ?', limit);
  return rows.map((row) => ({ ...row, ok: row.ok === 1 }));
}

/** One line, because it goes in a row detail. Never the whole stack. */
function reasonOf(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error ?? 'failed');
  return text.replace(/\s+/g, ' ').trim().slice(0, 200) || 'failed';
}

export async function lastAttempt(destination: string): Promise<Attempt | null> {
  const database = await db();
  const row = await database.getFirstAsync<{
    destination: string;
    at: number;
    ok: number;
    error: string | null;
    bytes: number | null;
  }>('SELECT * FROM backup_attempts WHERE destination = ?', destination);
  return row ? { ...row, ok: row.ok === 1 } : null;
}

export async function allAttempts(): Promise<Attempt[]> {
  const database = await db();
  const rows = await database.getAllAsync<{
    destination: string;
    at: number;
    ok: number;
    error: string | null;
    bytes: number | null;
  }>('SELECT * FROM backup_attempts ORDER BY at DESC');
  return rows.map((row) => ({ ...row, ok: row.ok === 1 }));
}

/**
 * Age is not evidence of a problem here, and an alarm on the clock alone would
 * cry wolf at anyone who simply has not changed anything this week — a backup
 * only runs when there is something new to say. What is evidence is a
 * destination that is behind the library *and* has not been tried in an hour:
 * the ordinary wait after a change is eight seconds.
 */
export const OVERDUE_MS = 60 * 60 * 1000;

export function isOverdue(at: number | null, now = Date.now()): boolean {
  return at === null || now - at > OVERDUE_MS;
}
