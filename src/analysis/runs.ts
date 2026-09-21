import { estimate, type Estimate } from '../ai/cost';
import type { Book, Chapter } from '../db/repo';
import { queueWork } from '../work/queue';
import { bookHeader, chapterBody, citedNotSent, passageBody } from './context';

/** Roughly what the context adds on top of the chapter itself, in tokens. */
const CONTEXT_OVERHEAD = { brief: 400, deep: 900, summary: 300 };

/** Enough of a book to price a run on it: its words, or its name. */
export type Priced = Pick<
  Book,
  'language' | 'kind' | 'title' | 'author' | 'year' | 'word_count' | 'text_source'
>;

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

/**
 * What a chapter with no words says, from what a model remembers of the book.
 * One chapter at a time like every other pass, and offered only where there is
 * nothing to read — see `handlers.recapChapter`.
 */
export function queueChapterRecap(bookId: string, chapter: Chapter): Promise<string> {
  return queueWork({
    bookId,
    kind: 'chapter-recap',
    units: [{ label: label(chapter), chapterIdx: chapter.idx }],
  });
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

/**
 * Forty names to a request: enough that a bible's places are one or two calls,
 * short enough that the answer comes back whole rather than cut off mid-list.
 */
const LOCATE_BATCH = 40;

/** Where the places are today — asked for the book, not for one place page. */
export function queuePlaceLocate(bookId: string, label: string, ids: string[]): Promise<string> {
  const units = [];
  for (let at = 0; at < ids.length; at += LOCATE_BATCH) {
    units.push({ label, payload: { ids: ids.slice(at, at + LOCATE_BATCH) } });
  }
  return queueWork({ bookId, kind: 'place-locate', units });
}

/** The articles the people in this book have outside it — asked for the cast. */
export function queuePersonLinks(bookId: string, label: string, ids: string[]): Promise<string> {
  const units = [];
  for (let at = 0; at < ids.length; at += LOCATE_BATCH) {
    units.push({ label, payload: { ids: ids.slice(at, at + LOCATE_BATCH) } });
  }
  return queueWork({ bookId, kind: 'person-link', units });
}

/**
 * One job per chapter, in reading order. Which chapters is the reader's
 * choice: a book is rarely translated all at once, and the chapter someone
 * is reading tonight should not wait behind the nine hundred they are not.
 */
export function queueTranslation(
  bookId: string,
  target: string,
  chapters: { idx: number; label: string }[]
): Promise<string> {
  return queueWork({
    bookId,
    kind: 'translate-span',
    units: chapters.map((chapter) => ({
      label: chapter.label,
      chapterIdx: chapter.idx,
      payload: { target },
    })),
  });
}

export function queueBookSummary(bookId: string): Promise<string> {
  return queueWork({ bookId, kind: 'book-summary', units: [{ label: 'book' }] });
}

/**
 * The two passes a book with no words can have, and the only two in the app
 * whose material is the title itself. One asks what this book is; the other
 * asks what it is made of. Both are a single small request — a book somebody
 * typed the name of is priced in tokens you can count on one hand.
 */
export function queueBookLookup(bookId: string, title: string): Promise<string> {
  return queueWork({ bookId, kind: 'book-lookup', units: [{ label: title }] });
}

/** The details checked against the work rather than filled in where blank. */
export function queueBookCorrection(bookId: string, title: string): Promise<string> {
  return queueWork({ bookId, kind: 'book-correct', units: [{ label: title }] });
}

export function queueBookOutline(bookId: string, title: string): Promise<string> {
  return queueWork({ bookId, kind: 'book-outline', units: [{ label: title }] });
}

/** What a lookup costs: the name of a book in, a page of description out. */
export function estimateLookup(book: Priced): Promise<Estimate | null> {
  return estimate({
    units: [[book.title, book.author, book.year].filter(Boolean).join(' ')],
    language: book.language,
    outputRatio: 4,
    overheadTokens: 300,
  });
}

/**
 * And what an outline costs, which is the one number here that is really a
 * guess: nobody knows how many chapters a book has until the answer arrives.
 */
export function estimateOutline(book: Priced): Promise<Estimate | null> {
  return estimate({
    units: [[book.title, book.author, book.year].filter(Boolean).join(' ')],
    language: book.language,
    outputRatio: 60,
    overheadTokens: 400,
  });
}

/** Chapters already briefed cost nothing to skip and everything to redo. */
export function unbriefed(chapters: Chapter[]): Chapter[] {
  return chapters.filter((chapter) => !chapter.brief?.trim());
}
