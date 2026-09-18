import { newId } from '../db';
import { installTranslation, type Translation } from '../scripture/ebible';
import { importFile, type ImportPreview, type ImportProgress } from './pipeline';

export type JobStatus = 'pending' | 'running' | 'awaiting' | 'done' | 'failed';

export type ImportJob = {
  id: string;
  name: string;
  status: JobStatus;
  stage: ImportProgress['stage'] | null;
  fraction: number;
  bookId?: string;
  chapters?: number;
  preview?: ImportPreview;
  error?: unknown;
};

type Listener = (jobs: ImportJob[]) => void;

/**
 * A file someone picked and a bible the app fetched are the same job to
 * everyone watching: one queue, one strip, one list of failures. What differs
 * is only who produces the book at the end of it.
 */
export type QueuedSource =
  | { via: 'file'; uri: string; name: string; kind?: string }
  | { via: 'scripture'; translation: Translation; apocrypha: boolean };

const jobs: ImportJob[] = [];
const sources = new Map<string, QueuedSource>();
const gates = new Map<string, (accepted: boolean) => void>();
const listeners = new Set<Listener>();
let running = false;

export function subscribeToQueue(listener: Listener): () => void {
  listeners.add(listener);
  listener(snapshot());
  return () => listeners.delete(listener);
}

export function snapshot(): ImportJob[] {
  return jobs.map((job) => ({ ...job }));
}

export function activeCount(): number {
  return jobs.filter((job) => job.status !== 'done' && job.status !== 'failed').length;
}

/**
 * The queue is sequential, so a job waiting on a person blocks the rest — but
 * an extraction the reader hasn't seen is exactly what shouldn't be committed
 * behind their back, and the answer is one tap away in the visible strip.
 */
export function answerPreview(id: string, accepted: boolean) {
  const gate = gates.get(id);
  if (!gate) return;
  gates.delete(id);
  gate(accepted);
}

export function enqueueImport(input: { uri: string; name: string; kind?: string }): string {
  return enqueue({ ...input, via: 'file' }, input.name);
}

/** A bible from a preset source, queued exactly like a file. */
export function enqueueTranslation(translation: Translation, apocrypha: boolean): string {
  return enqueue({ via: 'scripture', translation, apocrypha }, translation.title);
}

function enqueue(source: QueuedSource, name: string): string {
  const id = newId();
  jobs.unshift({ id, name, status: 'pending', stage: null, fraction: 0 });
  sources.set(id, source);
  publish();
  void drain();
  return id;
}

export function retryJob(id: string) {
  const job = jobs.find((entry) => entry.id === id);
  if (!job || job.status !== 'failed') return;
  job.status = 'pending';
  job.error = undefined;
  job.fraction = 0;
  publish();
  void drain();
}

/** Clearing drops rows, never imported books. */
export function clearFinished() {
  for (let i = jobs.length - 1; i >= 0; i--) {
    if (jobs[i].status === 'done' || jobs[i].status === 'failed') {
      sources.delete(jobs[i].id);
      jobs.splice(i, 1);
    }
  }
  publish();
}

/** One at a time: two parses competing for the JS thread finish later than both in sequence. */
async function drain() {
  if (running) return;
  running = true;
  try {
    while (true) {
      const job = jobs.filter((entry) => entry.status === 'pending').pop();
      if (!job) return;
      const source = sources.get(job.id);
      if (!source) {
        job.status = 'failed';
        publish();
        continue;
      }
      job.status = 'running';
      publish();
      try {
        const result = await runJob(job, source);
        job.status = 'done';
        job.fraction = 1;
        job.bookId = result.bookId;
        job.chapters = result.chapters;
      } catch (error) {
        job.status = 'failed';
        job.error = error;
        gates.delete(job.id);
      }
      publish();
    }
  } finally {
    running = false;
  }
}

async function runJob(job: ImportJob, source: QueuedSource) {
  if (source.via === 'scripture') {
    return installTranslation(
      source.translation,
      { apocrypha: source.apocrypha },
      (stage, fraction) => {
        // The queue's own vocabulary: an install is a fetch, a read and a save.
        job.stage = stage === 'fetching' ? 'reading' : stage === 'reading' ? 'parsing' : 'saving';
        job.fraction = stage === 'fetching' ? fraction * 0.5 : 0.5 + fraction * 0.5;
        publish();
      }
    );
  }
  return importFile(
    source,
    (progress) => {
      job.stage = progress.stage;
      job.fraction = progress.fraction;
      publish();
    },
    (preview) =>
      new Promise<boolean>((resolve) => {
        job.status = 'awaiting';
        job.preview = preview;
        publish();
        gates.set(job.id, (accepted) => {
          job.status = 'running';
          job.preview = undefined;
          publish();
          resolve(accepted);
        });
      })
  );
}

function publish() {
  const current = snapshot();
  for (const listener of listeners) listener(current);
}
