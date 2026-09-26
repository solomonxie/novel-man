import { db, newId, transaction, type Database } from './index';
import { addTag, listsHolding, setInList, tagsOf, FAVORITES, findListNamed, createBookList } from './shelves';
import { scenesFromBreaks } from '../structure/scenes';
import { DEFAULT_KIND } from '../books/kinds';
import { reconstruct, parseHints, type StructureHint } from '../structure/document';
import type { Certainty, Pin } from '../cast/location';
import { reverseTie } from '../cast/ties';

export type Book = {
  id: string;
  title: string;
  author: string | null;
  year: string | null;
  edition: string | null;
  cover_path: string | null;
  language: string;
  /** Which kind of book this is, and so which features it gets. See `books/kinds`. */
  kind: string;
  /**
   * Set when the text is fetched a chapter at a time rather than held here —
   * a licensed edition the app may read but not keep. Null for everything else.
   */
  text_source: string | null;
  source_name: string;
  source_hash: string;
  source_path: string;
  source_ext: string;
  word_count: number;
  char_count: number;
  cover_hue: number;
  /** A few sentences on what the book is. Context for every later pass. */
  summary: string | null;
  /** The reader's own overview of it — theirs, where the summary is the book's. */
  impressions: string | null;
  /** Names one printing, so a catalog can be asked rather than searched. */
  isbn: string | null;
  /** What the reader made of it: one to five, or null while unrated. */
  stars: number | null;
  /** Their own words about it, as long as they like. Not the summary — the verdict. */
  review: string | null;
  rated_at: number | null;
  /** Where it stands with them: see `books/record`. Null for a book nobody has said. */
  status: string | null;
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
  /** A line or two on what happens here. Written by you or by a pass. */
  brief: string | null;
  /**
   * A retelling of a chapter this app has no copy of, from what a model
   * remembers of the book. Never the book's words, and never treated as them.
   */
  recap: string | null;
  /** The level above, for kinds that have one: a bible's book, a novel's 卷. */
  part_idx: number | null;
  part_title: string | null;
};

/**
 * A book names three kinds of thing worth a page of its own: people, places,
 * and the things it treats as things — an ark, a covenant, a feast, a rank.
 * One table for all three, because they differ only in what a page shows.
 */
export type EntityKind = 'character' | 'place' | 'term';

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
  role: string | null;
  age: string | null;
  gender: string | null;
  appearance: string | null;
  voice: string | null;
  arc: string | null;
  /** What a real place is called now. Null for a person, and for the unidentified. */
  located: string | null;
  /** The encyclopedia article a real person has. Null for a place. */
  wiki: string | null;
  located_certainty: Certainty | null;
  source: 'manual' | 'ai';
  sort_index: number;
  created_at: number;
};

export type AnnotationKind = 'highlight' | 'note';

export type Annotation = {
  id: string;
  book_id: string;
  /** Set only where offsets cannot say it: a chapter fetched, not held. */
  chapter_id: string | null;
  kind: AnnotationKind;
  color: string | null;
  start: number;
  end: number;
  quote: string;
  note: string | null;
  prefix: string;
  suffix: string;
  /** A note about the book rather than about a sentence in it: nothing quoted. */
  standalone: number;
  created_at: number;
};

export type BookListItem = Book & {
  chapter_count: number;
  offset: number | null;
  read_at: number | null;
};

/**
 * Most recently read first. A book you opened an hour ago is the one you want
 * next; the date it was imported stopped mattering the moment you opened it.
 */
export async function listBooks(): Promise<BookListItem[]> {
  const database = await db();
  return database.getAllAsync<BookListItem>(
    `SELECT b.*,
            (SELECT COUNT(*) FROM chapters c WHERE c.book_id = b.id) AS chapter_count,
            (SELECT offset FROM reading_state r WHERE r.book_id = b.id) AS offset,
            (SELECT updated_at FROM reading_state r WHERE r.book_id = b.id) AS read_at
     FROM books b ORDER BY COALESCE(read_at, b.created_at) DESC`
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

/** One row per part, in reading order, with how many chapters sit under it. */
export type Part = {
  idx: number;
  title: string;
  chapters: number;
  start: number;
  end: number;
  summary: string | null;
  image_path: string | null;
};

/** The chapters are the part; only what someone wrote about it is stored apart. */
const PART_SELECT = `
  SELECT c.part_idx AS idx, c.part_title AS title, COUNT(*) AS chapters,
         MIN(c.start) AS start, MAX(c.end) AS end,
         d.summary AS summary, d.image_path AS image_path
    FROM chapters c
    LEFT JOIN part_details d ON d.book_id = c.book_id AND d.idx = c.part_idx
   WHERE c.book_id = ? AND c.part_idx IS NOT NULL`;
const PART_GROUP = ' GROUP BY c.part_idx, c.part_title ORDER BY c.part_idx';

export async function listParts(bookId: string): Promise<Part[]> {
  const database = await db();
  return database.getAllAsync<Part>(PART_SELECT + PART_GROUP, bookId);
}

export async function getPart(bookId: string, idx: number): Promise<Part | null> {
  const database = await db();
  const row = await database.getFirstAsync<Part>(
    `${PART_SELECT} AND c.part_idx = ?${PART_GROUP}`,
    bookId, idx
  );
  return row ?? null;
}

/** The title lives on the chapters, so renaming one is renaming all of them. */
export async function renamePart(bookId: string, idx: number, title: string) {
  const database = await db();
  await database.runAsync(
    'UPDATE chapters SET part_title = ? WHERE book_id = ? AND part_idx = ?',
    title.trim(), bookId, idx
  );
}

export async function setPartDetail(
  bookId: string,
  idx: number,
  changes: { summary?: string | null; image_path?: string | null }
) {
  const database = await db();
  await database.runAsync(
    'INSERT OR IGNORE INTO part_details (book_id, idx) VALUES (?, ?)',
    bookId, idx
  );
  const fields = (['summary', 'image_path'] as const).filter((field) => field in changes);
  if (!fields.length) return;
  await database.runAsync(
    `UPDATE part_details SET ${fields.map((field) => `${field} = ?`).join(', ')}
      WHERE book_id = ? AND idx = ?`,
    [...fields.map((field) => changes[field] ?? null), bookId, idx]
  );
}

export async function listPartChapters(bookId: string, partIdx: number): Promise<Chapter[]> {
  const database = await db();
  return database.getAllAsync<Chapter>(
    'SELECT * FROM chapters WHERE book_id = ? AND part_idx = ? ORDER BY idx',
    bookId, partIdx
  );
}

/** The verses inside one range of the book — a part's, on its own page. */
export async function countVersesIn(bookId: string, start: number, end: number): Promise<number> {
  const database = await db();
  const row = await database.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM verses WHERE book_id = ? AND start >= ? AND start < ?',
    bookId, start, end
  );
  return row?.n ?? 0;
}

export async function countVerses(bookId: string): Promise<number> {
  const database = await db();
  const row = await database.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM verses WHERE book_id = ?',
    bookId
  );
  return row?.n ?? 0;
}

/** The verses of one chapter, in reading order. */
export type Verse = { number: number; start: number; end: number };

export async function listVerses(chapterId: string): Promise<Verse[]> {
  const database = await db();
  return database.getAllAsync<Verse>(
    'SELECT number, start, end FROM verses WHERE chapter_id = ? ORDER BY number',
    chapterId
  );
}

export async function listChapters(bookId: string): Promise<Chapter[]> {
  const database = await db();
  return database.getAllAsync<Chapter>(
    'SELECT * FROM chapters WHERE book_id = ? ORDER BY idx',
    bookId
  );
}

/** What an importer has to know. What the reader thought of it is never its business. */
export type ImportedBook = Omit<
  Book,
  | 'id'
  | 'created_at'
  | 'year'
  | 'edition'
  | 'cover_path'
  | 'summary'
  | 'text_source'
  | 'stars'
  | 'review'
  | 'rated_at'
  | 'status'
  | 'impressions'
  | 'isbn'
>;

export async function saveImportedBook(input: {
  book: ImportedBook;
  text: string;
  hints: StructureHint[];
  chapters: ChapterInsert[];
  scenes: { chapterIndex: number; start: number; end: number }[];
  /** Scripture: the citable unit, and what this edition calls its own books. */
  verses?: { chapterIndex: number; number: number; start: number; end: number }[];
  partNames?: { part_idx: number; names: string[] }[];
}): Promise<string> {
  const database = await db();
  const id = newId();
  const now = Date.now();
  await transaction(async () => {
    await database.runAsync(
      `INSERT INTO books (id, title, author, language, kind, source_name, source_hash, source_path,
                          source_ext, word_count, char_count, cover_hue, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      input.book.title,
      input.book.author,
      input.book.language,
      input.book.kind,
      input.book.source_name,
      input.book.source_hash,
      input.book.source_path,
      input.book.source_ext,
      input.book.word_count,
      input.book.char_count,
      input.book.cover_hue,
      now
    );
    await database.runAsync(
      'INSERT INTO documents (book_id, text, hints) VALUES (?, ?, ?)',
      id,
      input.text,
      JSON.stringify(input.hints)
    );
    const chapterIds = await insertChapters(database, id, input.chapters);
    await insertScenes(database, id, chapterIds, input.scenes);
    await insertVerses(database, id, chapterIds, input.verses ?? []);
    for (const part of input.partNames ?? []) {
      for (const name of part.names) {
        await database.runAsync(
          'INSERT OR IGNORE INTO part_names (book_id, part_idx, name) VALUES (?, ?, ?)',
          id, part.part_idx, name
        );
      }
    }
    await database.runAsync(
      'INSERT INTO reading_state (book_id, offset, updated_at) VALUES (?, 0, ?)',
      id,
      now
    );
  });
  return id;
}

/**
 * A book with structure and no text: the chapters are known in advance and
 * each one's words are fetched when it is opened. There is no manuscript to
 * measure, so every offset is zero and stays that way — what addresses a
 * chapter here is its name, which is also how it is asked for.
 */
export async function findRemoteBook(source: string): Promise<Book | null> {
  const database = await db();
  const row = await database.getFirstAsync<Book>(
    'SELECT * FROM books WHERE text_source = ? LIMIT 1',
    source
  );
  return row ?? null;
}

export async function saveRemoteBook(input: {
  book: Omit<ImportedBook, 'word_count' | 'char_count'> & { text_source: string };
  chapters: ChapterInsert[];
  partNames?: { part_idx: number; names: string[] }[];
}): Promise<string> {
  const database = await db();
  const id = newId();
  const now = Date.now();
  await transaction(async () => {
    await database.runAsync(
      `INSERT INTO books (id, title, author, language, kind, source_name, source_hash, source_path,
                          source_ext, word_count, char_count, cover_hue, text_source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?)`,
      id,
      input.book.title,
      input.book.author,
      input.book.language,
      input.book.kind,
      input.book.source_name,
      input.book.source_hash,
      input.book.source_path,
      input.book.source_ext,
      input.book.cover_hue,
      input.book.text_source,
      now
    );
    await database.runAsync('INSERT INTO documents (book_id, text, hints) VALUES (?, ?, ?)', id, '', '[]');
    await insertChapters(database, id, input.chapters);
    for (const part of input.partNames ?? []) {
      for (const name of part.names) {
        await database.runAsync(
          'INSERT OR IGNORE INTO part_names (book_id, part_idx, name) VALUES (?, ?, ?)',
          id, part.part_idx, name
        );
      }
    }
    await database.runAsync(
      'INSERT INTO reading_state (book_id, offset, updated_at) VALUES (?, 0, ?)',
      id, now
    );
  });
  return id;
}

/**
 * A book with no words at all, and none coming: a record of one read on paper,
 * borrowed, or only meant to be read. It is an ordinary row in every other
 * respect — it takes notes, chapters, a cast, a rating — so nothing downstream
 * has to learn a second kind of book; what marks it is a manuscript of zero
 * length and no source to fetch one from. See `books/record`.
 */
export type RecordedBook = {
  title: string;
  author?: string | null;
  year?: string | null;
  language?: string;
  kind: string;
  /** Where the details came from: a catalog, an export, or the reader. */
  source_name: string;
  /** The catalog's own id, when there is one, so the same book is only added once. */
  source_hash?: string;
  cover_hue?: number;
  cover_path?: string | null;
  summary?: string | null;
  stars?: number | null;
  review?: string | null;
  rated_at?: number | null;
  status?: string | null;
};

export async function saveRecordBook(input: RecordedBook): Promise<string> {
  const database = await db();
  const id = newId();
  const now = Date.now();
  await transaction(async () => {
    await database.runAsync(
      `INSERT INTO books (id, title, author, year, language, kind, source_name, source_hash,
                          source_path, source_ext, word_count, char_count, cover_hue, cover_path,
                          summary, stars, review, rated_at, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', '', 0, 0, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      input.title,
      input.author ?? null,
      input.year ?? null,
      input.language ?? 'en',
      input.kind,
      input.source_name,
      input.source_hash ?? '',
      input.cover_hue ?? 0,
      input.cover_path ?? null,
      input.summary ?? null,
      input.stars ?? null,
      input.review ?? null,
      input.rated_at ?? null,
      input.status ?? null,
      now
    );
    // Empty, but there: everything that reads a book expects a document row.
    await database.runAsync('INSERT INTO documents (book_id, text, hints) VALUES (?, ?, ?)', id, '', '[]');
    await database.runAsync(
      'INSERT INTO reading_state (book_id, offset, updated_at) VALUES (?, 0, ?)',
      id, now
    );
  });
  return id;
}

/**
 * The same book, already on the shelf. An imported library is mostly books the
 * reader has been adding for years, and adding a second row for one of them is
 * worse than skipping it: the notes go to one and the rating to the other.
 *
 * The title has to match, case and outer space aside, and the author has to
 * either match or be missing here. Deliberately strict: two books with the
 * same title are common, and merging the wrong pair puts somebody's review on
 * a book they never read — a duplicate is the cheaper mistake.
 */
export async function findBookNamed(title: string, author?: string | null): Promise<Book | null> {
  const database = await db();
  const row = await database.getFirstAsync<Book>(
    `SELECT * FROM books
      WHERE LOWER(TRIM(title)) = ?
        AND (? = '' OR author IS NULL OR LOWER(TRIM(author)) = ?)
      LIMIT 1`,
    title.trim().toLowerCase(),
    (author ?? '').trim().toLowerCase(),
    (author ?? '').trim().toLowerCase()
  );
  return row ?? null;
}

/** Already here under the id the catalog knows it by. */
export async function findRecordFrom(sourceName: string, sourceHash: string): Promise<Book | null> {
  const database = await db();
  const row = await database.getFirstAsync<Book>(
    'SELECT * FROM books WHERE source_name = ? AND source_hash = ? LIMIT 1',
    sourceName,
    sourceHash
  );
  return row ?? null;
}

/**
 * Stars and the review are one act, not two settings: rating a book is saying
 * what you thought of it, and the date is when you said so.
 */
export async function rateBook(
  id: string,
  changes: { stars?: number | null; review?: string | null }
) {
  const database = await db();
  const fields: string[] = [];
  const values: (string | number | null)[] = [];
  if ('stars' in changes) {
    fields.push('stars = ?');
    values.push(changes.stars ?? null);
  }
  if ('review' in changes) {
    fields.push('review = ?');
    values.push(changes.review?.trim() || null);
  }
  if (!fields.length) return;
  fields.push('rated_at = ?');
  values.push(Date.now());
  await database.runAsync(`UPDATE books SET ${fields.join(', ')} WHERE id = ?`, [...values, id]);
}

/** A novel can carry 500+ chapters; one statement per row is 6x the round trips. */
const CHAPTER_BATCH = 200;

export type ChapterInsert = {
  /** Only a record has one: what a model remembers of a chapter with no text. */
  recap?: string | null;
  title: string;
  start: number;
  end: number;
  confident: boolean;
  userEdited?: boolean;
  brief?: string | null;
  /** The level above: a bible's book, a novel's 卷. Null for books without one. */
  part_idx?: number | null;
  part_title?: string | null;
};

async function insertChapters(
  database: Awaited<ReturnType<typeof db>>,
  bookId: string,
  chapters: ChapterInsert[]
): Promise<string[]> {
  const ids = chapters.map(() => newId());
  for (let from = 0; from < chapters.length; from += CHAPTER_BATCH) {
    const slice = chapters.slice(from, from + CHAPTER_BATCH);
    const values: (string | number | null)[] = [];
    const rows = slice.map((chapter, offset) => {
      values.push(ids[from + offset], bookId, from + offset, chapter.title, chapter.start,
        chapter.end, chapter.confident ? 1 : 0, chapter.userEdited ? 1 : 0, chapter.brief ?? null,
        chapter.part_idx ?? null, chapter.part_title ?? null, chapter.recap ?? null);
      return '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
    });
    await database.runAsync(
      `INSERT INTO chapters (id, book_id, idx, title, start, end, confident, user_edited, brief,
                             part_idx, part_title, recap)
       VALUES ${rows.join(', ')}`,
      values
    );
  }
  return ids;
}

const VERSE_BATCH = 200;

async function insertVerses(
  database: Awaited<ReturnType<typeof db>>,
  bookId: string,
  chapterIds: string[],
  verses: { chapterIndex: number; number: number; start: number; end: number }[]
) {
  for (let from = 0; from < verses.length; from += VERSE_BATCH) {
    const slice = verses.slice(from, from + VERSE_BATCH);
    const values: (string | number)[] = [];
    const rows: string[] = [];
    for (const verse of slice) {
      const chapterId = chapterIds[verse.chapterIndex];
      if (!chapterId) continue;
      values.push(bookId, chapterId, verse.number, verse.start, verse.end);
      rows.push('(?, ?, ?, ?, ?)');
    }
    if (!rows.length) continue;
    await database.runAsync(
      `INSERT OR REPLACE INTO verses (book_id, chapter_id, number, start, end)
       VALUES ${rows.join(', ')}`,
      values
    );
  }
}

async function insertScenes(
  database: Awaited<ReturnType<typeof db>>,
  bookId: string,
  chapterIds: string[],
  scenes: { chapterIndex: number; start: number; end: number }[]
) {
  const perChapter = new Map<number, number>();
  for (let from = 0; from < scenes.length; from += CHAPTER_BATCH) {
    const slice = scenes.slice(from, from + CHAPTER_BATCH);
    const values: (string | number)[] = [];
    const rows: string[] = [];
    for (const scene of slice) {
      const chapterId = chapterIds[scene.chapterIndex];
      if (!chapterId) continue;
      const idx = perChapter.get(scene.chapterIndex) ?? 0;
      perChapter.set(scene.chapterIndex, idx + 1);
      values.push(newId(), bookId, chapterId, idx, scene.start, scene.end);
      rows.push('(?, ?, ?, ?, ?, ?)');
    }
    if (!rows.length) continue;
    await database.runAsync(
      `INSERT INTO scenes (id, book_id, chapter_id, idx, start, end) VALUES ${rows.join(', ')}`,
      values
    );
  }
}

const BOOK_FIELDS = [
  'title', 'author', 'year', 'edition', 'cover_path', 'summary', 'kind', 'review', 'status',
  'impressions', 'isbn',
] as const;
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

/** The places this book has never been able to put on a map. */
export async function listUnlocatedPlaces(bookId: string): Promise<Entity[]> {
  const database = await db();
  return database.getAllAsync<Entity>(
    `SELECT * FROM entities
      WHERE book_id = ? AND kind = 'place' AND located IS NULL
      ORDER BY sort_index`,
    bookId
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

const ENTITY_FIELDS = [
  'name', 'alias', 'summary', 'portrait_path', 'fields', 'located', 'located_certainty', 'wiki',
] as const;
export type EditableEntityField = (typeof ENTITY_FIELDS)[number];

export async function updateEntity(
  id: string,
  changes: Partial<Record<EditableEntityField, string | number | null>>
) {
  const entries = ENTITY_FIELDS.filter((field) => field in changes);
  if (!entries.length) return;
  const database = await db();
  await database.runAsync(
    `UPDATE entities SET ${entries.map((field) => `${field} = ?`).join(', ')} WHERE id = ?`,
    [...entries.map((field) => changes[field] ?? null), id]
  );
}

/**
 * The first chapter to place a site has placed it. A later chapter would only
 * write the same coordinate again — or a worse one, or over the one you fixed
 * by hand — so a pin that exists is left alone.
 */
export async function setPinIfUnset(entityId: string, pin: Pin) {
  const database = await db();
  await database.runAsync(
    `UPDATE entities SET located = ?, located_certainty = ?
      WHERE id = ? AND located IS NULL`,
    pin.located,
    pin.located_certainty,
    entityId
  );
}

/** Written once, by whichever run got there first, and never over an edit. */
export async function setWikiIfUnset(entityId: string, url: string) {
  const database = await db();
  await database.runAsync(
    'UPDATE entities SET wiki = ? WHERE id = ? AND wiki IS NULL',
    url,
    entityId
  );
}

/**
 * A link written into the details before it had a column of its own. Moved
 * rather than copied: two places showing the same address, one of them
 * editable and one of them not, is a bug waiting to be reported.
 */
export async function liftWikiField(entity: Entity): Promise<boolean> {
  const fields = parseFields(entity.fields);
  const found = fields.find(
    (field) => field.label.trim().toLowerCase() === 'wikipedia' && field.value.trim()
  );
  if (!found) return false;
  await updateEntity(entity.id, {
    wiki: found.value.trim(),
    fields: JSON.stringify(fields.filter((field) => field !== found)),
  });
  return true;
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

/**
 * The skeleton a restore put on the shelf, once the file it was waiting for is
 * imported and its work has been moved onto the real book. Two rows for one
 * book is worse than either of them alone, and the words are what decides
 * which is which: a skeleton has none.
 */
export async function supersedeSkeleton(sourceHash: string, keepId: string) {
  const database = await db();
  await database.runAsync(
    `DELETE FROM books
      WHERE source_hash = ? AND id != ? AND word_count = 0 AND text_source IS NULL`,
    sourceHash,
    keepId
  );
}

export async function getChapter(id: string): Promise<Chapter | null> {
  const database = await db();
  return database.getFirstAsync<Chapter>('SELECT * FROM chapters WHERE id = ?', id);
}

/** Who this chapter was seen to contain, with what it said about each of them. */
export type ChapterCast = Entity & {
  observed_appearance: string | null;
  observed_voice: string | null;
  observed_note: string | null;
};

export async function listChapterCast(bookId: string, chapterIdx: number): Promise<ChapterCast[]> {
  const database = await db();
  return database.getAllAsync<ChapterCast>(
    `SELECT e.*, o.appearance AS observed_appearance, o.voice AS observed_voice,
            o.note AS observed_note
       FROM observations o JOIN entities e ON e.id = o.entity_id
      WHERE o.book_id = ? AND o.chapter_idx = ? AND e.kind = 'character'
      ORDER BY e.name`,
    bookId,
    chapterIdx
  );
}

/**
 * Where the chapter actually goes, as the analysis recorded it — not every
 * place whose name happens to be spelled in the text, which listed somewhere a
 * character merely remembered as though the chapter were set there.
 */
export type ChapterPlace = Entity & { observed_note: string | null };

export async function listChapterPlaces(bookId: string, chapterIdx: number): Promise<ChapterPlace[]> {
  const database = await db();
  return database.getAllAsync<ChapterPlace>(
    `SELECT e.*, o.note AS observed_note
       FROM observations o JOIN entities e ON e.id = o.entity_id
      WHERE o.book_id = ? AND o.chapter_idx = ? AND e.kind = 'place'
      ORDER BY e.name`,
    bookId,
    chapterIdx
  );
}

export type ChapterTerm = Entity & { observed_note: string | null };

export async function listChapterTerms(bookId: string, chapterIdx: number): Promise<ChapterTerm[]> {
  const database = await db();
  return database.getAllAsync<ChapterTerm>(
    `SELECT e.*, o.note AS observed_note
       FROM observations o JOIN entities e ON e.id = o.entity_id
      WHERE o.book_id = ? AND o.chapter_idx = ? AND e.kind = 'term'
      ORDER BY e.name`,
    bookId,
    chapterIdx
  );
}

/** The chapters a place was recorded in, with whatever was said about it there. */
/**
 * A picture this shelf drew, and what it was drawn for.
 *
 * One row shape for all of them: a face, a view of a place, a cover, a passage
 * somebody wanted to see. What it belongs to is whichever of `entity_id`,
 * `chapter_idx` and the span is filled in — a free drawing fills none of them
 * and simply belongs to the book.
 */
export type ImageKind = 'cover' | 'portrait' | 'place' | 'term' | 'passage' | 'free';

export type Drawing = {
  id: string;
  book_id: string;
  entity_id: string | null;
  chapter_idx: number | null;
  start: number | null;
  end: number | null;
  kind: ImageKind;
  path: string;
  prompt: string;
  caption: string | null;
  created_at: number;
};

/** The book's whole gallery, newest first. */
export async function listImages(bookId: string): Promise<Drawing[]> {
  const database = await db();
  return database.getAllAsync<Drawing>(
    'SELECT * FROM images WHERE book_id = ? ORDER BY created_at DESC',
    bookId
  );
}

export async function imagesFor(entityId: string): Promise<Drawing[]> {
  const database = await db();
  return database.getAllAsync<Drawing>(
    'SELECT * FROM images WHERE entity_id = ? ORDER BY created_at DESC',
    entityId
  );
}

export async function imagesIn(bookId: string, chapterIdx: number): Promise<Drawing[]> {
  const database = await db();
  return database.getAllAsync<Drawing>(
    'SELECT * FROM images WHERE book_id = ? AND chapter_idx = ? ORDER BY created_at DESC',
    bookId,
    chapterIdx
  );
}

export async function addImage(input: {
  bookId: string;
  entityId?: string | null;
  chapterIdx?: number | null;
  start?: number | null;
  end?: number | null;
  kind: ImageKind;
  path: string;
  prompt: string;
}): Promise<string> {
  const database = await db();
  const id = newId();
  await database.runAsync(
    `INSERT INTO images
       (id, book_id, entity_id, chapter_idx, start, end, kind, path, prompt, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, input.bookId, input.entityId ?? null, input.chapterIdx ?? null,
    input.start ?? null, input.end ?? null, input.kind, input.path, input.prompt, Date.now()
  );
  return id;
}

export async function deleteImage(id: string) {
  const database = await db();
  await database.runAsync('DELETE FROM images WHERE id = ?', id);
}

export type PlaceVisit = { chapter_idx: number; note: string | null };

export async function listPlaceVisits(entityId: string): Promise<PlaceVisit[]> {
  const database = await db();
  return database.getAllAsync<PlaceVisit>(
    'SELECT chapter_idx, note FROM observations WHERE entity_id = ? ORDER BY chapter_idx',
    entityId
  );
}

/**
 * Who turns up here. A place has no appearance or voice of its own — what
 * makes one worth a page is the people it keeps putting in the same room.
 */
export type PlaceCompany = Entity & { shared: number };

export async function listPlaceCompany(entityId: string): Promise<PlaceCompany[]> {
  const database = await db();
  return database.getAllAsync<PlaceCompany>(
    `SELECT e.*, COUNT(*) AS shared
       FROM observations here
       JOIN observations others
         ON others.chapter_idx = here.chapter_idx AND others.book_id = here.book_id
       JOIN entities e ON e.id = others.entity_id
      WHERE here.entity_id = ? AND e.kind = 'character'
      GROUP BY e.id
      ORDER BY shared DESC, e.name`,
    entityId
  );
}

/** Scenes belonging to the chapters a place was recorded in. */
export async function listScenesAtPlace(entityId: string): Promise<Scene[]> {
  const database = await db();
  return database.getAllAsync<Scene>(
    `SELECT s.* FROM scenes s
       JOIN chapters c ON c.id = s.chapter_id
      WHERE c.idx IN (SELECT chapter_idx FROM observations WHERE entity_id = ?)
        AND c.book_id = (SELECT book_id FROM entities WHERE id = ?)
      ORDER BY c.idx, s.idx`,
    entityId,
    entityId
  );
}

export async function getScene(id: string): Promise<Scene | null> {
  const database = await db();
  return database.getFirstAsync<Scene>('SELECT * FROM scenes WHERE id = ?', id);
}

/** Scene text is the reader's to correct, like a chapter title. */
export async function updateScene(id: string, changes: { title?: string | null; summary?: string | null }) {
  const database = await db();
  const entries = (['title', 'summary'] as const).filter((field) => field in changes);
  if (!entries.length) return;
  await database.runAsync(
    `UPDATE scenes SET ${entries.map((field) => `${field} = ?`).join(', ')} WHERE id = ?`,
    [...entries.map((field) => changes[field] ?? null), id]
  );
}

/** Renaming from a chapter's own page, without rebuilding the whole structure. */
export async function renameChapterTitle(id: string, title: string) {
  const database = await db();
  await database.runAsync(
    'UPDATE chapters SET title = ?, user_edited = 1 WHERE id = ?',
    title.trim(),
    id
  );
}

export async function setChapterBrief(id: string, brief: string | null) {
  const database = await db();
  await database.runAsync('UPDATE chapters SET brief = ? WHERE id = ?', brief, id);
}

export async function setChapterRecap(id: string, recap: string | null) {
  const database = await db();
  await database.runAsync('UPDATE chapters SET recap = ? WHERE id = ?', recap, id);
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

export async function addAnnotation(input: {
  bookId: string;
  chapterId?: string | null;
  kind: AnnotationKind;
  start: number;
  end: number;
  quote: string;
  color: string | null;
  note?: string | null;
  prefix: string;
  suffix: string;
  /** Set for a note that quotes nothing — see the column. */
  standalone?: boolean;
}) {
  const database = await db();
  const id = newId();
  await database.runAsync(
    `INSERT INTO annotations (id, book_id, chapter_id, kind, color, start, end, quote, note,
                             prefix, suffix, standalone, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.bookId,
    input.chapterId ?? null,
    input.kind,
    input.color,
    input.start,
    input.end,
    input.quote,
    input.note ?? null,
    input.prefix,
    input.suffix,
    input.standalone ? 1 : 0,
    Date.now()
  );
  return id;
}

/**
 * A note about the book itself, or about one of its chapters — the shape a
 * reading journal is made of, and the only kind of note a book with no words
 * can have. It quotes nothing, so it has no offsets to be lost with.
 */
export function addStandaloneNote(input: {
  bookId: string;
  chapterId?: string | null;
  note: string;
}) {
  return addAnnotation({
    bookId: input.bookId,
    chapterId: input.chapterId ?? null,
    kind: 'note',
    start: 0,
    end: 0,
    quote: '',
    color: null,
    note: input.note,
    prefix: '',
    suffix: '',
    standalone: true,
  });
}

const ANNOTATION_FIELDS = ['kind', 'color', 'note', 'start', 'end'] as const;
export type EditableAnnotationField = (typeof ANNOTATION_FIELDS)[number];

export async function updateAnnotation(
  id: string,
  changes: Partial<Record<EditableAnnotationField, string | number | null>>
) {
  const entries = ANNOTATION_FIELDS.filter((field) => field in changes);
  if (!entries.length) return;
  const database = await db();
  await database.runAsync(
    `UPDATE annotations SET ${entries.map((field) => `${field} = ?`).join(', ')} WHERE id = ?`,
    [...entries.map((field) => changes[field] ?? null), id]
  );
}

export async function removeAnnotation(id: string) {
  const database = await db();
  await database.runAsync('DELETE FROM annotations WHERE id = ?', id);
}

/** Clearing out a page's worth of marks is one statement, not one per row. */
export async function removeAnnotations(ids: string[]) {
  if (!ids.length) return;
  const database = await db();
  await database.runAsync(
    `DELETE FROM annotations WHERE id IN (${ids.map(() => '?').join(',')})`,
    ...ids
  );
}

export async function lastReadAt(bookId: string): Promise<number | null> {
  const database = await db();
  const row = await database.getFirstAsync<{ updated_at: number }>(
    'SELECT updated_at FROM reading_state WHERE book_id = ?',
    bookId
  );
  return row?.updated_at ?? null;
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

/**
 * Opening a book is reading it. The shelf is ordered by when a book was last
 * read, and the offset alone could not say it: a chapter read without a scroll
 * writes nothing, and a fetched edition has no offsets to write — so both left
 * the book sitting where it was, under books nobody had opened in weeks.
 */
export async function touchRead(bookId: string) {
  const database = await db();
  await database.runAsync(
    `INSERT INTO reading_state (book_id, offset, updated_at) VALUES (?, 0, ?)
     ON CONFLICT(book_id) DO UPDATE SET updated_at = excluded.updated_at`,
    bookId,
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

export type Scene = {
  id: string;
  book_id: string;
  chapter_id: string;
  idx: number;
  start: number;
  end: number;
  title: string | null;
  summary: string | null;
  source: 'manual' | 'ai';
  /** The scene this span is one occurrence of; null while it has no name. */
  scene_tag_id: string | null;
};

/** A chapter's scenes are rewritten whole: they only make sense in order. */
export async function replaceScenes(
  bookId: string,
  chapterId: string,
  scenes: { start: number; end: number; title?: string | null; summary?: string | null }[],
  source: 'manual' | 'ai'
) {
  const database = await db();
  await transaction(async () => {
    await database.runAsync('DELETE FROM scenes WHERE chapter_id = ?', chapterId);
    for (const [idx, scene] of scenes.entries()) {
      // A name the pass came up with is the same name the reader would have
      // typed: filed under the scene it names, or the chapter list of an
      // AI-found scene would be empty while its name said otherwise.
      const tag = await tagFor(database, bookId, scene.title ?? '');
      await database.runAsync(
        `INSERT INTO scenes (id, book_id, chapter_id, idx, start, end, title, summary, source, scene_tag_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        newId(), bookId, chapterId, idx, scene.start, scene.end,
        scene.title?.trim() || null, scene.summary ?? null, source, tag
      );
    }
  });
}

/**
 * A scene the book returns to, and the spans that are it.
 *
 * The span is per chapter, because that is what a scene is where you read it.
 * The *name* is the thing two chapters share, so it is a row: renamed once
 * rather than retyped, and never split in two by a trailing space.
 */
export type SceneTag = {
  id: string;
  book_id: string;
  name: string;
  created_at: number;
};

/** Every span of one scene, in reading order — the chapter list a scene page shows. */
export async function scenesOfTag(tagId: string): Promise<Scene[]> {
  const database = await db();
  return database.getAllAsync<Scene>(
    `SELECT s.* FROM scenes s JOIN chapters c ON c.id = s.chapter_id
      WHERE s.scene_tag_id = ? ORDER BY c.idx, s.idx`,
    tagId
  );
}

/**
 * Naming a span is filing it under a scene: the same name twice is the same
 * scene, not two. Cleared, the span keeps its place in the chapter and simply
 * belongs to nothing — an unnamed scene is a break in the text, not a thing
 * the book comes back to.
 */
export async function nameScene(sceneId: string, name: string): Promise<string | null> {
  const database = await db();
  const scene = await database.getFirstAsync<{ book_id: string }>(
    'SELECT book_id FROM scenes WHERE id = ?',
    sceneId
  );
  if (!scene) return null;
  const tag = await tagFor(database, scene.book_id, name);
  await database.runAsync(
    'UPDATE scenes SET title = ?, scene_tag_id = ? WHERE id = ?',
    name.trim() || null, tag, sceneId
  );
  return tag;
}

/** The scene of that name in this book, made the first time anybody uses it. */
async function tagFor(
  database: Awaited<ReturnType<typeof db>>,
  bookId: string,
  name: string
): Promise<string | null> {
  const wanted = name.trim();
  if (!wanted) return null;
  await database.runAsync(
    `INSERT INTO scene_tags (id, book_id, name, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(book_id, name) DO NOTHING`,
    newId(), bookId, wanted, Date.now()
  );
  const row = await database.getFirstAsync<{ id: string }>(
    'SELECT id FROM scene_tags WHERE book_id = ? AND name = ?',
    bookId, wanted
  );
  return row?.id ?? null;
}

/** One write renames the scene everywhere it happens. */
export async function renameSceneTag(tagId: string, name: string) {
  const wanted = name.trim();
  if (!wanted) return;
  const database = await db();
  await transaction(async () => {
    await database.runAsync('UPDATE scene_tags SET name = ? WHERE id = ?', wanted, tagId);
    await database.runAsync('UPDATE scenes SET title = ? WHERE scene_tag_id = ?', wanted, tagId);
  });
}

export async function listChapterScenes(chapterId: string): Promise<Scene[]> {
  const database = await db();
  return database.getAllAsync<Scene>(
    'SELECT * FROM scenes WHERE chapter_id = ? ORDER BY idx',
    chapterId
  );
}

export async function getDocument(bookId: string): Promise<{ text: string; hints: StructureHint[] }> {
  const database = await db();
  const row = await database.getFirstAsync<{ text: string; hints: string }>(
    'SELECT text, hints FROM documents WHERE book_id = ?',
    bookId
  );
  return { text: row?.text ?? '', hints: parseHints(row?.hints ?? '[]') };
}

export async function listScenes(bookId: string): Promise<Scene[]> {
  const database = await db();
  return database.getAllAsync<Scene>(
    `SELECT s.* FROM scenes s JOIN chapters c ON c.id = s.chapter_id
     WHERE s.book_id = ? ORDER BY c.idx, s.idx`,
    bookId
  );
}

export async function countScenes(bookId: string): Promise<number> {
  const database = await db();
  const row = await database.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM scenes WHERE book_id = ?',
    bookId
  );
  return row?.n ?? 0;
}

/**
 * Chapters are rewritten wholesale rather than patched: every edit shifts the
 * ranges around it, and one write of the whole list is both simpler and the
 * only way the `idx` sequence is guaranteed to stay dense.
 */
export type ChapterDraft = {
  title: string;
  start: number;
  end: number;
  confident: boolean;
  userEdited: boolean;
  brief?: string | null;
  /** Carried through every edit to the list: reordering must not lose it. */
  recap?: string | null;
};

/** Scene breaks are per chapter, and a chapter is the only thing that owns them. */
export async function setSceneBreaks(
  bookId: string,
  chapter: { id: string; start: number; end: number },
  breaks: number[]
) {
  const database = await db();
  const scenes = scenesFromBreaks(chapter, breaks);
  await transaction(async () => {
    await database.runAsync('DELETE FROM scenes WHERE chapter_id = ?', chapter.id);
    await insertScenes(
      database,
      bookId,
      [chapter.id],
      scenes.map((scene) => ({ chapterIndex: 0, ...scene }))
    );
  });
}

export async function replaceChapters(bookId: string, drafts: ChapterInsert[]) {
  const database = await db();
  await transaction(async () => {
    await database.runAsync('DELETE FROM scenes WHERE book_id = ?', bookId);
    await database.runAsync('DELETE FROM chapters WHERE book_id = ?', bookId);
    // Restructuring changes where chapters begin, so the old scene offsets are
    // meaningless — and nothing takes their place, because scenes are marked or
    // analyzed, never inferred from the text.
    await insertChapters(database, bookId, drafts);
    // A translated sentence knows where in the manuscript it is; which chapter
    // that is was written down beside it, and restructuring renumbers the
    // chapters underneath it. Left alone, a split three chapters back moves
    // every translation after it under the wrong number — and a reader asking
    // chapter 12 for its translation is handed nothing, as though it had never
    // been translated at all.
    await reindexByOffset(database, bookId);
  });
}

/** Sentences find their chapter again by the offsets they never lost. */
async function reindexByOffset(database: Database, bookId: string) {
  await database.runAsync(
    `UPDATE translation_units SET chapter_idx = (
       SELECT c.idx FROM chapters c
        WHERE c.book_id = translation_units.book_id
          AND translation_units.start >= c.start
          AND translation_units.start < c.end
     )
     WHERE book_id = ?
       AND EXISTS (
         SELECT 1 FROM chapters c
          WHERE c.book_id = translation_units.book_id
            AND translation_units.start >= c.start
            AND translation_units.start < c.end
       )`,
    bookId
  );
}

export function toDrafts(chapters: Chapter[]): ChapterDraft[] {
  return chapters.map((chapter) => ({
    title: chapter.title,
    start: chapter.start,
    end: chapter.end,
    confident: !!chapter.confident,
    userEdited: !!chapter.user_edited,
    brief: chapter.brief,
    recap: chapter.recap,
  }));
}

/**
 * A re-run must not throw away corrections, so a freshly detected chapter
 * inherits the title of a user-edited one starting at the same place.
 */
export function mergeUserEdits(fresh: ChapterDraft[], previous: Chapter[]): ChapterDraft[] {
  const edited = new Map(
    previous.filter((chapter) => chapter.user_edited).map((chapter) => [chapter.start, chapter.title])
  );
  return fresh.map((draft) => {
    const title = edited.get(draft.start);
    return title === undefined ? draft : { ...draft, title, userEdited: true };
  });
}

/** Everything about one book that isn't derivable — the unit a backup carries. */
/**
 * The book-scoped tables a bundle carries beyond the reader's text, notes and
 * profiles. Everything here is work that cost something to make — a
 * translation, a glossary, an analysis someone paid a vendor for — and none of
 * it used to travel, so a restore handed back a book with its translations
 * gone. Caches and queues are deliberately absent: they cost nothing to make
 * again and mean nothing on another device.
 */
export const CARRIED_TABLES = [
  'translation_units',
  'translation_memory',
  'terms',
  'observations',
  'continuity_flags',
  'part_details',
  'part_names',
  'script_elements',
  'scene_tags',
  'relations',
  'mentions',
  'verses',
  // When the book was read. Of everything here this is the one thing that
  // cannot be made again from the book itself — a chapter can be re-analysed,
  // a translation re-run, but nobody can recover the Sunday they finished it.
  'reading_events',
] as const;

export type CarriedRows = Record<string, Record<string, unknown>[]>;

/** Ids are regenerated on restore, so every reference to one is rewritten. */
const REMAPPED: Record<string, 'book' | 'chapter' | 'entity'> = {
  book_id: 'book',
  chapter_id: 'chapter',
  entity_id: 'entity',
  from_id: 'entity',
  to_id: 'entity',
};

async function readCarried(
  database: Awaited<ReturnType<typeof db>>,
  bookId: string
): Promise<CarriedRows> {
  const carried: CarriedRows = {};
  for (const table of CARRIED_TABLES) {
    const rows = await database.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM ${table} WHERE book_id = ?`,
      bookId
    );
    if (rows.length) carried[table] = rows;
  }
  return carried;
}

async function writeCarried(
  database: Awaited<ReturnType<typeof db>>,
  carried: CarriedRows | undefined,
  ids: { book: string; chapter: Map<string, string>; entity: Map<string, string> }
) {
  for (const table of CARRIED_TABLES) {
    for (const row of carried?.[table] ?? []) {
      const columns: string[] = [];
      const values: unknown[] = [];
      for (const [column, value] of Object.entries(row)) {
        const kind = REMAPPED[column];
        if (kind === 'book') {
          columns.push(column);
          values.push(ids.book);
        } else if (kind && typeof value === 'string') {
          const mapped = ids[kind].get(value);
          // A row pointing at something this bundle didn't carry is dropped
          // rather than restored dangling.
          if (!mapped) { columns.length = 0; break; }
          columns.push(column);
          values.push(mapped);
        } else {
          columns.push(column);
          values.push(column === 'id' ? newId() : value);
        }
      }
      if (!columns.length) continue;
      await database.runAsync(
        `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
        values
      );
    }
  }
}

export type BookRecord = {
  book: Book;
  text: string;
  hints: StructureHint[];
  chapters: Chapter[];
  scenes: { chapter_index: number; idx: number; start: number; end: number }[];
  annotations: Annotation[];
  entities: Entity[];
  offset: number;
  /** What the reader filed it under, and which of their lists it is in. */
  tags?: string[];
  /** Translations, glossary, analysis — see `CARRIED_TABLES`. */
  carried?: CarriedRows;
  /**
   * A list is named rather than identified: ids do not survive a restore, and
   * what somebody means by "To read" is the name on it. The one list the app
   * ships is the exception — it travels as its own id, because its name is
   * translated and would come back as a second list in another language.
   */
  lists?: string[];
};

/**
 * `text: false` skips the manuscript entirely rather than reading a megabyte
 * out of SQLite to throw it away — which is what makes a content-free backup
 * cheap enough to run on every change.
 */
export async function readBookRecord(
  bookId: string,
  { text = true }: { text?: boolean } = {}
): Promise<BookRecord | null> {
  const book = await getBook(bookId);
  if (!book) return null;
  const database = await db();
  const [document, chapters, annotations, offset] = await Promise.all([
    text ? getDocument(bookId) : Promise.resolve({ text: '', hints: [] as StructureHint[] }),
    listChapters(bookId),
    listAnnotations(bookId),
    getProgress(bookId),
  ]);
  const entities = await database.getAllAsync<Entity>(
    'SELECT * FROM entities WHERE book_id = ? ORDER BY kind, sort_index',
    bookId
  );
  const byId = new Map(chapters.map((chapter, index) => [chapter.id, index]));
  const scenes = (await listScenes(bookId)).map((scene) => ({
    chapter_index: byId.get(scene.chapter_id) ?? 0,
    idx: scene.idx,
    start: scene.start,
    end: scene.end,
  }));
  return {
    book,
    text: document.text,
    hints: document.hints,
    chapters,
    annotations,
    entities,
    scenes,
    offset,
    carried: await readCarried(database, bookId),
    tags: await tagsOf(bookId),
    lists: (await listsHolding(bookId)).map((list) => (list.system ? FAVORITES : list.name)),
  };
}

/**
 * Restore always creates. Overwriting would mean deciding whose copy is right,
 * and the only person who can decide that is the one looking at both.
 */
export async function writeBookRecord(record: BookRecord): Promise<string> {
  const database = await db();
  const id = newId();
  const now = Date.now();
  const book = record.book;
  await transaction(async () => {
    await database.runAsync(
      `INSERT INTO books (id, title, author, year, edition, cover_path, language, kind, source_name,
                          source_hash, source_path, source_ext, word_count, char_count, cover_hue,
                          summary, text_source, stars, review, rated_at, status, impressions,
                          isbn, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, book.title, book.author, book.year, book.edition, book.cover_path, book.language,
      book.kind ?? DEFAULT_KIND, book.source_name, book.source_hash, book.source_path,
      book.source_ext, book.word_count, book.char_count, book.cover_hue, book.summary,
      // Whether the words are fetched or simply absent is what a record *is*,
      // and a rating is the reason a shelf was kept at all — a restore that
      // dropped either would hand back a different book.
      book.text_source ?? null, book.stars ?? null, book.review ?? null, book.rated_at ?? null,
      book.status ?? null, book.impressions ?? null, book.isbn ?? null, book.created_at || now
    );
    await database.runAsync(
      'INSERT INTO documents (book_id, text, hints) VALUES (?, ?, ?)',
      id, record.text, JSON.stringify(record.hints)
    );
    const chapterMap = new Map<string, string>();
    const entityMap = new Map<string, string>();
    const chapterIds = await insertChapters(
      database,
      id,
      record.chapters.map((chapter) => ({
        title: chapter.title,
        start: chapter.start,
        end: chapter.end,
        confident: !!chapter.confident,
        userEdited: !!chapter.user_edited,
        brief: chapter.brief,
        recap: chapter.recap,
      }))
    );
    record.chapters.forEach((chapter, index) => {
      if (chapter.id) chapterMap.set(chapter.id, chapterIds[index]);
    });
    await insertScenes(
      database,
      id,
      chapterIds,
      record.scenes.map((scene) => ({ chapterIndex: scene.chapter_index, start: scene.start, end: scene.end }))
    );
    for (const annotation of record.annotations) {
      await database.runAsync(
        `INSERT INTO annotations (id, book_id, kind, color, start, end, quote, note, prefix, suffix,
                                  standalone, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        newId(), id, annotation.kind, annotation.color, annotation.start, annotation.end,
        annotation.quote, annotation.note, annotation.prefix ?? '', annotation.suffix ?? '',
        annotation.standalone ?? 0, annotation.created_at
      );
    }
    for (const entity of record.entities) {
      const entityId = newId();
      entityMap.set(entity.id, entityId);
      await database.runAsync(
        `INSERT INTO entities (id, book_id, kind, name, alias, summary, portrait_path, fields,
                               located, located_certainty, wiki, sort_index, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        entityId, id, entity.kind, entity.name, entity.alias, entity.summary, entity.portrait_path,
        entity.fields, entity.located ?? null, entity.located_certainty ?? null,
        entity.wiki ?? null, entity.sort_index, entity.created_at
      );
    }
    await database.runAsync(
      'INSERT INTO reading_state (book_id, offset, updated_at) VALUES (?, ?, ?)',
      id, record.offset, now
    );
    await writeCarried(database, record.carried, { book: id, chapter: chapterMap, entity: entityMap });
  });
  for (const tag of record.tags ?? []) await addTag(id, tag);
  await refile(id, record.lists);
  return id;
}

/**
 * Back into the lists it was in, by name. A list that is already here takes
 * the book; one that is not is made — a restore onto a shelf that has since
 * grown merges with it rather than replacing what is there.
 */
async function refile(bookId: string, lists?: string[]) {
  for (const named of lists ?? []) {
    if (named === FAVORITES) {
      await setInList(FAVORITES, bookId, true);
      continue;
    }
    const existing = await findListNamed(named);
    await setInList(existing ?? (await createBookList(named)), bookId, true);
  }
}

/**
 * Puts a backed-up book's own work back onto a freshly imported copy of the
 * same file. The manuscript came from the file; everything here — corrected
 * chapters, notes, profiles, where they had got to — came from the reader,
 * and offsets line up because the source hash matching this record guarantees
 * the same normalized text.
 */
export async function attachBookRecord(bookId: string, record: BookRecord) {
  const database = await db();
  await transaction(async () => {
    const book = record.book;
    await database.runAsync(
      `UPDATE books SET title = ?, author = ?, year = ?, edition = ?, cover_path = ?,
                        kind = ?, cover_hue = ?, summary = ?, stars = ?, review = ?,
                        rated_at = ?, status = ?, impressions = ?, isbn = ? WHERE id = ?`,
      book.title, book.author, book.year, book.edition, book.cover_path,
      book.kind ?? DEFAULT_KIND, book.cover_hue, book.summary, book.stars ?? null,
      book.review ?? null, book.rated_at ?? null, book.status ?? null,
      book.impressions ?? null, book.isbn ?? null, bookId
    );
    await database.runAsync('DELETE FROM scenes WHERE book_id = ?', bookId);
    await database.runAsync('DELETE FROM chapters WHERE book_id = ?', bookId);
    await database.runAsync('DELETE FROM annotations WHERE book_id = ?', bookId);
    await database.runAsync('DELETE FROM entities WHERE book_id = ?', bookId);
    for (const table of CARRIED_TABLES) {
      await database.runAsync(`DELETE FROM ${table} WHERE book_id = ?`, bookId);
    }

    const chapterMap = new Map<string, string>();
    const entityMap = new Map<string, string>();
    const chapterIds = await insertChapters(
      database,
      bookId,
      record.chapters.map((chapter) => ({
        title: chapter.title,
        start: chapter.start,
        end: chapter.end,
        confident: !!chapter.confident,
        userEdited: !!chapter.user_edited,
        brief: chapter.brief,
        recap: chapter.recap,
      }))
    );
    record.chapters.forEach((chapter, index) => {
      if (chapter.id) chapterMap.set(chapter.id, chapterIds[index]);
    });
    await insertScenes(
      database,
      bookId,
      chapterIds,
      record.scenes.map((scene) => ({ chapterIndex: scene.chapter_index, start: scene.start, end: scene.end }))
    );
    for (const annotation of record.annotations) {
      await database.runAsync(
        `INSERT INTO annotations (id, book_id, kind, color, start, end, quote, note, prefix, suffix,
                                  standalone, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        newId(), bookId, annotation.kind, annotation.color, annotation.start, annotation.end,
        annotation.quote, annotation.note, annotation.prefix ?? '', annotation.suffix ?? '',
        annotation.standalone ?? 0, annotation.created_at
      );
    }
    for (const entity of record.entities) {
      const entityId = newId();
      entityMap.set(entity.id, entityId);
      await database.runAsync(
        `INSERT INTO entities (id, book_id, kind, name, alias, summary, portrait_path, fields,
                               located, located_certainty, wiki, sort_index, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        entityId, bookId, entity.kind, entity.name, entity.alias, entity.summary,
        entity.portrait_path, entity.fields, entity.located ?? null,
        entity.located_certainty ?? null, entity.wiki ?? null, entity.sort_index, entity.created_at
      );
    }
    await database.runAsync(
      'INSERT OR REPLACE INTO reading_state (book_id, offset, updated_at) VALUES (?, ?, ?)',
      bookId, record.offset, Date.now()
    );
    await writeCarried(database, record.carried, {
      book: bookId,
      chapter: chapterMap,
      entity: entityMap,
    });
  });
  for (const tag of record.tags ?? []) await addTag(bookId, tag);
  await refile(bookId, record.lists);
}

/**
 * Asked before every automatic backup: a copy of nothing must never replace a
 * copy of something. An emptied shelf is what a wipe, a fresh install and a
 * database that would not open all look like from here.
 */
export async function hasBooks(): Promise<boolean> {
  const database = await db();
  return (await database.getAllAsync<{ one: number }>('SELECT 1 AS one FROM books LIMIT 1')).length > 0;
}

export async function listBookIds(): Promise<string[]> {
  const database = await db();
  const rows = await database.getAllAsync<{ id: string }>('SELECT id FROM books ORDER BY created_at');
  return rows.map((row) => row.id);
}

export type Observation = {
  id: string;
  book_id: string;
  entity_id: string;
  chapter_idx: number;
  appearance: string | null;
  voice: string | null;
  note: string | null;
};

export type Mention = { entity_id: string; chapter_idx: number; count: number };

export type Relation = {
  id: string;
  book_id: string;
  from_id: string;
  to_id: string;
  label: string;
  note: string | null;
  first_chapter: number;
  last_chapter: number;
  source: 'manual' | 'ai';
};

export type ContinuityFlag = {
  id: string;
  book_id: string;
  entity_id: string;
  kind: string;
  detail: string;
  status: 'open' | 'dismissed';
  created_at: number;
};

const CAST_FIELDS = ['role', 'age', 'gender', 'appearance', 'voice', 'arc', 'source'] as const;
export type CastField = (typeof CAST_FIELDS)[number];

export async function updateCast(id: string, changes: Partial<Record<CastField, string | null>>) {
  const entries = CAST_FIELDS.filter((field) => field in changes);
  if (!entries.length) return;
  const database = await db();
  await database.runAsync(
    `UPDATE entities SET ${entries.map((field) => `${field} = ?`).join(', ')} WHERE id = ?`,
    [...entries.map((field) => changes[field] ?? null), id]
  );
}

/** An extracted profile is found by name or alias — the same person, once. */
export async function findOrCreateEntity(
  bookId: string,
  kind: EntityKind,
  name: string,
  aliases: string[]
): Promise<string> {
  const database = await db();
  const existing = await database.getAllAsync<Entity>(
    'SELECT * FROM entities WHERE book_id = ? AND kind = ?',
    bookId,
    kind
  );
  const wanted = [name, ...aliases].map(normalizeName);
  const match = existing.find((entity) => {
    const known = [entity.name, ...(entity.alias ?? '').split(/[,，、]/)].map(normalizeName);
    return known.some((value) => value && wanted.includes(value));
  });
  if (match) {
    const merged = mergeAliases(match, name, aliases);
    if (merged !== match.alias) await updateEntity(match.id, { alias: merged });
    return match.id;
  }
  const id = await createEntity(bookId, kind, name);
  if (aliases.length) await updateEntity(id, { alias: aliases.join(', ') });
  await updateCast(id, { source: 'ai' });
  return id;
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

function mergeAliases(entity: Entity, name: string, aliases: string[]): string | null {
  const known = new Set(
    (entity.alias ?? '').split(/[,，、]/).map((value) => value.trim()).filter(Boolean)
  );
  for (const alias of [name, ...aliases]) {
    if (alias.trim() && normalizeName(alias) !== normalizeName(entity.name)) known.add(alias.trim());
  }
  return known.size ? [...known].join(', ') : entity.alias;
}

/** One chapter, one observation: reading it again corrects it, never doubles it. */
export async function addObservation(input: Omit<Observation, 'id'>) {
  const database = await db();
  await database.runAsync(
    `INSERT INTO observations (id, book_id, entity_id, chapter_idx, appearance, voice, note)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(entity_id, chapter_idx) DO UPDATE SET
       appearance = excluded.appearance, voice = excluded.voice, note = excluded.note`,
    newId(), input.book_id, input.entity_id, input.chapter_idx, input.appearance, input.voice, input.note
  );
}

export async function listObservations(entityId: string): Promise<Observation[]> {
  const database = await db();
  return database.getAllAsync<Observation>(
    'SELECT * FROM observations WHERE entity_id = ? ORDER BY chapter_idx',
    entityId
  );
}

export async function clearCastAnalysis(bookId: string) {
  const database = await db();
  await transaction(async () => {
    await database.runAsync('DELETE FROM observations WHERE book_id = ?', bookId);
    await database.runAsync('DELETE FROM mentions WHERE book_id = ?', bookId);
    await database.runAsync('DELETE FROM relations WHERE book_id = ?', bookId);
    await database.runAsync('DELETE FROM continuity_flags WHERE book_id = ?', bookId);
    // Profiles the reader typed are theirs; only the generated ones go.
    await database.runAsync("DELETE FROM entities WHERE book_id = ? AND source = 'ai'", bookId);
  });
}

export async function replaceMentions(bookId: string, mentions: Mention[]) {
  const database = await db();
  await transaction(async () => {
    await database.runAsync('DELETE FROM mentions WHERE book_id = ?', bookId);
    for (const mention of mentions) {
      await database.runAsync(
        'INSERT INTO mentions (entity_id, book_id, chapter_idx, count) VALUES (?, ?, ?, ?)',
        mention.entity_id, bookId, mention.chapter_idx, mention.count
      );
    }
  });
}

export async function listMentions(bookId: string): Promise<Mention[]> {
  const database = await db();
  return database.getAllAsync<Mention>(
    'SELECT entity_id, chapter_idx, count FROM mentions WHERE book_id = ? ORDER BY chapter_idx',
    bookId
  );
}

/** Re-extraction replaces what the model found and leaves what the reader wrote. */
export async function replaceRelations(
  bookId: string,
  relations: Omit<Relation, 'id' | 'book_id' | 'source' | 'note'>[]
) {
  const database = await db();
  await transaction(async () => {
    await database.runAsync("DELETE FROM relations WHERE book_id = ? AND source = 'ai'", bookId);
    for (const relation of relations) {
      await database.runAsync(
        `INSERT INTO relations (id, book_id, from_id, to_id, label, first_chapter, last_chapter, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'ai')`,
        newId(), bookId, relation.from_id, relation.to_id, relation.label,
        relation.first_chapter, relation.last_chapter
      );
    }
  });
}

/**
 * One relation, as seen while reading one chapter. The pair is the identity:
 * a later chapter that sees the same two people widens the range it was seen
 * over instead of adding a second edge, and a label the reader wrote stays
 * theirs while the range keeps updating — the range is a fact about the book,
 * not an opinion about the pair.
 */
export async function recordRelation(input: {
  book_id: string;
  from_id: string;
  to_id: string;
  label: string;
  chapter_idx: number;
}) {
  const database = await db();
  const existing = await database.getFirstAsync<Relation>(
    `SELECT * FROM relations
      WHERE book_id = ? AND ((from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?))`,
    input.book_id, input.from_id, input.to_id, input.to_id, input.from_id
  );
  if (!existing) {
    await database.runAsync(
      `INSERT INTO relations (id, book_id, from_id, to_id, label, first_chapter, last_chapter, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'ai')`,
      newId(), input.book_id, input.from_id, input.to_id, input.label,
      input.chapter_idx, input.chapter_idx
    );
    return;
  }
  // The pair is stored in the order it was first seen. Told about it the other
  // way round, the word has to turn round with it: Isaac is Abraham's child.
  const said = existing.from_id === input.from_id ? input.label : reverseTie(input.label);
  await database.runAsync(
    'UPDATE relations SET label = ?, first_chapter = ?, last_chapter = ? WHERE id = ?',
    existing.source === 'manual' ? existing.label : said,
    Math.min(existing.first_chapter, input.chapter_idx),
    Math.max(existing.last_chapter, input.chapter_idx),
    existing.id
  );
}

export async function listRelations(bookId: string): Promise<Relation[]> {
  const database = await db();
  return database.getAllAsync<Relation>('SELECT * FROM relations WHERE book_id = ?', bookId);
}

/** AI-proposed details fill gaps; a label the reader already wrote stays theirs. */
export async function mergeFields(entityId: string, incoming: CustomField[]) {
  const entity = await getEntity(entityId);
  if (!entity) return;
  const existing = parseFields(entity.fields);
  const known = new Set(existing.map((field) => field.label.trim()));
  const added = incoming.filter(
    (field) =>
      typeof field?.label === 'string' &&
      typeof field?.value === 'string' &&
      field.label.trim() &&
      field.value.trim() &&
      !known.has(field.label.trim())
  );
  if (!added.length) return;
  await updateEntity(entityId, {
    fields: JSON.stringify([
      ...existing,
      ...added.map((field) => ({ label: field.label.trim(), value: field.value.trim() })),
    ]),
  });
}

/** Both directions, because "who is this person to me" has no arrow. */
export type RelationEdge = Relation & { other_id: string; other_name: string };

export async function listRelationsFor(entityId: string): Promise<RelationEdge[]> {
  const database = await db();
  return database.getAllAsync<RelationEdge>(
    `SELECT r.*,
            CASE WHEN r.from_id = ?1 THEN r.to_id ELSE r.from_id END AS other_id,
            e.name AS other_name
       FROM relations r
       JOIN entities e ON e.id = CASE WHEN r.from_id = ?1 THEN r.to_id ELSE r.from_id END
      WHERE r.from_id = ?1 OR r.to_id = ?1
      ORDER BY r.source DESC, e.name`,
    entityId
  );
}

export async function addRelation(input: {
  book_id: string;
  from_id: string;
  to_id: string;
  label: string;
  note?: string | null;
}): Promise<string> {
  const database = await db();
  const id = newId();
  await database.runAsync(
    `INSERT INTO relations (id, book_id, from_id, to_id, label, note, first_chapter, last_chapter, source)
     VALUES (?, ?, ?, ?, ?, ?, 0, 0, 'manual')`,
    id, input.book_id, input.from_id, input.to_id, input.label, input.note ?? null
  );
  return id;
}

/** Editing an extracted relation makes it the reader's, so a re-run keeps it. */
export async function updateRelation(id: string, changes: { label?: string; note?: string | null }) {
  const database = await db();
  const entries = (['label', 'note'] as const).filter((field) => field in changes);
  if (!entries.length) return;
  await database.runAsync(
    `UPDATE relations SET ${entries.map((field) => `${field} = ?`).join(', ')}, source = 'manual'
      WHERE id = ?`,
    [...entries.map((field) => changes[field] ?? null), id]
  );
}

export async function deleteRelation(id: string) {
  const database = await db();
  await database.runAsync('DELETE FROM relations WHERE id = ?', id);
}

export async function addFlags(bookId: string, flags: Omit<ContinuityFlag, 'id' | 'book_id' | 'created_at' | 'status'>[]) {
  const database = await db();
  const now = Date.now();
  for (const flag of flags) {
    await database.runAsync(
      `INSERT INTO continuity_flags (id, book_id, entity_id, kind, detail, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'open', ?)`,
      newId(), bookId, flag.entity_id, flag.kind, flag.detail, now
    );
  }
}

export async function listFlags(bookId: string): Promise<ContinuityFlag[]> {
  const database = await db();
  return database.getAllAsync<ContinuityFlag>(
    'SELECT * FROM continuity_flags WHERE book_id = ? ORDER BY status, created_at DESC',
    bookId
  );
}

export async function setFlagStatus(id: string, status: ContinuityFlag['status']) {
  const database = await db();
  await database.runAsync('UPDATE continuity_flags SET status = ? WHERE id = ?', status, id);
}
