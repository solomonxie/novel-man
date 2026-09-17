import {
  activeUnits,
  cancelRun,
  claimNext,
  clearSettledRuns,
  enqueueRun,
  finishJob,
  listRuns,
  requeueInterrupted,
  retryRun,
  type NewUnit,
  type RunSummary,
  type WorkKind,
} from '../db/work';
import { handlers } from './handlers';

type Listener = (runs: RunSummary[]) => void;

const listeners = new Set<Listener>();
let draining = false;
let paused = false;
let controller: AbortController | null = null;
/** Runs the user canceled while a unit of theirs was already in flight. */
const canceled = new Set<string>();

export function subscribeToWork(listener: Listener): () => void {
  listeners.add(listener);
  void publish();
  return () => listeners.delete(listener);
}

async function publish() {
  if (!listeners.size) return;
  const runs = await listRuns();
  for (const listener of listeners) listener(runs);
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

export async function cancelWorkRun(runId: string) {
  canceled.add(runId);
  await cancelRun(runId);
  // The in-flight unit belongs to some run; only abort if it's this one.
  controller?.abort();
  await publish();
}

export async function retryWorkRun(runId: string) {
  canceled.delete(runId);
  await retryRun(runId);
  await publish();
  void drain();
}

export async function clearFinishedWork() {
  await clearSettledRuns();
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
      if (canceled.has(job.run_id)) {
        await finishJob(job.id, 'canceled');
        continue;
      }

      await publish();
      controller = new AbortController();
      try {
        await handlers[job.kind](job, controller.signal);
        await finishJob(job.id, 'done');
      } catch (error) {
        const stopped = canceled.has(job.run_id) || controller.signal.aborted;
        await finishJob(job.id, stopped ? 'canceled' : 'failed', String(error));
      } finally {
        controller = null;
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
