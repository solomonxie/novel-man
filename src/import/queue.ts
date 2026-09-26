import { newId } from '../db';
import { updateBook } from '../db/repo';
import { downloadTranslation, type Translation } from '../sources/ebible';
import {
  authorLine,
  fetchPaperHtml,
  fileNameFor as paperFileName,
  type Paper,
} from '../sources/arxiv';
import { fetchGutenbergIndex, readGutenbergBook, type GutenbergBook } from '../sources/gutenberg';
import { refreshCatalog } from '../sources/ebible';
import { fetchStandardEbooksIndex } from '../sources/standardEbooks';
import { replaceIndex } from '../sources/catalog';
import { downloadRepoBible, type RepoEdition } from '../sources/repoBible';
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
  /** What a job that produced no book has to show for itself: rows kept. */
  kept?: number;
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
  | { via: 'repo'; edition: RepoEdition }
  | { via: 'gutenberg'; book: GutenbergBook; kind?: string }
  | { via: 'standardebooks'; book: StandardEbook; kind?: string }
  | { via: 'arxiv'; paper: Paper; kind?: string }
  /** Not a book but a list of them: a source's whole catalog, kept for search. */
  | { via: 'catalog'; source: CatalogSource };

/** The sources that publish a list this app can hold. */
export type CatalogSource = 'ebible' | 'gutenberg' | 'standardebooks';

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

/** A bible someone found in a repository, queued exactly like one from a catalog. */
export function enqueueRepoBible(edition: RepoEdition): string {
  return enqueue({ via: 'repo', edition }, edition.title);
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

/**
 * Every list at once, in the queue everything else already runs in.
 *
 * Keeping a catalog used to be a page per source, a button per page, and a
 * wait staring at a progress bar before the search it was for could be used.
 * They are jobs now: queued together, run one at a time like every other job,
 * watched from the strip, and forgotten about until they are done.
 */
export function enqueueCatalogs(sources: CatalogSource[], name: (source: CatalogSource) => string): string[] {
  return sources.map((source) => enqueue({ via: 'catalog', source }, name(source)));
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
        job.kept = result.kept;
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

/**
 * Every source is somebody's server with a rate limit on it, and three lists
 * queued back to back is three requests in a second from one address. The
 * queue is sequential anyway; this only makes the gap deliberate.
 */
const PACE_MS = 1500;
let lastCatalogAt = 0;

async function runJob(job: ImportJob, source: QueuedSource): Promise<Produced> {
  if (source.via === 'catalog') {
    const since = Date.now() - lastCatalogAt;
    if (since < PACE_MS) await new Promise((resolve) => setTimeout(resolve, PACE_MS - since));
    job.stage = 'reading';
    publish();
    try {
      if (source.source === 'ebible') {
        // It keeps its own copy as well as the shared index — the catalog is
        // what the bible pages read.
        const catalog = await refreshCatalog();
        return { kept: catalog.translations.length };
      }
      const rows =
        source.source === 'gutenberg'
          ? await fetchGutenbergIndex()
          : await fetchStandardEbooksIndex(await standardEbooksEmail());
      job.stage = 'saving';
      publish();
      await replaceIndex(source.source, rows, (done, total) => {
        job.fraction = total ? done / total : 0;
        publish();
      });
      return { kept: rows.length };
    } finally {
      lastCatalogAt = Date.now();
    }
  }

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

  if (source.via === 'repo') {
    return downloadRepoBible(source.edition, (stage, fraction) => {
      // Reading and parsing are one loop here — a file is fetched and read
      // before the next is asked for — so the fetch owns most of the bar.
      job.stage = stage === 'fetching' ? 'reading' : 'saving';
      job.fraction = stage === 'fetching' ? fraction * 0.9 : 0.9 + fraction * 0.1;
      publish();
    });
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

/** What a job left behind, when it was a book. A catalog leaves a list. */
type Produced = { bookId?: string; chapters?: number; kept?: number };

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
