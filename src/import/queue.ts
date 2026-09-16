import { newId } from '../db';
import { importFile, type ImportProgress } from './pipeline';

export type JobStatus = 'pending' | 'running' | 'done' | 'failed';

export type ImportJob = {
  id: string;
  name: string;
  status: JobStatus;
  stage: ImportProgress['stage'] | null;
  fraction: number;
  bookId?: string;
  chapters?: number;
  error?: unknown;
};

type Listener = (jobs: ImportJob[]) => void;

const jobs: ImportJob[] = [];
const sources = new Map<string, { uri: string; name: string }>();
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
  return jobs.filter((job) => job.status === 'pending' || job.status === 'running').length;
}

export function enqueueImport(input: { uri: string; name: string }): string {
  const id = newId();
  jobs.unshift({ id, name: input.name, status: 'pending', stage: null, fraction: 0 });
  sources.set(id, input);
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
        const result = await importFile(source, (progress) => {
          job.stage = progress.stage;
          job.fraction = progress.fraction;
          publish();
        });
        job.status = 'done';
        job.fraction = 1;
        job.bookId = result.bookId;
        job.chapters = result.chapters;
      } catch (error) {
        job.status = 'failed';
        job.error = error;
      }
      publish();
    }
  } finally {
    running = false;
  }
}

function publish() {
  const current = snapshot();
  for (const listener of listeners) listener(current);
}
