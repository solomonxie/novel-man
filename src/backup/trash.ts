import { Directory, File, Paths } from '../storage/fs';

import { db, newId } from '../db';
import { deleteBook, getBook } from '../db/repo';
import { buildBundle, openBundle, readAbout } from './bundle';
import { restoreBundle } from './restore';
import { secondStamp } from './format';
import { noticeChange } from './changes';
import { safeFileName } from '../export/types';

/**
 * Deleting a book used to be one `DELETE` behind one alert, and it took the
 * notes, the highlights, the cast and the timeline with it. Everything else
 * destructive in this app writes a verified copy first; this was the one place
 * that did not, and it is the likeliest way anybody actually loses work.
 *
 * So a delete is a move. The book leaves as a bundle of its own — the same
 * format every backup is written in — into a folder Files can see, and comes
 * back through the same restore path a backup file does. Thirty days, then it
 * goes for real.
 *
 * The book row is deleted rather than flagged. A `deleted_at` column would put
 * the burden on every query that lists a book — the shelf, the search, the
 * lists, the counts, the next backup — and the one that forgot would be the
 * leak nobody noticed until a deleted book turned up in an export.
 */
const FOLDER = 'Trash';
export const KEEP_DAYS = 30;

export type TrashedBook = {
  id: string;
  book_id: string;
  title: string;
  author: string | null;
  file: string;
  words: number;
  notes: number;
  bytes: number;
  deleted_at: number;
};

function folder(): Directory {
  const dir = new Directory(Paths.document, FOLDER);
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/**
 * Read back from disk rather than trusted, and only then is anything deleted —
 * the same order `backupBeforeRemoval` uses, for the same reason: a short
 * write, a full disk or an empty build all produce a plausible-looking zip,
 * and this file is the only way back. Throwing here leaves the book alone.
 */
function verify(file: File, book: { id: string; word_count: number }): void {
  const opened = openBundle(file.bytesSync());
  const held = opened.snapshot.books[0];
  if (opened.snapshot.books.length !== 1 || held?.book.id !== book.id) {
    throw new Error('the copy of this book did not come out right; nothing was deleted');
  }
  if (book.word_count > 0 && !held.text?.trim()) {
    throw new Error('the copy came out without the text; nothing was deleted');
  }
}

/** The delete a reader asks for: kept, then removed from the shelf. */
export async function deleteBookSafely(bookId: string): Promise<void> {
  const book = await getBook(bookId);
  if (!book) return;
  const bundle = await buildBundle([bookId]);
  const body = bundle.body as Uint8Array;
  const name = `${secondStamp()}-deleted-${safeFileName(book.title)}.zip`;
  const file = new File(folder(), name);
  if (file.exists) file.delete();
  file.create();
  file.write(body);
  try {
    verify(file, book);
  } catch (problem) {
    // Nothing is deleted, so nothing should be left behind either: a file in
    // the folder that no row points at is a copy nobody can find.
    file.delete();
    throw problem;
  }

  const about = readAbout(body);
  const database = await db();
  await database.runAsync(
    `INSERT INTO deleted_books (id, book_id, title, author, file, words, notes, bytes, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    newId(),
    bookId,
    book.title,
    book.author ?? null,
    name,
    about?.words ?? book.word_count ?? 0,
    about?.notes ?? 0,
    body.length,
    Date.now()
  );
  await deleteBook(bookId);
  noticeChange();
}

export async function listTrash(): Promise<TrashedBook[]> {
  const database = await db();
  return database.getAllAsync<TrashedBook>(
    'SELECT * FROM deleted_books ORDER BY deleted_at DESC'
  );
}

export async function trashCount(): Promise<number> {
  const database = await db();
  const row = await database.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM deleted_books'
  );
  return row?.n ?? 0;
}

/**
 * Back on the shelf, through the path every other restore goes through — so a
 * book that comes back out of the trash comes back exactly as complete as one
 * that comes back out of a backup. No guard copy first: this only ever adds.
 */
export async function restoreTrashed(id: string): Promise<boolean> {
  const row = await one(id);
  if (!row) return false;
  const file = new File(folder(), row.file);
  if (!file.exists) {
    await forget(id);
    return false;
  }
  await restoreBundle(openBundle(file.bytesSync()), { guard: false });
  await forget(id);
  file.delete();
  return true;
}

/** For good, at the reader's word. The one delete with nothing behind it. */
export async function purgeTrashed(id: string): Promise<void> {
  const row = await one(id);
  if (!row) return;
  const file = new File(folder(), row.file);
  if (file.exists) file.delete();
  await forget(id);
}

export async function emptyTrash(): Promise<void> {
  for (const row of await listTrash()) await purgeTrashed(row.id);
}

/**
 * Thirty days is a promise, so it is kept on the way in rather than on the way
 * out: whatever is past its month goes at launch, not the next time somebody
 * happens to open the page that lists them.
 */
export async function purgeExpiredTrash(now = Date.now()): Promise<number> {
  const cutoff = now - KEEP_DAYS * 24 * 60 * 60 * 1000;
  const expired = (await listTrash()).filter((row) => row.deleted_at < cutoff);
  for (const row of expired) await purgeTrashed(row.id);
  return expired.length;
}

async function one(id: string): Promise<TrashedBook | null> {
  const database = await db();
  return database.getFirstAsync<TrashedBook>('SELECT * FROM deleted_books WHERE id = ?', id);
}

async function forget(id: string): Promise<void> {
  const database = await db();
  await database.runAsync('DELETE FROM deleted_books WHERE id = ?', id);
}
