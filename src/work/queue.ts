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
import { AiError, AiTimeout } from '../ai/client';

export type WorkFeed = { units: WorkUnit[]; counts: WorkCounts };

type Listener = (feed: WorkFeed) => void;

const listeners = new Set<Listener>();
/** The drain in flight, so anything that must not race it can await it. */
let draining: Promise<void> | null = null;
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
  // An aborted handler is still a handler mid-write. Deleting the tables out
  // from under one puts its rows back after the wipe believed it was done.
  await settled();
  await publish();
}

/** Resolves when nothing is being written by the queue. */
export function settled(): Promise<void> {
  return draining ?? Promise.resolve();
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
export function drain(): Promise<void> {
  draining ??= loop().finally(() => {
    draining = null;
  });
  return draining;
}

async function loop(): Promise<void> {
  while (!paused) {
    const job = await claimNext();
    if (!job) return;

    await publish();
    controller = new AbortController();
    runningId = job.id;
    try {
      await withBackoff(() => handlers[job.kind](job, controller!.signal), controller.signal);
      await finishJob(job.id, 'done');
    } catch (error) {
      await finishJob(job.id, controller.signal.aborted ? 'canceled' : 'failed', String(error));
    } finally {
      controller = null;
      runningId = null;
    }
    await publish();
  }
}

const TRIES = 5;
const FIRST_WAIT = 2000;

/**
 * A dropped connection, a timeout, a rate limit or an overloaded vendor is
 * worth asking again; a wrong key or an unreadable answer is not. Waits double
 * each time — 2, 4, 8, 16, 32 seconds — and a stop ends the wait too.
 */
export function transient(error: unknown): boolean {
  if (error instanceof AiTimeout) return true;
  if (error instanceof AiError && error.status) return error.status === 408 || error.status === 429 || error.status >= 500;
  return /network|timed? ?out|socket|connection|offline|overloaded|rate.?limit|temporarily/i.test(String(error));
}

async function withBackoff(run: () => Promise<void>, signal: AbortSignal) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (signal.aborted || attempt + 1 >= TRIES || !transient(error)) throw error;
      await wait(FIRST_WAIT * 2 ** attempt, signal);
      if (signal.aborted) throw error;
    }
  }
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((done) => {
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      done();
    });
  });
}

/** Work outlives the app, so it has to be picked back up when it reopens. */
export async function resumeWorkOnLaunch() {
  await requeueInterrupted();
  if (await activeUnits()) void drain();
}
