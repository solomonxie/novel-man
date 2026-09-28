import type { BookListItem } from '../db/repo';
import { isSkeleton } from './record';

/**
 * What is wrong with a book, as data. Every shelf of any size collects these:
 * an import that never found its chapters, a record typed at midnight with no
 * author, a book no catalog had a picture of. Each one is small enough to
 * ignore forever and the shelf never mentions them, so they accumulate
 * silently and the library quietly rots.
 *
 * So they are counted in one place and listed on one page, grouped by what is
 * wrong rather than by book — because the fix is per-problem: "these eleven
 * have no cover" is one errand, done in a row.
 *
 * Every rule here reads only what `listBooks` already selected. The shelf is
 * in memory by the time anything asks, so the count beside the row costs
 * nothing and no query runs to draw it.
 */
export type FlagId = 'toc' | 'oneChapter' | 'details' | 'cover';

/** Worst first: what stops you reading, then what stops you finding it. */
export const flagIds: FlagId[] = ['toc', 'oneChapter', 'details', 'cover'];

/**
 * Past this, a single chapter is a detection that failed rather than a book
 * that is genuinely one piece. Short stories, papers and prefaces really are
 * one chapter, and none of them run to twenty thousand words.
 */
const TOO_LONG_TO_BE_ONE_CHAPTER = 20000;

/** Where the answer is. A flag that leads to the page that can't fix it is noise. */
export function fixFor(flag: FlagId, bookId: string): string {
  return flag === 'toc' || flag === 'oneChapter'
    ? `/book/${bookId}/structure`
    : `/book/${bookId}`;
}

function blank(value: string | null | undefined): boolean {
  return !value || !value.trim();
}

export function flagsOn(book: BookListItem): FlagId[] {
  const found: FlagId[] = [];
  // A skeleton has no words to divide, so it is not missing a division of
  // them. Nothing is wrong with a book somebody read on paper.
  const readable = !isSkeleton(book);
  if (readable && book.chapter_count === 0) found.push('toc');
  else if (
    readable &&
    book.chapter_count === 1 &&
    book.word_count >= TOO_LONG_TO_BE_ONE_CHAPTER
  ) {
    found.push('oneChapter');
  }
  if (blank(book.author) || blank(book.year)) found.push('details');
  if (blank(book.cover_path)) found.push('cover');
  return found;
}

/** Which of a book's basics are missing, to say so rather than just "details". */
export function missingDetails(book: BookListItem): ('author' | 'year')[] {
  const missing: ('author' | 'year')[] = [];
  if (blank(book.author)) missing.push('author');
  if (blank(book.year)) missing.push('year');
  return missing;
}

/**
 * How many books have anything wrong with them — books, not problems, because
 * that is what the number beside the row is promising to show.
 */
export function flaggedCount(books: BookListItem[]): number {
  let count = 0;
  for (const book of books) if (flagsOn(book).length) count += 1;
  return count;
}

/** The page's own shape: a group per problem, and none for a problem nobody has. */
export function flaggedGroups(books: BookListItem[]): { flag: FlagId; books: BookListItem[] }[] {
  const byFlag = new Map<FlagId, BookListItem[]>();
  for (const book of books) {
    for (const flag of flagsOn(book)) {
      const found = byFlag.get(flag);
      if (found) found.push(book);
      else byFlag.set(flag, [book]);
    }
  }
  return flagIds
    .filter((flag) => byFlag.has(flag))
    .map((flag) => ({ flag, books: byFlag.get(flag) as BookListItem[] }));
}
