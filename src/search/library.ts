import { db } from '../db';
import type { BookListItem } from '../db/repo';

export type ContentHit = {
  bookId: string;
  title: string;
  language: string;
  offset: number;
  excerpt: string;
};

export type MetaKind = 'chapter' | 'character' | 'place' | 'note';

/** Something the library records about a book, found by what it is called. */
export type MetaHit = {
  kind: MetaKind;
  /** What the row opens: a chapter, a person, a place. */
  id: string;
  bookId: string;
  label: string;
  /** The book it belongs to, and the part of it if there is one. */
  context: string;
  /** Set only where the match was somewhere other than the label. */
  excerpt?: string;
  rank: number;
};

export type LibraryResults = { meta: MetaHit[]; text: ContentHit[] };

export const NO_RESULTS: LibraryResults = { meta: [], text: [] };

/** Enough books to be useful, few enough that a keystroke stays cheap. */
const MAX_BOOKS = 8;
const HITS_PER_BOOK = 4;
const WINDOW = 70;

/** Rows the ranking may choose from, and rows a section ends up showing. */
const CANDIDATES = 200;
const KEEP = 12;

/**
 * What a match is worth, most wanted first: a book's name, then its author,
 * then a chapter, then a named person or place, then the rest of what a book
 * records about itself. Each band is three wide, for where in the field the
 * needle landed — so a buried title still beats a perfect edition note.
 */
const FIELD = { title: 0, author: 1, chapter: 2, name: 3, note: 4, other: 5 };
const MISS = Number.POSITIVE_INFINITY;

function rank(field: number, value: string | null | undefined, needle: string): number {
  if (!value) return MISS;
  const at = value.toLowerCase().indexOf(needle);
  if (at < 0) return MISS;
  const depth = at === 0 ? 0 : /[\s\p{P}]/u.test(value[at - 1]) ? 1 : 2;
  return field * 3 + depth;
}

/** The field's own words, cut to a line, around where the needle landed. */
function snippet(value: string, needle: string): string {
  const flat = value.replace(/\s+/g, ' ').trim();
  const at = flat.toLowerCase().indexOf(needle);
  const from = Math.max(0, at - 30);
  return (from > 0 ? '…' : '') + flat.slice(from, from + 120);
}

/** How well a book answers the query, or null if it doesn't. */
export function rankBook(book: BookListItem, query: string): number | null {
  const needle = query.trim().toLowerCase();
  if (!needle) return 0;
  const best = Math.min(
    rank(FIELD.title, book.title, needle),
    rank(FIELD.author, book.author, needle),
    ...[book.year, book.edition, book.summary, book.review, book.source_name].map(
      (value) => rank(FIELD.other, value, needle)
    )
  );
  return best === MISS ? null : best;
}

/**
 * Everything the library knows, asked at once: the named things first — they
 * are what someone is usually looking for and they cost a scan of short
 * columns — and then the manuscripts, which cost a scan of megabytes.
 *
 * The books themselves aren't here: the shelf is already in memory, so it is
 * ranked there with `rankBook` rather than asked for a second time.
 */
export async function searchLibrary(query: string): Promise<LibraryResults> {
  const needle = query.trim().toLowerCase();
  if (!needle) return NO_RESULTS;
  const meta = await searchMeta(needle);
  const text = await searchContent(needle);
  return { meta, text };
}

/**
 * Chapters and cast, by every name they carry. No index helps a needle that
 * may sit anywhere in a value, so both are capped: `CANDIDATES` rows are read
 * and the best `KEEP` of them survive. These are short columns — a bible's
 * 1,189 chapter titles are a few tens of kilobytes — which is the whole reason
 * this can run on a keystroke and `searchContent` has to wait for a pause.
 */
async function searchMeta(needle: string): Promise<MetaHit[]> {
  const database = await db();

  const chapters = await database.getAllAsync<{
    id: string; book_id: string; title: string; brief: string | null;
    part_title: string | null; book_title: string;
  }>(
    `SELECT c.id, c.book_id, c.title, c.brief, c.part_title, b.title AS book_title
     FROM chapters c JOIN books b ON b.id = c.book_id
     WHERE instr(lower(c.title), $needle) > 0
        OR instr(lower(COALESCE(c.part_title, '')), $needle) > 0
        OR instr(lower(COALESCE(c.brief, '')), $needle) > 0
     ORDER BY c.book_id, c.idx
     LIMIT ${CANDIDATES}`,
    { $needle: needle }
  );

  const entities = await database.getAllAsync<{
    id: string; book_id: string; kind: string; name: string; alias: string | null;
    summary: string | null; role: string | null; book_title: string;
  }>(
    `SELECT e.id, e.book_id, e.kind, e.name, e.alias, e.summary, e.role, b.title AS book_title
     FROM entities e JOIN books b ON b.id = e.book_id
     WHERE instr(lower(e.name), $needle) > 0
        OR instr(lower(COALESCE(e.alias, '')), $needle) > 0
        OR instr(lower(COALESCE(e.role, '')), $needle) > 0
        OR instr(lower(COALESCE(e.summary, '')), $needle) > 0
     ORDER BY e.sort_index
     LIMIT ${CANDIDATES}`,
    { $needle: needle }
  );

  /**
   * And the reader's own writing, which is the one thing here nobody else
   * wrote. A note is searched by what it says; the passage it was made on is
   * already found by `searchContent`, in the book's own words.
   */
  const notes = await database.getAllAsync<{
    id: string; book_id: string; note: string; chapter_title: string | null; book_title: string;
  }>(
    `SELECT a.id, a.book_id, a.note, c.title AS chapter_title, b.title AS book_title
     FROM annotations a
     JOIN books b ON b.id = a.book_id
     LEFT JOIN chapters c ON c.id = a.chapter_id
     WHERE a.note IS NOT NULL AND instr(lower(a.note), $needle) > 0
     ORDER BY a.created_at DESC
     LIMIT ${CANDIDATES}`,
    { $needle: needle }
  );

  const hits: MetaHit[] = [];

  for (const note of notes) {
    hits.push({
      kind: 'note',
      id: note.id,
      bookId: note.book_id,
      label: snippet(note.note, needle),
      context: note.chapter_title
        ? `${note.book_title} · ${note.chapter_title}`
        : note.book_title,
      rank: rank(FIELD.note, note.note, needle),
    });
  }

  for (const chapter of chapters) {
    const named = Math.min(
      rank(FIELD.chapter, chapter.title, needle),
      rank(FIELD.chapter, chapter.part_title, needle)
    );
    const described = rank(FIELD.other, chapter.brief, needle);
    hits.push({
      kind: 'chapter',
      id: chapter.id,
      bookId: chapter.book_id,
      label: chapter.title,
      context: chapter.part_title
        ? `${chapter.book_title} · ${chapter.part_title}`
        : chapter.book_title,
      excerpt: named === MISS && chapter.brief ? snippet(chapter.brief, needle) : undefined,
      rank: Math.min(named, described),
    });
  }

  for (const entity of entities) {
    const named = Math.min(
      rank(FIELD.name, entity.name, needle),
      rank(FIELD.name, entity.alias, needle)
    );
    const described = Math.min(
      rank(FIELD.other, entity.role, needle),
      rank(FIELD.other, entity.summary, needle)
    );
    const prose = entity.summary ?? entity.role;
    hits.push({
      kind: entity.kind === 'place' ? 'place' : 'character',
      id: entity.id,
      bookId: entity.book_id,
      label: entity.alias ? `${entity.name} · ${entity.alias}` : entity.name,
      context: entity.book_title,
      excerpt: named === MISS && prose ? snippet(prose, needle) : undefined,
      rank: Math.min(named, described),
    });
  }

  // Each section gets its own ceiling, so a book with a thousand chapters
  // can't crowd its own cast off the page.
  const ranked = hits.sort((a, b) => a.rank - b.rank);
  return [
    ...ranked.filter((hit) => hit.kind === 'chapter').slice(0, KEEP),
    ...ranked.filter((hit) => hit.kind === 'character' || hit.kind === 'place').slice(0, KEEP),
    ...ranked.filter((hit) => hit.kind === 'note').slice(0, KEEP),
  ];
}

/**
 * Searching the manuscripts, not just their titles — which is the only thing
 * that makes the box's promise true.
 *
 * The text never crosses into JS: SQLite is asked where the match is and for a
 * window around it, so a 3MB novel costs a few hundred bytes per hit instead
 * of being copied over the bridge to be scanned here.
 */
async function searchContent(needle: string): Promise<ContentHit[]> {
  if (needle.length < 2) return [];
  const database = await db();

  const books = await database.getAllAsync<{ book_id: string; title: string; language: string }>(
    `SELECT d.book_id, b.title, b.language
     FROM documents d JOIN books b ON b.id = d.book_id
     WHERE instr(lower(d.text), $needle) > 0
     ORDER BY b.created_at DESC
     LIMIT ${MAX_BOOKS}`,
    { $needle: needle }
  );

  const hits: ContentHit[] = [];
  for (const book of books) {
    // SQLite counts from 1; so does `substr`. The reader wants 0-based offsets.
    let from = 1;
    for (let found = 0; found < HITS_PER_BOOK; found++) {
      const row = await database.getFirstAsync<{ rel: number; excerpt: string }>(
        `SELECT instr(lower(substr(text, $from)), $needle) AS rel,
                substr(
                  text,
                  max(1, $from + instr(lower(substr(text, $from)), $needle) - 1 - ${WINDOW}),
                  ${WINDOW * 2 + 40}
                ) AS excerpt
         FROM documents WHERE book_id = $id`,
        { $from: from, $needle: needle, $id: book.book_id }
      );
      if (!row?.rel) break;
      const at = from + row.rel - 1;
      hits.push({
        bookId: book.book_id,
        title: book.title,
        language: book.language,
        offset: at - 1,
        excerpt: row.excerpt.replace(/\s+/g, ' ').trim(),
      });
      from = at + needle.length;
    }
  }
  return hits;
}
