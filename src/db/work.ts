import { db, newId, transaction } from './index';

/** What a unit of work is. One row per chapter, per pass. */
export type WorkKind =
  | 'book-summary'
  /** What a book with no words here is, and what it is made of — both from knowledge. */
  | 'book-lookup'
  | 'book-outline'
  | 'chapter-brief'
  | 'deep-analyze'
  | 'cast-chapter'
  | 'cast-wrapup'
  | 'character-polish'
  | 'place-polish'
  | 'place-locate'
  | 'person-link'
  | 'scene-suggest'
  | 'translate-span'
  | 'script-scene';

/** Whether this unit spends money. The queue shows it per row. */
export type Engine = 'ai' | 'local';

export type WorkStatus = 'pending' | 'running' | 'done' | 'failed' | 'canceled';

export type WorkJob = {
  id: string;
  run_id: string;
  book_id: string;
  kind: WorkKind;
  engine: Engine;
  label: string;
  chapter_idx: number | null;
  payload: string;
  status: WorkStatus;
  attempts: number;
  error: string | null;
  created_at: number;
  updated_at: number;
};

/** A job plus the book it belongs to, which is what a row has to say. */
export type WorkUnit = WorkJob & { title: string | null };

export type WorkCounts = { pending: number; running: number; failed: number; done: number };

export type NewUnit = {
  label: string;
  chapterIdx?: number | null;
  payload?: object;
};

const BATCH = 200;

/**
 * A run is enqueued whole, so the total is known from the first moment and the
 * progress bar never has to guess what it is counting towards.
 */
export async function enqueueRun(input: {
  bookId: string;
  kind: WorkKind;
  engine?: Engine;
  units: NewUnit[];
}): Promise<string> {
  const database = await db();
  const runId = newId();
  const now = Date.now();
  const engine = input.engine ?? 'ai';

  await transaction(async () => {
    for (let from = 0; from < input.units.length; from += BATCH) {
      const slice = input.units.slice(from, from + BATCH);
      const values: (string | number | null)[] = [];
      const rows = slice.map((unit) => {
        values.push(
          newId(), runId, input.bookId, input.kind, engine, unit.label,
          unit.chapterIdx ?? null, JSON.stringify(unit.payload ?? {}), now, now
        );
        return '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
      });
      await database.runAsync(
        `INSERT INTO work_jobs
           (id, run_id, book_id, kind, engine, label, chapter_idx, payload, created_at, updated_at)
         VALUES ${rows.join(', ')}`,
        values
      );
    }
  });
  return runId;
}

/**
 * Claiming and reading are one transaction, so two drains can never take the
 * same chapter. Oldest run first: a queue that reorders itself is a queue
 * nobody can predict.
 */
export async function claimNext(): Promise<WorkJob | null> {
  const database = await db();
  let claimed: WorkJob | null = null;
  await transaction(async () => {
    const job = await database.getFirstAsync<WorkJob>(
      `SELECT * FROM work_jobs WHERE status = 'pending'
       ORDER BY created_at, chapter_idx, rowid LIMIT 1`
    );
    if (!job) return;
    await database.runAsync(
      `UPDATE work_jobs SET status = 'running', attempts = attempts + 1, updated_at = ?
       WHERE id = ? AND status = 'pending'`,
      Date.now(),
      job.id
    );
    claimed = { ...job, status: 'running', attempts: job.attempts + 1 };
  });
  return claimed;
}

export async function finishJob(id: string, status: WorkStatus, error?: string) {
  const database = await db();
  await database.runAsync(
    'UPDATE work_jobs SET status = ?, error = ?, updated_at = ? WHERE id = ?',
    status,
    error ?? null,
    Date.now(),
    id
  );
}

/**
 * One row per task, in the order they will actually run — what is working
 * first, then what is waiting behind it, then what went wrong. A grouped view
 * answered "how far along is the analysis" and nothing else; the question
 * underneath it, "what is it doing to my book right now", needs the tasks
 * themselves.
 */
export async function listUnits(limit = 200): Promise<WorkUnit[]> {
  const database = await db();
  return database.getAllAsync<WorkUnit>(
    `SELECT w.*, b.title
     FROM work_jobs w LEFT JOIN books b ON b.id = w.book_id
     ORDER BY CASE w.status
                WHEN 'running' THEN 0 WHEN 'pending' THEN 1 WHEN 'failed' THEN 2 ELSE 3
              END,
              w.created_at, w.chapter_idx, w.rowid
     LIMIT ?`,
    limit
  );
}

/** Counted in SQL rather than from the capped list, which would undercount. */
export async function countUnits(): Promise<WorkCounts> {
  const database = await db();
  const row = await database.getFirstAsync<Partial<WorkCounts>>(
    `SELECT SUM(status = 'pending') AS pending, SUM(status = 'running') AS running,
            SUM(status = 'failed') AS failed, SUM(status = 'done') AS done
     FROM work_jobs`
  );
  return {
    pending: row?.pending ?? 0,
    running: row?.running ?? 0,
    failed: row?.failed ?? 0,
    done: row?.done ?? 0,
  };
}

export async function activeUnits(): Promise<number> {
  const database = await db();
  const row = await database.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM work_jobs WHERE status IN ('pending', 'running')`
  );
  return row?.n ?? 0;
}

export async function retryJob(id: string) {
  const database = await db();
  await database.runAsync(
    `UPDATE work_jobs SET status = 'pending', error = NULL, updated_at = ?
     WHERE id = ? AND status IN ('failed', 'canceled')`,
    Date.now(),
    id
  );
}

/** Canceling stops what hasn't started. What finished stays finished. */
export async function cancelJob(id: string) {
  const database = await db();
  await database.runAsync(
    `UPDATE work_jobs SET status = 'canceled', updated_at = ?
     WHERE id = ? AND status IN ('pending', 'running')`,
    Date.now(),
    id
  );
}

export async function cancelAllJobs() {
  const database = await db();
  await database.runAsync(
    `UPDATE work_jobs SET status = 'canceled', updated_at = ?
     WHERE status IN ('pending', 'running')`,
    Date.now()
  );
}

export async function clearSettledUnits() {
  const database = await db();
  await database.runAsync(
    `DELETE FROM work_jobs WHERE status IN ('done', 'failed', 'canceled')`
  );
}

/** Anything still 'running' at launch was killed mid-flight, not finished. */
export async function requeueInterrupted() {
  const database = await db();
  await database.runAsync(
    `UPDATE work_jobs SET status = 'pending', updated_at = ? WHERE status = 'running'`,
    Date.now()
  );
}
