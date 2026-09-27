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

/**
 * A book restored out of a bundle that carried no words for it. The counts go
 * to zero because there is nothing left to count — and `text_source` is
 * deliberately untouched, because it is not a measurement of the text, it is
 * where the text comes from. A restore that cleared it turned every ESV that
 * came back from a backup into a skeleton: no reader, 1,189 chapters that
 * opened onto nothing.
 *
 * It lives here rather than in the restore so that the rule above and the rule
 * that undoes it are one thing, tested together. The restore hand-rolled this
 * and drifted from `isSkeleton` without anything noticing.
 */
export function withoutManuscript<T extends Skeletal>(book: T): T {
  return { ...book, word_count: 0, char_count: 0 };
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

/**
 * Which shelf a book sits on, which is not quite what its status column says.
 * A book nobody has answered for is one they have not read yet, and one left
 * twelve chapters in is one they are reading whether or not anybody said so.
 * The home shelf and the page behind it must group identically, or a count is
 * a promise the page it opens does not keep.
 */
export function shelfOf(book: { status?: string | null; offset?: number | null }): ReadingStatus {
  return statusOf(book.status) ?? ((book.offset ?? 0) > 0 ? 'reading' : 'wishlist');
}

/** What a reader has written about a book, with the date it was written. */
export type Reviewed = {
  review?: string | null;
  reviewed_at?: number | null;
  rated_at?: number | null;
  created_at?: number;
};

/**
 * The books with a verdict on them, newest written first. Shared, because the
 * shelf's section and the page it opens are the same list twice and an order
 * that disagrees between them reads as a bug in both.
 *
 * A review from before this had a date of its own falls back to the rating's,
 * then to when the book arrived — an undated one belongs where the rest of its
 * import is, not permanently at the bottom.
 */
export function reviewedAt(book: Reviewed): number {
  return book.reviewed_at ?? book.rated_at ?? book.created_at ?? 0;
}

export function reviewedBooks<T extends Reviewed>(books: T[]): T[] {
  return books
    .filter((book) => book.review?.trim())
    .sort((a, b) => reviewedAt(b) - reviewedAt(a));
}
