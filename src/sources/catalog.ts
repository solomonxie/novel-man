import { db, transaction } from '../db';
import { yieldToUI } from '../async/yield';
import { escapeLike, looseLike, score } from './matching';

/**
 * The index a source publishes, kept on the device — `apt update`, for books.
 * Searching somebody else's website means a request per keystroke, a result
 * only while there is signal, and whatever ranking they felt like. A list
 * fetched once is instant, works on a plane, and can be searched across every
 * source at once, which is the thing no single source can offer.
 */
export type IndexRow = {
  /** The id in the source's own numbering, and what a download is fetched by. */
  extId: string;
  title: string;
  author: string;
  language: string;
  /** Subjects, shelves — whatever else the source publishes to search on. */
  extra?: string;
  /**
   * What this row is downloaded from, and the licence line it comes under,
   * when the source stated both in the list itself. Left off by a source whose
   * books have a feed of their own to read at the moment of asking.
   */
  href?: string;
  terms?: string;
};

export type IndexedBook = IndexRow & { source: string };

export type IndexState = { fetchedAt: number; count: number };

/**
 * Rows are written in bites, so a 78,000-row catalog never blocks the UI — and
 * small enough that eight bound values a row stays under SQLite's older limit
 * of 999 parameters per statement, whatever build is underneath.
 */
const CHUNK = 120;

export async function replaceIndex(
  source: string,
  rows: IndexRow[],
  onProgress?: (done: number, total: number) => void
): Promise<number> {
  const database = await db();
  await database.runAsync('DELETE FROM catalog WHERE source = ?', source);
  for (let at = 0; at < rows.length; at += CHUNK) {
    const batch = rows.slice(at, at + CHUNK);
    const values = batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
    const args = batch.flatMap((row) => [
      source,
      row.extId,
      row.title,
      row.author,
      row.language,
      `${row.title} ${row.author} ${row.extra ?? ''}`.toLowerCase(),
      row.href ?? null,
      row.terms ?? null,
    ]);
    await transaction(() =>
      database.runAsync(
        `INSERT OR REPLACE INTO catalog (source, ext_id, title, author, language, needle, href, terms)
         VALUES ${values}`,
        args
      )
    );
    onProgress?.(Math.min(at + CHUNK, rows.length), rows.length);
    await yieldToUI();
  }
  await database.runAsync(
    `INSERT OR REPLACE INTO catalog_state (source, fetched_at, count) VALUES (?, ?, ?)`,
    source, Date.now(), rows.length
  );
  return rows.length;
}

export async function indexState(source: string): Promise<IndexState | null> {
  const database = await db();
  const row = await database.getFirstAsync<{ fetched_at: number; count: number }>(
    'SELECT fetched_at, count FROM catalog_state WHERE source = ?',
    source
  );
  return row ? { fetchedAt: row.fetched_at, count: row.count } : null;
}

/** Every list this device has kept, for a backup to write down. */
export async function keptCatalogs(): Promise<{ source: string; fetchedAt: number; count: number }[]> {
  const database = await db();
  const rows = await database.getAllAsync<{ source: string; fetched_at: number; count: number }>(
    'SELECT source, fetched_at, count FROM catalog_state ORDER BY source'
  );
  return rows.map((row) => ({ source: row.source, fetchedAt: row.fetched_at, count: row.count }));
}

/**
 * Which lists under one source are kept, and how big each is. A source that
 * keeps a list per category — Open Library's subjects — needs to say which
 * categories are on the device, and that is a question about the state table
 * rather than about any one of them.
 */
export async function keptIndexes(
  prefix: string
): Promise<{ source: string; fetchedAt: number; count: number }[]> {
  const database = await db();
  const rows = await database.getAllAsync<{ source: string; fetched_at: number; count: number }>(
    `SELECT source, fetched_at, count FROM catalog_state
      WHERE source LIKE ? ESCAPE '\\' ORDER BY source`,
    `${escapeLike(prefix)}%`
  );
  return rows.map((row) => ({ source: row.source, fetchedAt: row.fetched_at, count: row.count }));
}

/**
 * Every word has to appear somewhere in the row — "austen pride" finds the one
 * book rather than everything by her and everything proud. Ordered by the
 * shortest title, because a search for `Emma` wants Emma and not `Emma, and
 * Other Early Works`.
 *
 * An empty query is not an empty answer: it is what the list already holds.
 * A search page that opens blank asks the reader to guess what is in it.
 *
 * Two passes, strict then loose. The strict one is a substring per word and
 * answers most searches on its own; the loose one asks only that the letters
 * appear in order, which is what finds `Prejudice` from "prejudce" and
 * `Nietzsche` from "nietzche" — the two ways anybody actually mistypes a name
 * they have only ever read.
 */
export async function searchIndex(
  query: string,
  sources: string[],
  limit = 50
): Promise<IndexedBook[]> {
  if (!sources.length) return [];
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const strict = await select(sources, terms.map((term) => `%${escapeLike(term)}%`), limit);
  if (!terms.length || strict.length >= limit) return rank(strict, terms, limit);

  const loose = await select(sources, terms.map(looseLike), limit);
  const seen = new Set(strict.map((row) => `${row.source}-${row.extId}`));
  return rank(
    [...strict, ...loose.filter((row) => !seen.has(`${row.source}-${row.extId}`))],
    terms,
    limit
  );
}

async function select(sources: string[], patterns: string[], limit: number): Promise<IndexedBook[]> {
  const database = await db();
  const where = [
    `source IN (${sources.map(() => '?').join(', ')})`,
    ...patterns.map(() => "needle LIKE ? ESCAPE '\\'"),
  ].join(' AND ');
  const rows = await database.getAllAsync<{
    source: string;
    ext_id: string;
    title: string;
    author: string;
    language: string;
    href: string | null;
    terms: string | null;
  }>(
    `SELECT source, ext_id, title, author, language, href, terms FROM catalog
      WHERE ${where}
      ORDER BY length(title)
      LIMIT ?`,
    [...sources, ...patterns, limit * 4]
  );
  return rows.map((row) => ({
    source: row.source,
    extId: row.ext_id,
    title: row.title,
    author: row.author,
    language: row.language,
    href: row.href ?? undefined,
    terms: row.terms ?? undefined,
  }));
}

function rank(rows: IndexedBook[], terms: string[], limit: number): IndexedBook[] {
  return [...rows]
    .sort((a, b) => score(b, terms) - score(a, terms) || a.title.length - b.title.length)
    .slice(0, limit);
}
