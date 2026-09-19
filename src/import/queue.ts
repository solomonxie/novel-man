import { newId } from '../db';
import { updateBook } from '../db/repo';
import { downloadTranslation, type Translation } from '../sources/ebible';
import {
  authorLine,
  fetchPaperHtml,
  fileNameFor as paperFileName,
  type Paper,
} from '../sources/arxiv';
import { readGutenbergBook, type GutenbergBook } from '../sources/gutenberg';
import {
  authHeader,
  fileNameFor as standardEbookFileName,
  StandardEbooksError,
  type StandardEbook,
} from '../sources/standardEbooks';
import { standardEbooksEmail } from '../sources/standardEbooksEmail';
import { fetchManuscript, FetchError } from './sources/url';
import { saveDownload } from './sources/downloads';
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
  | { via: 'ebible'; translation: Translation; apocrypha: boolean }
  | { via: 'gutenberg'; book: GutenbergBook; kind?: string }
  | { via: 'standardebooks'; book: StandardEbook; kind?: string }
  | { via: 'arxiv'; paper: Paper; kind?: string };

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
  return enqueue({ via: 'ebible', translation, apocrypha }, translation.title);
}

export function enqueueGutenberg(book: GutenbergBook, kind?: string): string {
  return enqueue({ via: 'gutenberg', book, kind }, book.title);
}

export function enqueueStandardEbook(book: StandardEbook, kind?: string): string {
  return enqueue({ via: 'standardebooks', book, kind }, book.title);
}

export function enqueuePaper(paper: Paper, kind?: string): string {
  return enqueue({ via: 'arxiv', paper, kind }, paper.title);
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
  if (source.via === 'gutenberg') {
    job.stage = 'reading';
    publish();
    // The book's own feed states the url, so it is read now rather than held
    // in a screen's state from whenever the list was last searched.
    const edition = await readGutenbergBook(source.book);
    const file = await fetchManuscript(edition.url, edition.fileName);
    return importFrom({ ...file, kind: source.kind }, job);
  }

  if (source.via === 'standardebooks') {
    job.stage = 'reading';
    publish();
    // The url came from the feed with the rest of the row, so there is nothing
    // to re-read — but the file is behind the same credential the feed was.
    const email = await standardEbooksEmail();
    if (!email || !source.book.url) throw new StandardEbooksError('no-email');
    let file;
    try {
      file = await fetchManuscript(source.book.url, standardEbookFileName(source.book), {
        authorization: authHeader(email),
      });
    } catch (problem) {
      // A membership that lapsed between the list and the download is the one
      // failure here that isn't "try again" — say which it was.
      if (problem instanceof FetchError && /^(401|403)$/.test(problem.detail ?? '')) {
        throw new StandardEbooksError('rejected');
      }
      throw problem;
    }
    return importFrom({ ...file, kind: source.kind }, job);
  }

  if (source.via === 'arxiv') {
    job.stage = 'reading';
    publish();
    // The rendered HTML when the paper has one, the PDF when it does not.
    const html = await fetchPaperHtml(source.paper);
    const file = html
      ? saveDownload(paperFileName(source.paper, 'html'), html)
      : await fetchManuscript(source.paper.pdf, paperFileName(source.paper));
    const result = await importFrom({ ...file, kind: source.kind }, job);
    // A PDF's first page is a guess at what the paper is called; arXiv is not.
    await updateBook(result.bookId, {
      title: source.paper.title,
      author: authorLine(source.paper),
      year: source.paper.published.slice(0, 4),
      edition: [source.paper.id, source.paper.category].filter(Boolean).join(' · '),
      summary: source.paper.abstract,
    });
    return result;
  }

  if (source.via === 'ebible') {
    return downloadTranslation(
      source.translation,
      { apocrypha: source.apocrypha },
      (stage, fraction) => {
        // The queue's own vocabulary: a download is a fetch, a read and a save.
        job.stage = stage === 'fetching' ? 'reading' : stage === 'reading' ? 'parsing' : 'saving';
        job.fraction = stage === 'fetching' ? fraction * 0.5 : 0.5 + fraction * 0.5;
        publish();
      }
    );
  }
  return importFrom(source, job);
}

/** Every path ends here: a file on disk, the preview gate, the same stages. */
function importFrom(file: { uri: string; name: string; kind?: string }, job: ImportJob) {
  return importFile(
    file,
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
