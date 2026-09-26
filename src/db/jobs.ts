import { db, newId, transaction } from './index';

export type JobKind = 'upload-library' | 'download-bundle';
export type JobStatus = 'pending' | 'running' | 'done' | 'failed' | 'paused';

export type CloudJob = {
  id: string;
  connection_id: string;
  kind: JobKind;
  book_id: string | null;
  payload: string;
  status: JobStatus;
  attempts: number;
  error: string | null;
  created_at: number;
  updated_at: number;
};

export async function enqueue(input: {
  connectionId: string;
  kind: JobKind;
  bookId?: string | null;
  payload?: object;
}): Promise<string> {
  const database = await db();
  const id = newId();
  const now = Date.now();
  await database.runAsync(
    `INSERT INTO cloud_jobs (id, connection_id, kind, book_id, payload, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
    id,
    input.connectionId,
    input.kind,
    input.bookId ?? null,
    JSON.stringify(input.payload ?? {}),
    now,
    now
  );
  return id;
}

/**
 * Claiming and reading are one transaction. Two drains racing would otherwise
 * both see the same pending row and upload the same bundle twice.
 */
export async function claimNext(): Promise<CloudJob | null> {
  const database = await db();
  let claimed: CloudJob | null = null;
  await transaction(async () => {
    const job = await database.getFirstAsync<CloudJob>(
      `SELECT * FROM cloud_jobs WHERE status = 'pending' ORDER BY created_at LIMIT 1`
    );
    if (!job) return;
    await database.runAsync(
      `UPDATE cloud_jobs SET status = 'running', attempts = attempts + 1, updated_at = ?
       WHERE id = ? AND status = 'pending'`,
      Date.now(),
      job.id
    );
    claimed = { ...job, status: 'running', attempts: job.attempts + 1 };
  });
  return claimed;
}

export async function finish(id: string, status: JobStatus, error?: string) {
  const database = await db();
  await database.runAsync(
    'UPDATE cloud_jobs SET status = ?, error = ?, updated_at = ? WHERE id = ?',
    status,
    error ?? null,
    Date.now(),
    id
  );
}

export async function listJobs(): Promise<CloudJob[]> {
  const database = await db();
  return database.getAllAsync<CloudJob>(
    `SELECT * FROM cloud_jobs ORDER BY
       CASE status WHEN 'running' THEN 0 WHEN 'pending' THEN 1 WHEN 'failed' THEN 2 ELSE 3 END,
       created_at DESC
     LIMIT 200`
  );
}

export async function countPending(): Promise<number> {
  const database = await db();
  const row = await database.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM cloud_jobs WHERE status IN ('pending', 'running')`
  );
  return row?.n ?? 0;
}

export async function setPaused(paused: boolean) {
  const database = await db();
  await database.runAsync(
    paused
      ? `UPDATE cloud_jobs SET status = 'paused', updated_at = ? WHERE status = 'pending'`
      : `UPDATE cloud_jobs SET status = 'pending', updated_at = ? WHERE status = 'paused'`,
    Date.now()
  );
}

export async function retryFailed() {
  const database = await db();
  await database.runAsync(
    `UPDATE cloud_jobs SET status = 'pending', error = NULL, updated_at = ? WHERE status = 'failed'`,
    Date.now()
  );
}

export async function clearFinishedJobs() {
  const database = await db();
  await database.runAsync(`DELETE FROM cloud_jobs WHERE status IN ('done', 'failed')`);
}

/** A row still marked running at launch was killed mid-flight, not finished. */
export async function requeueStale() {
  const database = await db();
  await database.runAsync(
    `UPDATE cloud_jobs SET status = 'pending', updated_at = ? WHERE status = 'running'`,
    Date.now()
  );
}

export async function lastUploadHash(connectionId: string, key: string): Promise<string | null> {
  const database = await db();
  const row = await database.getFirstAsync<{ hash: string }>(
    'SELECT hash FROM cloud_uploads WHERE connection_id = ? AND key = ?',
    connectionId,
    key
  );
  return row?.hash ?? null;
}

export async function lastUploadedAt(connectionId: string, key: string): Promise<number | null> {
  const database = await db();
  const row = await database.getFirstAsync<{ uploaded_at: number }>(
    'SELECT uploaded_at FROM cloud_uploads WHERE connection_id = ? AND key = ?',
    connectionId,
    key
  );
  return row?.uploaded_at ?? null;
}

/** The newest upload to a destination whatever it was named — see monthStamp. */
export async function lastUploadedAnywhere(connectionId: string): Promise<number | null> {
  const database = await db();
  const row = await database.getFirstAsync<{ uploaded_at: number | null }>(
    'SELECT MAX(uploaded_at) AS uploaded_at FROM cloud_uploads WHERE connection_id = ?',
    connectionId
  );
  return row?.uploaded_at ?? null;
}

export async function recordUpload(connectionId: string, key: string, hash: string) {
  const database = await db();
  await database.runAsync(
    `INSERT INTO cloud_uploads (connection_id, key, hash, uploaded_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(connection_id, key) DO UPDATE SET hash = excluded.hash, uploaded_at = excluded.uploaded_at`,
    connectionId,
    key,
    hash,
    Date.now()
  );
}
