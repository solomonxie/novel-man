import {
  activeUnits,
  cancelAllJobs,
  cancelJob,
  claimNext,
  clearSettledUnits,
  countUnits,
  enqueueRun,
  finishJob,
  listUnits,
  requeueInterrupted,
  retryJob,
  type NewUnit,
  type WorkCounts,
  type WorkKind,
  type WorkUnit,
} from '../db/work';
import { handlers } from './handlers';

export type WorkFeed = { units: WorkUnit[]; counts: WorkCounts };

type Listener = (feed: WorkFeed) => void;

const listeners = new Set<Listener>();
let draining = false;
let paused = false;
let controller: AbortController | null = null;
/** The task in flight, so canceling any other one doesn't abort it. */
let runningId: string | null = null;

export function subscribeToWork(listener: Listener): () => void {
  listeners.add(listener);
  void publish();
  return () => listeners.delete(listener);
}

async function publish() {
  if (!listeners.size) return;
  const feed = { units: await listUnits(), counts: await countUnits() };
  for (const listener of listeners) listener(feed);
}

export async function queueWork(input: {
  bookId: string;
  kind: WorkKind;
  units: NewUnit[];
  engine?: 'ai' | 'local';
}): Promise<string> {
  const runId = await enqueueRun(input);
  await publish();
  void drain();
  return runId;
}

export function isPaused(): boolean {
  return paused;
}

export async function setWorkPaused(next: boolean) {
  paused = next;
  // Pausing stops the next unit, not the one already paid for.
  if (!next) void drain();
  await publish();
}

export async function cancelWorkUnit(id: string) {
  await cancelJob(id);
  // Only the task actually in flight has anything to abort.
  if (runningId === id) controller?.abort();
  await publish();
}

export async function cancelAllWork() {
  await cancelAllJobs();
  controller?.abort();
  await publish();
}

export async function retryWorkUnit(id: string) {
  await retryJob(id);
  await publish();
  void drain();
}

export async function clearFinishedWork() {
  await clearSettledUnits();
  await publish();
}

/**
 * One unit at a time, on purpose. Two chapters in flight would double the
 * spend before a mistaken run could be stopped, and vendors rate-limit
 * concurrency harder than they reward it.
 */
export async function drain(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    while (!paused) {
      const job = await claimNext();
      if (!job) return;

      await publish();
      controller = new AbortController();
      runningId = job.id;
      try {
        await handlers[job.kind](job, controller.signal);
        await finishJob(job.id, 'done');
      } catch (error) {
        await finishJob(job.id, controller.signal.aborted ? 'canceled' : 'failed', String(error));
      } finally {
        controller = null;
        runningId = null;
      }
      await publish();
    }
  } finally {
    draining = false;
  }
}

/** Work outlives the app, so it has to be picked back up when it reopens. */
export async function resumeWorkOnLaunch() {
  await requeueInterrupted();
  if (await activeUnits()) void drain();
}
