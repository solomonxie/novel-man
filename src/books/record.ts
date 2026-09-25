/**
 * A skeleton: a book on the shelf with no words behind it. One read on paper,
 * one borrowed, one only meant to be read — or one restored from a backup
 * whose file could not be found. The app keeps everything else it keeps about
 * a book — chapters, notes, a cast, a summary, a rating — so this is not a
 * second kind of row but the absence of a manuscript, and that is exactly how
 * it is recognized: nothing to read here, and no source to fetch it from.
 *
 * Named for what it is rather than called a record, which in this codebase is
 * already a `BookRecord` — the whole of a book, which is the opposite of this.
 *
 * A licensed edition has no words here either, but it has somewhere to get
 * them, so it is not a skeleton.
 */
export type Skeletal = { word_count: number; text_source: string | null };

export function isSkeleton(book: Skeletal): boolean {
  return book.word_count === 0 && !book.text_source;
}

/** One to five, and never a half — the count every shelf in the world uses. */
export const STARS = 5;

export function starsOf(value: number | null | undefined): number {
  if (!value || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(STARS, Math.round(value)));
}

/**
 * Where a book stands with the reader. Three answers, because a fourth is
 * already covered by one of them: "abandoned" is read, "own but haven't
 * started" is want to read.
 */
export const STATUSES = ['wishlist', 'reading', 'read'] as const;
export type ReadingStatus = (typeof STATUSES)[number];

export function statusOf(value: string | null | undefined): ReadingStatus | null {
  return STATUSES.includes(value as ReadingStatus) ? (value as ReadingStatus) : null;
}
