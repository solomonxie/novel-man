import { db, newId, transaction } from './index';

/** What a unit of work is. One row per chapter, per pass. */
export type WorkKind =
  | 'book-summary'
  | 'chapter-brief'
  | 'deep-analyze'
  | 'cast-chapter'
  | 'cast-wrapup'
  | 'character-polish'
  | 'place-polish'
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

export type RunSummary = {
  run_id: string;
  book_id: string;
  kind: WorkKind;
  engine: Engine;
  title: string;
  total: number;
  done: number;
  failed: number;
  running: number;
  pending: number;
  updated_at: number;
};

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

/** The queue is read as runs; a 500-row list of chapters is not progress. */
export async function listRuns(bookId?: string): Promise<RunSummary[]> {
  const database = await db();
  const where = bookId ? 'WHERE w.book_id = ?' : '';
  const rows = await database.getAllAsync<RunSummary>(
    `SELECT w.run_id, w.book_id, w.kind, w.engine, b.title,
            COUNT(*) AS total,
            SUM(w.status = 'done') AS done,
            SUM(w.status = 'failed') AS failed,
            SUM(w.status = 'running') AS running,
            SUM(w.status = 'pending') AS pending,
            MAX(w.updated_at) AS updated_at
     FROM work_jobs w LEFT JOIN books b ON b.id = w.book_id
     ${where}
     GROUP BY w.run_id
     ORDER BY MAX(w.updated_at) DESC
     LIMIT 40`,
    bookId ? [bookId] : []
  );
  return rows;
}

export async function activeUnits(): Promise<number> {
  const database = await db();
  const row = await database.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM work_jobs WHERE status IN ('pending', 'running')`
  );
  return row?.n ?? 0;
}

export async function failedJobs(runId: string): Promise<WorkJob[]> {
  const database = await db();
  return database.getAllAsync<WorkJob>(
    `SELECT * FROM work_jobs WHERE run_id = ? AND status = 'failed' ORDER BY chapter_idx`,
    runId
  );
}

export async function retryRun(runId: string) {
  const database = await db();
  await database.runAsync(
    `UPDATE work_jobs SET status = 'pending', error = NULL, updated_at = ?
     WHERE run_id = ? AND status IN ('failed', 'canceled')`,
    Date.now(),
    runId
  );
}

/** Canceling stops what hasn't started. What finished stays finished. */
export async function cancelRun(runId: string) {
  const database = await db();
  await database.runAsync(
    `UPDATE work_jobs SET status = 'canceled', updated_at = ?
     WHERE run_id = ? AND status IN ('pending', 'running')`,
    Date.now(),
    runId
  );
}

export async function clearRun(runId: string) {
  const database = await db();
  await database.runAsync('DELETE FROM work_jobs WHERE run_id = ?', runId);
}

export async function clearSettledRuns() {
  const database = await db();
  await database.runAsync(
    `DELETE FROM work_jobs WHERE run_id NOT IN (
       SELECT run_id FROM work_jobs WHERE status IN ('pending', 'running'))`
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
