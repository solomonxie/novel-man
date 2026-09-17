import { buildBundle, fingerprint, openBundle } from '../backup/bundle';
import { restoreBundle, type RestoreReport } from '../backup/restore';
import { contentHash } from '../ai/cache';
import {
  claimNext,
  countPending,
  enqueue,
  finish,
  lastUploadedAt,
  lastUploadHash,
  recordUpload,
  requeueStale,
  type CloudJob,
} from '../db/jobs';
import { getBook, listBookIds } from '../db/repo';
import { bucketFor, listConnections } from './connections';

/** Per book under `books/`, the whole library at the root. Nothing else. */
export const LIBRARY_KEY = 'library.zip';
export const bookKey = (bookId: string) => `books/${bookId}.zip`;

type Listener = () => void;
const listeners = new Set<Listener>();
let draining = false;

export function subscribeToSync(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function publish() {
  for (const listener of listeners) listener();
}

export async function queueBackup(connectionId: string, bookIds?: string[]) {
  const ids = bookIds ?? (await listBookIds());
  for (const bookId of ids) {
    await enqueue({ connectionId, kind: 'upload-book', bookId });
  }
  await enqueue({ connectionId, kind: 'upload-library' });
  publish();
  void drain();
}

export async function queueDownload(connectionId: string, key: string) {
  await enqueue({ connectionId, kind: 'download-bundle', payload: { key } });
  publish();
  void drain();
}

/**
 * One job at a time. Phone radios and S3 rate limits both punish concurrency
 * harder than they reward it, and a single lane makes "paused" mean something.
 */
export async function drain(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    while (true) {
      const job = await claimNext();
      if (!job) return;
      publish();
      try {
        await run(job);
        await finish(job.id, 'done');
      } catch (error) {
        await finish(job.id, 'failed', String(error));
      }
      publish();
    }
  } finally {
    draining = false;
  }
}

let lastReport: RestoreReport | null = null;
export function takeLastReport(): RestoreReport | null {
  const report = lastReport;
  lastReport = null;
  return report;
}

async function run(job: CloudJob) {
  const bucket = await bucketFor(job.connection_id);
  if (!bucket) throw new Error('connection is gone');

  if (job.kind === 'download-bundle') {
    const { key } = JSON.parse(job.payload) as { key: string };
    lastReport = await restoreBundle(openBundle(await bucket.get(key)));
    return;
  }

  const isBook = job.kind === 'upload-book';
  const key = isBook ? bookKey(job.book_id!) : LIBRARY_KEY;
  if (isBook && !(await getBook(job.book_id!))) return;

  const bundle = await buildBundle(isBook ? [job.book_id!] : undefined);
  const body = bundle.body as Uint8Array;
  // Re-uploading an unchanged bundle costs bandwidth and buys nothing.
  const hash = contentHash('bundle', fingerprint(body));
  if ((await lastUploadHash(job.connection_id, key)) === hash) return;

  await bucket.put(key, body, 'application/zip');
  await recordUpload(job.connection_id, key, hash);
}

const DAY = 24 * 60 * 60 * 1000;
const INTERVALS = { manual: Infinity, daily: DAY, weekly: 7 * DAY };

/**
 * Launch is the only reliable moment: background upload would need a
 * permission this feature hasn't earned, and manual is the default anyway.
 */
export async function syncOnLaunch(): Promise<void> {
  await requeueStale();
  for (const connection of await listConnections()) {
    if (connection.frequency === 'manual') continue;
    const last = await lastUploadedAt(connection.id, LIBRARY_KEY);
    if (last !== null && Date.now() - last < INTERVALS[connection.frequency]) continue;
    await queueBackup(connection.id);
  }
  if (await countPending()) void drain();
}
