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

export async function recordAttempt(
  destination: string,
  outcome: { ok: boolean; error?: unknown; bytes?: number }
): Promise<void> {
  const database = await db();
  await database.runAsync(
    `INSERT INTO backup_attempts (destination, at, ok, error, bytes) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(destination) DO UPDATE SET
       at = excluded.at, ok = excluded.ok, error = excluded.error, bytes = excluded.bytes`,
    destination,
    Date.now(),
    outcome.ok ? 1 : 0,
    outcome.ok ? null : reasonOf(outcome.error),
    outcome.bytes ?? null
  );
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
