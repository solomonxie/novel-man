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

/**
 * Every name the one list has ever been shown under, in any language.
 *
 * It is stored as `Favorites` and *displayed* translated, which is right — but
 * it means a list the reader created called `收藏`, or a backup restored by a
 * name rather than by the id, becomes a second list that looks identical to
 * the first. Two 收藏 albums on the home page, holding different books.
 *
 * So these names all resolve to the system list and none of them can be used
 * to make a new one. Anything added to `lists.favorites` in a catalog belongs
 * here too.
 */
const FAVORITE_NAMES = ['favorites', 'favourites', '收藏', '收藏夹'];

export function isFavoritesName(name: string): boolean {
  return FAVORITE_NAMES.includes(name.trim().toLowerCase());
}

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
  // Whatever language it was written in, it is the one that ships.
  if (isFavoritesName(name)) {
    await seedSystemLists();
    return FAVORITES;
  }
  const database = await db();
  const row = await database.getFirstAsync<{ id: string }>(
    'SELECT id FROM book_lists WHERE name = ? COLLATE NOCASE LIMIT 1',
    name.trim()
  );
  return row?.id ?? null;
}

export async function createBookList(name: string): Promise<string> {
  // Asked for by one of its own names, the list already exists.
  if (isFavoritesName(name)) {
    await seedSystemLists();
    return FAVORITES;
  }
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

export async function listsHolding(bookId: string): Promise<BookList[]> {
  const database = await db();
  return database.getAllAsync<BookList>(
    `SELECT l.*, (SELECT COUNT(*) FROM list_books m WHERE m.list_id = l.id) AS books
       FROM book_lists l JOIN list_books h ON h.list_id = l.id
      WHERE h.book_id = ? ORDER BY l.system DESC, l.created_at`,
    bookId
  );
}

/**
 * The one list the app ships, put back if it is missing.
 *
 * A wipe empties every table, and the migration that seeded this row has
 * already run and will not run again — so after one, `favorites` was gone for
 * good. `list_books.list_id` references it, which made every ♥ a foreign key
 * failure, and `INSERT OR IGNORE` swallowed each one without a word: the
 * button did nothing, said nothing, and looked fine.
 */
export async function seedSystemLists(): Promise<void> {
  const database = await db();
  await database.runAsync(
    "INSERT OR IGNORE INTO book_lists (id, name, system, created_at) VALUES (?, 'Favorites', 1, 0)",
    FAVORITES
  );
}

export async function setInList(listId: string, bookId: string, holds: boolean) {
  const database = await db();
  if (!holds) {
    await database.runAsync('DELETE FROM list_books WHERE list_id = ? AND book_id = ?', listId, bookId);
    return;
  }
  if (listId === FAVORITES) await seedSystemLists();
  // Named conflict, not `OR IGNORE`: the only thing worth ignoring here is the
  // book already being in the list. Anything else is a bug and must be heard.
  await database.runAsync(
    `INSERT INTO list_books (list_id, book_id, added_at) VALUES (?, ?, ?)
       ON CONFLICT(list_id, book_id) DO NOTHING`,
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
