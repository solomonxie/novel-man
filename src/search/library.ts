import { db } from '../db';
import type { BookListItem } from '../db/repo';

export type ContentHit = {
  bookId: string;
  title: string;
  language: string;
  offset: number;
  excerpt: string;
};

/** Enough books to be useful, few enough that a keystroke stays cheap. */
const MAX_BOOKS = 8;
const HITS_PER_BOOK = 4;
const WINDOW = 70;

/**
 * Searching the manuscripts, not just their titles — which is the only thing
 * that makes the box's promise true.
 *
 * The text never crosses into JS: SQLite is asked where the match is and for a
 * window around it, so a 3MB novel costs a few hundred bytes per hit instead
 * of being copied over the bridge to be scanned here.
 */
export async function searchContent(query: string): Promise<ContentHit[]> {
  const needle = query.trim();
  if (needle.length < 2) return [];
  const database = await db();

  const books = await database.getAllAsync<{ book_id: string; title: string; language: string }>(
    `SELECT d.book_id, b.title, b.language
     FROM documents d JOIN books b ON b.id = d.book_id
     WHERE instr(lower(d.text), lower($needle)) > 0
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
        `SELECT instr(lower(substr(text, $from)), lower($needle)) AS rel,
                substr(
                  text,
                  max(1, $from + instr(lower(substr(text, $from)), lower($needle)) - 1 - ${WINDOW}),
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

export function matchesBook(book: BookListItem, query: string): boolean {
  const needle = query.trim().toLowerCase();
  return `${book.title} ${book.author ?? ''}`.toLowerCase().includes(needle);
}
