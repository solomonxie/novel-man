import { db, newId } from './index';

export type Book = {
  id: string;
  title: string;
  author: string | null;
  year: string | null;
  edition: string | null;
  cover_path: string | null;
  language: string;
  source_name: string;
  source_hash: string;
  source_path: string;
  source_ext: string;
  word_count: number;
  char_count: number;
  cover_hue: number;
  created_at: number;
};

export type Chapter = {
  id: string;
  book_id: string;
  idx: number;
  title: string;
  start: number;
  end: number;
  confident: number;
  user_edited: number;
};

export type EntityKind = 'character' | 'place';

export type CustomField = { label: string; value: string };

export type Entity = {
  id: string;
  book_id: string;
  kind: EntityKind;
  name: string;
  alias: string | null;
  summary: string | null;
  portrait_path: string | null;
  fields: string;
  sort_index: number;
  created_at: number;
};

export type Annotation = {
  id: string;
  book_id: string;
  kind: 'highlight' | 'note' | 'bookmark';
  color: string | null;
  start: number;
  end: number;
  quote: string;
  note: string | null;
  created_at: number;
};

export type BookListItem = Book & { chapter_count: number; offset: number | null };

export async function listBooks(): Promise<BookListItem[]> {
  const database = await db();
  return database.getAllAsync<BookListItem>(
    `SELECT b.*,
            (SELECT COUNT(*) FROM chapters c WHERE c.book_id = b.id) AS chapter_count,
            (SELECT offset FROM reading_state r WHERE r.book_id = b.id) AS offset
     FROM books b ORDER BY b.created_at DESC`
  );
}

export async function getBook(id: string): Promise<Book | null> {
  const database = await db();
  return database.getFirstAsync<Book>('SELECT * FROM books WHERE id = ?', id);
}

export async function getDocumentText(bookId: string): Promise<string> {
  const database = await db();
  const row = await database.getFirstAsync<{ text: string }>(
    'SELECT text FROM documents WHERE book_id = ?',
    bookId
  );
  return row?.text ?? '';
}

export async function listChapters(bookId: string): Promise<Chapter[]> {
  const database = await db();
  return database.getAllAsync<Chapter>(
    'SELECT * FROM chapters WHERE book_id = ? ORDER BY idx',
    bookId
  );
}

export type ImportedBook = Omit<Book, 'id' | 'created_at' | 'year' | 'edition' | 'cover_path'>;

export async function saveImportedBook(input: {
  book: ImportedBook;
  text: string;
  chapters: { title: string; start: number; end: number; confident: boolean }[];
}): Promise<string> {
  const database = await db();
  const id = newId();
  const now = Date.now();
  await database.withTransactionAsync(async () => {
    await database.runAsync(
      `INSERT INTO books (id, title, author, language, source_name, source_hash, source_path,
                          source_ext, word_count, char_count, cover_hue, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      input.book.title,
      input.book.author,
      input.book.language,
      input.book.source_name,
      input.book.source_hash,
      input.book.source_path,
      input.book.source_ext,
      input.book.word_count,
      input.book.char_count,
      input.book.cover_hue,
      now
    );
    await database.runAsync('INSERT INTO documents (book_id, text) VALUES (?, ?)', id, input.text);
    await insertChapters(database, id, input.chapters);
    await database.runAsync(
      'INSERT INTO reading_state (book_id, offset, updated_at) VALUES (?, 0, ?)',
      id,
      now
    );
  });
  return id;
}

/** A novel can carry 500+ chapters; one statement per row is 6x the round trips. */
const CHAPTER_BATCH = 200;

async function insertChapters(
  database: Awaited<ReturnType<typeof db>>,
  bookId: string,
  chapters: { title: string; start: number; end: number; confident: boolean }[]
) {
  for (let from = 0; from < chapters.length; from += CHAPTER_BATCH) {
    const slice = chapters.slice(from, from + CHAPTER_BATCH);
    const values: (string | number)[] = [];
    const rows = slice.map((chapter, offset) => {
      values.push(newId(), bookId, from + offset, chapter.title, chapter.start, chapter.end,
        chapter.confident ? 1 : 0);
      return '(?, ?, ?, ?, ?, ?, ?, 0)';
    });
    await database.runAsync(
      `INSERT INTO chapters (id, book_id, idx, title, start, end, confident, user_edited)
       VALUES ${rows.join(', ')}`,
      values
    );
  }
}

const BOOK_FIELDS = ['title', 'author', 'year', 'edition', 'cover_path'] as const;
export type EditableBookField = (typeof BOOK_FIELDS)[number];

export async function updateBook(id: string, changes: Partial<Record<EditableBookField, string | null>>) {
  const entries = BOOK_FIELDS.filter((field) => field in changes);
  if (!entries.length) return;
  const database = await db();
  await database.runAsync(
    `UPDATE books SET ${entries.map((field) => `${field} = ?`).join(', ')} WHERE id = ?`,
    [...entries.map((field) => changes[field] ?? null), id]
  );
}

export async function listEntities(bookId: string, kind: EntityKind): Promise<Entity[]> {
  const database = await db();
  return database.getAllAsync<Entity>(
    'SELECT * FROM entities WHERE book_id = ? AND kind = ? ORDER BY sort_index, name',
    bookId,
    kind
  );
}

export async function countEntities(bookId: string, kind: EntityKind): Promise<number> {
  const database = await db();
  const row = await database.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM entities WHERE book_id = ? AND kind = ?',
    bookId,
    kind
  );
  return row?.n ?? 0;
}

export async function getEntity(id: string): Promise<Entity | null> {
  const database = await db();
  return database.getFirstAsync<Entity>('SELECT * FROM entities WHERE id = ?', id);
}

export async function createEntity(bookId: string, kind: EntityKind, name: string): Promise<string> {
  const database = await db();
  const id = newId();
  await database.runAsync(
    `INSERT INTO entities (id, book_id, kind, name, fields, sort_index, created_at)
     VALUES (?, ?, ?, ?, '[]', 0, ?)`,
    id,
    bookId,
    kind,
    name,
    Date.now()
  );
  return id;
}

const ENTITY_FIELDS = ['name', 'alias', 'summary', 'portrait_path', 'fields'] as const;
export type EditableEntityField = (typeof ENTITY_FIELDS)[number];

export async function updateEntity(
  id: string,
  changes: Partial<Record<EditableEntityField, string | null>>
) {
  const entries = ENTITY_FIELDS.filter((field) => field in changes);
  if (!entries.length) return;
  const database = await db();
  await database.runAsync(
    `UPDATE entities SET ${entries.map((field) => `${field} = ?`).join(', ')} WHERE id = ?`,
    [...entries.map((field) => changes[field] ?? null), id]
  );
}

export async function deleteEntity(id: string) {
  const database = await db();
  await database.runAsync('DELETE FROM entities WHERE id = ?', id);
}

export function parseFields(raw: string): CustomField[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((f) => typeof f?.label === 'string') : [];
  } catch {
    return [];
  }
}

export async function deleteBook(id: string) {
  const database = await db();
  await database.runAsync('DELETE FROM books WHERE id = ?', id);
}

export async function renameChapter(id: string, title: string) {
  const database = await db();
  await database.runAsync(
    'UPDATE chapters SET title = ?, user_edited = 1 WHERE id = ?',
    title,
    id
  );
}

export async function listAnnotations(bookId: string): Promise<Annotation[]> {
  const database = await db();
  return database.getAllAsync<Annotation>(
    'SELECT * FROM annotations WHERE book_id = ? ORDER BY start',
    bookId
  );
}

export async function addHighlight(input: {
  bookId: string;
  start: number;
  end: number;
  quote: string;
  color: string;
  note?: string;
}) {
  const database = await db();
  const id = newId();
  await database.runAsync(
    `INSERT INTO annotations (id, book_id, kind, color, start, end, quote, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.bookId,
    input.note ? 'note' : 'highlight',
    input.color,
    input.start,
    input.end,
    input.quote,
    input.note ?? null,
    Date.now()
  );
  return id;
}

export async function removeAnnotation(id: string) {
  const database = await db();
  await database.runAsync('DELETE FROM annotations WHERE id = ?', id);
}

export async function saveProgress(bookId: string, offset: number) {
  const database = await db();
  await database.runAsync(
    `INSERT INTO reading_state (book_id, offset, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(book_id) DO UPDATE SET offset = excluded.offset, updated_at = excluded.updated_at`,
    bookId,
    offset,
    Date.now()
  );
}

export async function getProgress(bookId: string): Promise<number> {
  const database = await db();
  const row = await database.getFirstAsync<{ offset: number }>(
    'SELECT offset FROM reading_state WHERE book_id = ?',
    bookId
  );
  return row?.offset ?? 0;
}
