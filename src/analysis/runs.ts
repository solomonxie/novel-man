import { estimate, type Estimate } from '../ai/cost';
import type { Book, Chapter } from '../db/repo';
import { queueWork } from '../work/queue';
import { bookHeader, chapterBody, citedNotSent, passageBody } from './context';

/** Roughly what the context adds on top of the chapter itself, in tokens. */
const CONTEXT_OVERHEAD = { brief: 400, deep: 900, summary: 300 };

/** Enough of a book to price a run on it: its words, or its name. */
export type Priced = Pick<Book, 'language' | 'kind' | 'title'>;

/**
 * What each chapter will actually cost to send. For a bible that is the
 * reference and nothing else, so the estimate falls by two orders of magnitude
 * — and it has to, or the sheet would quote a price the run never spends.
 */
function unitsFor(text: string, chapters: Chapter[], book: Priced): string[] {
  if (citedNotSent(book)) {
    return chapters.map((chapter) => passageBody(book as Book, chapter));
  }
  return chapters.map((chapter) => chapterBody(text, chapter));
}

export function estimateBriefs(
  text: string,
  chapters: Chapter[],
  book: Priced
): Promise<Estimate | null> {
  return estimate({
    units: unitsFor(text, chapters, book),
    language: book.language,
    outputRatio: 0.03,
    overheadTokens: CONTEXT_OVERHEAD.brief,
  });
}

export function estimateDeep(
  text: string,
  chapters: Chapter[],
  book: Priced
): Promise<Estimate | null> {
  return estimate({
    units: unitsFor(text, chapters, book),
    language: book.language,
    outputRatio: 0.08,
    overheadTokens: CONTEXT_OVERHEAD.deep,
  });
}

export function estimateBookSummary(
  book: Book,
  chapters: Chapter[],
  text: string
): Promise<Estimate | null> {
  const briefed = chapters.filter((chapter) => chapter.brief?.trim());
  const material = briefed.length
    ? briefed.map((chapter) => chapter.brief!).join('\n')
    : text.slice(0, 16000);
  return estimate({
    units: [`${bookHeader(book, chapters)}\n${material}`],
    language: book.language,
    outputRatio: 0.1,
    overheadTokens: CONTEXT_OVERHEAD.summary,
  });
}

function label(chapter: Chapter): string {
  return chapter.title.trim() || `${chapter.idx + 1}`;
}

/**
 * A run is one row per chapter. Splitting it here rather than inside a handler
 * is what makes the progress bar real: the total is a row count, not an
 * estimate, and any one chapter can fail or be retried on its own.
 */
export async function queueChapterRun(
  bookId: string,
  kind: 'chapter-brief' | 'deep-analyze' | 'cast-chapter',
  chapters: Chapter[]
): Promise<string> {
  const runId = await queueWork({
    bookId,
    kind,
    units: chapters.map((chapter) => ({ label: label(chapter), chapterIdx: chapter.idx })),
  });
  // Counting mentions and joining the observations is free and local, but it
  // can only happen once the chapters are in — so it queues behind them as its
  // own run rather than being re-done after every chapter.
  if (kind !== 'chapter-brief') {
    await queueWork({ bookId, kind: 'cast-wrapup', engine: 'local', units: [{ label: 'index' }] });
  }
  return runId;
}

export function queuePolish(bookId: string, entityId: string, name: string): Promise<string> {
  return queueWork({
    bookId,
    kind: 'character-polish',
    units: [{ label: name, payload: { entityId } }],
  });
}

/** A place earns its profile the same way a person does: from what was observed. */
export function queuePlacePolish(bookId: string, entityId: string, name: string): Promise<string> {
  return queueWork({
    bookId,
    kind: 'place-polish',
    units: [{ label: name, payload: { entityId } }],
  });
}

export function queueBookSummary(bookId: string): Promise<string> {
  return queueWork({ bookId, kind: 'book-summary', units: [{ label: 'book' }] });
}

/** Chapters already briefed cost nothing to skip and everything to redo. */
export function unbriefed(chapters: Chapter[]): Chapter[] {
  return chapters.filter((chapter) => !chapter.brief?.trim());
}
