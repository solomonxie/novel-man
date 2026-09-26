import {
  addStandaloneNote,
  findBookNamed,
  findRecordFrom,
  rateBook,
  saveRecordBook,
  updateBook,
  type Book,
} from '../db/repo';
import { coverUrl, type Work } from '../sources/openLibrary';
import { looksLikeImage } from '../sources/identify';
import type { Shelved } from '../sources/goodreads';
import { writeImage } from '../storage/files';
import { hueFrom } from '../ui/fields';
import { yieldToUI } from '../async/yield';
import { addEvent } from '../db/timeline';

/**
 * Putting a book on the shelf that the app has no copy of. Three things
 * produce one — a catalog, a library somebody already kept elsewhere, and a
 * title typed by hand — and they all end at the same row, so they all end here.
 */
export const BY_HAND = 'by hand';
export const OPEN_LIBRARY = 'openlibrary.org';
export const GOODREADS = 'goodreads.com';
export const DOUBAN = 'douban.com';

export function keepByHand(input: {
  title: string;
  author?: string | null;
  kind: string;
  language?: string;
}): Promise<string> {
  return saveRecordBook({
    title: input.title.trim(),
    author: input.author?.trim() || null,
    kind: input.kind,
    language: input.language,
    source_name: BY_HAND,
    cover_hue: hueFrom(input.title),
  });
}

/**
 * A cover is the only thing a shelf is read by, and the catalogs serve one for
 * most of what they list. It is fetched at the moment it is chosen and never
 * again — 20 KB once, kept where a backup can carry it — and a book whose
 * cover will not come still goes on the shelf.
 */
export async function keepCoverFrom(url: string, key: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    // Open Library answers a missing cover with a 1×1 rather than a 404, and
    // Google answers a size it does not have with something that is not a
    // picture at all. Both arrive as 200s; neither is worth a row on the
    // shelf, and a file that is not an image is a black rectangle later.
    if (bytes.length < 1000 || !looksLikeImage(bytes)) return null;
    return writeImage(`cover-${key}.jpg`, bytes);
  } catch {
    return null;
  }
}

function keepCover(coverId: number, key: string): Promise<string | null> {
  return keepCoverFrom(coverUrl(coverId, 'M'), key);
}

/** Already on the shelf under the id this catalog knows it by, or by its name. */
export async function alreadyKept(
  source: string,
  id: string,
  title: string,
  author?: string | null
): Promise<Book | null> {
  const byId = id ? await findRecordFrom(source, id) : null;
  return byId ?? (await findBookNamed(title, author));
}

export async function keepWork(work: Work, kind: string): Promise<string> {
  const existing = await alreadyKept(OPEN_LIBRARY, work.key, work.title, work.author);
  if (existing) return existing.id;
  return saveRecordBook({
    title: work.title,
    author: work.author || null,
    year: work.year || null,
    language: work.language || 'en',
    kind,
    source_name: OPEN_LIBRARY,
    source_hash: work.key,
    cover_hue: hueFrom(work.title),
    cover_path: work.coverId === null ? null : await keepCover(work.coverId, work.key),
  });
}

export type KeptCount = { added: number; filled: number; untouched: number };

/**
 * A whole library, brought over. What is already here is filled in rather than
 * duplicated: a book with no rating takes the one from the export, and one
 * that already has a rating keeps it — the reader's own word on a book beats a
 * copy of it from somewhere else, every time.
 *
 * It runs in the foreground with a count, because 900 books is a wait somebody
 * is watching, and it yields between them so the wait is not a frozen screen.
 */
export async function keepShelved(
  books: Shelved[],
  kind: string,
  onProgress?: (done: number, total: number) => void,
  /** Whose shelf it was. The ids are that site's numbering, so a re-import
      matches against the site it came from rather than across all of them. */
  from: string = GOODREADS
): Promise<KeptCount> {
  const count: KeptCount = { added: 0, filled: 0, untouched: 0 };
  for (let at = 0; at < books.length; at++) {
    const book = books[at];
    const existing = await alreadyKept(from, book.id, book.title, book.author);
    if (existing) {
      const changed = await fill(existing, book);
      await remember(existing.id, book);
      if (changed) count.filled += 1;
      else count.untouched += 1;
    } else {
      const id = await saveRecordBook({
        title: book.title,
        author: book.author || null,
        year: book.year || null,
        kind,
        source_name: from,
        source_hash: book.id,
        cover_hue: hueFrom(book.title),
        stars: book.stars,
        review: book.review,
        rated_at: book.at,
        status: book.status,
        isbn: book.isbn || null,
      });
      // Their private notes are notes about the book, not a review of it — so
      // they land where every other note about a book lands. Only on the way
      // in: a second sync must not write the same note twice.
      if (book.notes) await addStandaloneNote({ bookId: id, note: book.notes });
      await remember(id, book);
      count.added += 1;
    }
    if (at % 20 === 0) await yieldToUI();
    onProgress?.(at + 1, books.length);
  }
  return count;
}

/**
 * The dates Goodreads keeps, as moments on the book's own timeline.
 *
 * These are the only record anybody has of a book read in 2015, and they are
 * the reason the timeline is worth having at all — an app installed last week
 * cannot otherwise know when anything was read. Written by day, and written
 * once however many times a shelf is re-read.
 */
async function remember(bookId: string, book: Shelved): Promise<void> {
  if (book.added) {
    await addEvent({
      bookId,
      kind: 'status',
      at: book.added,
      label: 'wishlist',
      source: 'goodreads',
    });
  }
  if (book.read) {
    await addEvent({ bookId, kind: 'status', at: book.read, label: 'read', source: 'goodreads' });
  }
}

/**
 * What Goodreads says about a book this shelf already has.
 *
 * The rating, the status and the review are the reader's own answers kept
 * somewhere else, and reading the shelf again is how they are brought over —
 * so where Goodreads has one, it wins. This used to fill only what was blank,
 * which meant changing a rating over there and refreshing here did nothing at
 * all, silently. Anything Goodreads has no answer for is left exactly as it is.
 */
async function fill(existing: Book, book: Shelved): Promise<boolean> {
  const rating: { stars?: number | null; review?: string | null } = {};
  if (book.stars !== null && book.stars !== existing.stars) rating.stars = book.stars;
  if (book.review && book.review !== existing.review) rating.review = book.review;
  const status = book.status && book.status !== existing.status ? book.status : null;
  const year = !existing.year && book.year ? book.year : null;
  if (!Object.keys(rating).length && !status && !year) return false;
  if (Object.keys(rating).length) await rateBook(existing.id, rating);
  if (status || year) {
    await updateBook(existing.id, {
      ...(status ? { status } : {}),
      ...(year ? { year } : {}),
    });
  }
  return true;
}
