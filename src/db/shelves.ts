import { db, newId, transaction } from './index';
import type { BookListItem } from './repo';

/**
 * The two ways a shelf is grouped without moving anything. A list is chosen —
 * the reader puts a book in it — and a tag is said about the book, so one
 * belongs to the list and the other belongs to the book. Both are here because
 * both are the same idea from opposite ends: a shelf too big to read straight
 * through.
 */
export type BookList = {
  id: string;
  name: string;
  /** Ships with the app, and cannot be deleted or renamed away. */
  system: number;
  created_at: number;
  books: number;
};

/** The one list that is always there. Its name is translated, not stored. */
export const FAVORITES = 'favorites';

const SHELF_ROW = `SELECT b.*,
        (SELECT COUNT(*) FROM chapters c WHERE c.book_id = b.id) AS chapter_count,
        (SELECT offset FROM reading_state r WHERE r.book_id = b.id) AS offset,
        (SELECT updated_at FROM reading_state r WHERE r.book_id = b.id) AS read_at
   FROM books b`;

export async function listBookLists(): Promise<BookList[]> {
  const database = await db();
  return database.getAllAsync<BookList>(
    `SELECT l.*, (SELECT COUNT(*) FROM list_books m WHERE m.list_id = l.id) AS books
       FROM book_lists l ORDER BY l.system DESC, l.created_at`
  );
}

export async function getBookList(id: string): Promise<BookList | null> {
  const database = await db();
  return database.getFirstAsync<BookList>(
    `SELECT l.*, (SELECT COUNT(*) FROM list_books m WHERE m.list_id = l.id) AS books
       FROM book_lists l WHERE l.id = ?`,
    id
  );
}

/** The same list, by the name on it — what a restore has to match against. */
export async function findListNamed(name: string): Promise<string | null> {
  const database = await db();
  const row = await database.getFirstAsync<{ id: string }>(
    'SELECT id FROM book_lists WHERE name = ? COLLATE NOCASE LIMIT 1',
    name.trim()
  );
  return row?.id ?? null;
}

export async function createBookList(name: string): Promise<string> {
  const database = await db();
  const id = newId();
  await database.runAsync(
    'INSERT INTO book_lists (id, name, system, created_at) VALUES (?, ?, 0, ?)',
    id,
    name.trim(),
    Date.now()
  );
  return id;
}

export async function renameBookList(id: string, name: string) {
  const database = await db();
  await database.runAsync('UPDATE book_lists SET name = ? WHERE id = ? AND system = 0', name.trim(), id);
}

/** A shipped list is not deletable; asking is not an error, it just does nothing. */
export async function deleteBookList(id: string) {
  const database = await db();
  await transaction(async () => {
    await database.runAsync('DELETE FROM list_books WHERE list_id = ?', id);
    await database.runAsync('DELETE FROM book_lists WHERE id = ? AND system = 0', id);
  });
}

/** Newest first: a list is read from what was last put in it. */
export async function booksInList(listId: string): Promise<BookListItem[]> {
  const database = await db();
  return database.getAllAsync<BookListItem>(
    `${SHELF_ROW} JOIN list_books m ON m.book_id = b.id
      WHERE m.list_id = ? ORDER BY m.added_at DESC`,
    listId
  );
}

/** Enough of a book to draw it: a cover, or what stands in for one. */
export type Face = { title: string; cover_path: string | null; cover_hue: number };

/**
 * The four most recent covers in each list, for the collage that stands for it
 * — a list is recognised the way a record sleeve is, by what is on the front.
 * One query for the whole shelf: a query per list would be one round trip per
 * row of the home page.
 */
export async function coversByList(each = 4): Promise<Map<string, Face[]>> {
  const database = await db();
  const rows = await database.getAllAsync<Face & { list_id: string }>(
    `SELECT ranked.list_id, b.title, b.cover_path, b.cover_hue
       FROM (SELECT m.list_id, m.book_id,
                    ROW_NUMBER() OVER (PARTITION BY m.list_id ORDER BY m.added_at DESC) AS place
               FROM list_books m) ranked
       JOIN books b ON b.id = ranked.book_id
      WHERE ranked.place <= ?
      ORDER BY ranked.list_id, ranked.place`,
    each
  );
  const byList = new Map<string, Face[]>();
  for (const row of rows) {
    const faces = byList.get(row.list_id);
    const face = { title: row.title, cover_path: row.cover_path, cover_hue: row.cover_hue };
    if (faces) faces.push(face);
    else byList.set(row.list_id, [face]);
  }
  return byList;
}

export async function listsHolding(bookId: string): Promise<BookList[]> {
  const database = await db();
  return database.getAllAsync<BookList>(
    `SELECT l.*, (SELECT COUNT(*) FROM list_books m WHERE m.list_id = l.id) AS books
       FROM book_lists l JOIN list_books h ON h.list_id = l.id
      WHERE h.book_id = ? ORDER BY l.system DESC, l.created_at`,
    bookId
  );
}

export async function setInList(listId: string, bookId: string, holds: boolean) {
  const database = await db();
  if (!holds) {
    await database.runAsync('DELETE FROM list_books WHERE list_id = ? AND book_id = ?', listId, bookId);
    return;
  }
  await database.runAsync(
    'INSERT OR IGNORE INTO list_books (list_id, book_id, added_at) VALUES (?, ?, ?)',
    listId,
    bookId,
    Date.now()
  );
}

export async function isFavorite(bookId: string): Promise<boolean> {
  const database = await db();
  const row = await database.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM list_books WHERE list_id = ? AND book_id = ?',
    FAVORITES,
    bookId
  );
  return (row?.n ?? 0) > 0;
}

export function setFavorite(bookId: string, on: boolean): Promise<void> {
  return setInList(FAVORITES, bookId, on);
}

/**
 * What a tag is, once and for everything that stores one: trimmed, and with
 * the inner spacing squared up. Two tags that differ by a space are one tag
 * nobody can tell apart on a chip.
 */
export function cleanTag(tag: string): string {
  return tag.trim().replace(/\s+/g, ' ').slice(0, 40);
}

export async function tagsOf(bookId: string): Promise<string[]> {
  const database = await db();
  const rows = await database.getAllAsync<{ tag: string }>(
    'SELECT tag FROM book_tags WHERE book_id = ? ORDER BY tag',
    bookId
  );
  return rows.map((row) => row.tag);
}

export async function addTag(bookId: string, tag: string) {
  const cleaned = cleanTag(tag);
  if (!cleaned) return;
  const database = await db();
  await database.runAsync(
    'INSERT OR IGNORE INTO book_tags (book_id, tag) VALUES (?, ?)',
    bookId,
    cleaned
  );
}

export async function removeTag(bookId: string, tag: string) {
  const database = await db();
  await database.runAsync('DELETE FROM book_tags WHERE book_id = ? AND tag = ?', bookId, tag);
}

/** Everything filed under one word, most recently read first. */
export async function booksTagged(tag: string): Promise<BookListItem[]> {
  const database = await db();
  return database.getAllAsync<BookListItem>(
    `${SHELF_ROW} JOIN book_tags g ON g.book_id = b.id
      WHERE g.tag = ? ORDER BY COALESCE(read_at, b.created_at) DESC`,
    tag
  );
}

/** Every tag on the shelf, most used first — the order a shelf is browsed in. */
export async function listTags(): Promise<{ tag: string; books: number }[]> {
  const database = await db();
  return database.getAllAsync<{ tag: string; books: number }>(
    'SELECT tag, COUNT(*) AS books FROM book_tags GROUP BY tag ORDER BY books DESC, tag'
  );
}

/** Which books carry each tag, for a shelf that filters without a round trip. */
export async function tagsByBook(): Promise<Map<string, string[]>> {
  const database = await db();
  const rows = await database.getAllAsync<{ book_id: string; tag: string }>(
    'SELECT book_id, tag FROM book_tags ORDER BY tag'
  );
  const byBook = new Map<string, string[]>();
  for (const row of rows) {
    const tags = byBook.get(row.book_id);
    if (tags) tags.push(row.tag);
    else byBook.set(row.book_id, [row.tag]);
  }
  return byBook;
}
