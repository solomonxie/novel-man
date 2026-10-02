import { db, transaction } from '../db';
import { yieldToUI } from '../async/yield';
import { escapeLike, isAcronym, looseLike, score, wordLike } from './matching';

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
  /**
   * The whole record, for a row that was remembered rather than fetched in a
   * list — see `sources/seen`. Nothing searches it; it is what rebuilds the
   * thing the row stands for when there is no network to ask again.
   */
  payload?: string;
};

export type IndexedBook = IndexRow & { source: string };

export type IndexState = { fetchedAt: number; count: number };

/**
 * Rows are written in bites, so a 78,000-row catalog never blocks the UI — and
 * small enough that nine bound values a row stays under SQLite's older limit
 * of 999 parameters per statement, whatever build is underneath. It was 120
 * at eight values; `payload` is the ninth, and 120 of those would be 1,080.
 */
const CHUNK = 110;

/**
 * How many of those bites share one transaction. A commit is a write to the
 * journal and a flush to flash, and Gutenberg's list is 650 bites: as one
 * transaction each, the flushing cost more than the parsing, the inserting and
 * the download put together. Twelve to a transaction is fifty-odd commits
 * instead of six hundred, with a turn for the UI between each.
 */
const PER_TRANSACTION = 12;

export async function replaceIndex(
  source: string,
  rows: IndexRow[],
  onProgress?: (done: number, total: number) => void
): Promise<number> {
  const database = await db();
  await database.runAsync('DELETE FROM catalog WHERE source = ?', source);
  const span = CHUNK * PER_TRANSACTION;
  for (let from = 0; from < rows.length; from += span) {
    const group = rows.slice(from, from + span);
    await transaction(async () => {
      for (let at = 0; at < group.length; at += CHUNK) {
        const batch = group.slice(at, at + CHUNK);
        await writeRows(database, source, batch);
      }
    });
    onProgress?.(Math.min(from + span, rows.length), rows.length);
    // Between transactions rather than inside one: a turn for the UI while a
    // write is open is a turn another write can arrive in.
    await yieldToUI();
  }
  await database.runAsync(
    `INSERT OR REPLACE INTO catalog_state (source, fetched_at, count) VALUES (?, ?, ?)`,
    source, Date.now(), rows.length
  );
  return rows.length;
}

/** The one statement every write goes through, so the columns are listed once. */
async function writeRows(
  database: Awaited<ReturnType<typeof db>>,
  source: string,
  rows: IndexRow[]
) {
  const values = rows.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
  const args = rows.flatMap((row) => [
    source,
    row.extId,
    row.title,
    row.author,
    row.language,
    `${row.title} ${row.author} ${row.extra ?? ''}`.toLowerCase(),
    row.href ?? null,
    row.terms ?? null,
    row.payload ?? null,
  ]);
  await database.runAsync(
    `INSERT OR REPLACE INTO catalog
       (source, ext_id, title, author, language, needle, href, terms, payload)
     VALUES ${values}`,
    args
  );
}

/**
 * Rows added to a list rather than replacing one, and a ceiling on how many
 * of them there can be.
 *
 * A fetched list is whole and arrives at once, so `replaceIndex` empties the
 * source first. A remembered one grows a book at a time and must not: what is
 * already there is the point of it. The oldest go when it gets too big —
 * `rowid` is insertion order, which is the only clock this table has.
 */
export async function rememberRows(source: string, rows: IndexRow[], ceiling: number) {
  if (!rows.length) return;
  const database = await db();
  await transaction(async () => {
    for (let at = 0; at < rows.length; at += CHUNK) {
      await writeRows(database, source, rows.slice(at, at + CHUNK));
    }
    const counted = await database.getFirstAsync<{ n: number }>(
      'SELECT COUNT(*) AS n FROM catalog WHERE source = ?',
      source
    );
    let total = counted?.n ?? 0;
    // Only when it is actually full. This runs after every search, and the
    // prune sorts every row the source owns — thousands of them, to throw
    // away none, on a table nobody asked to tidy.
    if (total > ceiling) {
      await database.runAsync(
        `DELETE FROM catalog WHERE source = ? AND rowid NOT IN (
           SELECT rowid FROM catalog WHERE source = ? ORDER BY rowid DESC LIMIT ?
         )`,
        source, source, ceiling
      );
      total = ceiling;
    }
    await database.runAsync(
      'INSERT OR REPLACE INTO catalog_state (source, fetched_at, count) VALUES (?, ?, ?)',
      source, Date.now(), total
    );
  });
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
 * `loose` is whether a near miss is worth offering.
 *
 * It is right for the search page, where somebody is typing from memory and
 * `prejudce` should still find the book. It is wrong wherever the answer is a
 * claim about *which book this is* — the letters-in-order pass will match
 * almost any long title against any other, and a sheet asking "is this the
 * text of your book?" then offers `The Book of the Homeless` as the manuscript
 * of `Computer Architecture: A Quantitative Approach`. There, finding nothing
 * is the true answer and the page already has words for it.
 */
export async function searchIndex(
  query: string,
  sources: string[],
  limit = 50,
  loose = true
): Promise<IndexedBook[]> {
  if (!sources.length) return [];
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (sources.length === 1) return within(sources, terms, limit, loose);

  /**
   * A budget per list rather than one pool for all of them.
   *
   * Gutenberg holds 78,000 rows and eBible 1,286, so on any common word
   * Gutenberg took the whole limit and eBible's three matches never appeared
   * — while the page went on printing a heading for each source, implying
   * every one of them had been given a hearing. The rows scanned are the same
   * either way: the primary key leads with `source`, so a query per list
   * reads exactly the rows that list owns.
   */
  const share = Math.max(PER_SOURCE, Math.ceil(limit / sources.length));
  const found = await Promise.all(sources.map((source) => within([source], terms, share, loose)));
  return rank(found.flat(), terms, limit);
}

/**
 * Enough of a list to be worth a heading. Below this a source that genuinely
 * has the book looks like one that nearly does.
 */
const PER_SOURCE = 6;

/**
 * Every word has to appear somewhere in the row — "austen pride" finds the one
 * book rather than everything by her and everything proud.
 *
 * An empty query is not an empty answer: it is what the list already holds.
 * A search page that opens blank asks the reader to guess what is in it.
 *
 * Three passes, narrowest first, and each only runs if the one before it came
 * up short:
 *
 *  1. Where a word starts. This is what a reader means, and for a short word
 *     it is the only thing they can mean.
 *  2. Anywhere in the row, which is what finds a word inside a compound or a
 *     hyphenation.
 *  3. The letters in order, gaps allowed — what finds `Prejudice` from
 *     "prejudce" and `Nietzsche` from "nietzche", the two ways anybody
 *     mistypes a name they have only ever read.
 *
 * The last two are skipped entirely for an abbreviation. `NIV` under `%niv%`
 * is three thousand Universities, and under letters-in-order it is most of the
 * catalog — so a short word that matches no word matches nothing, and the page
 * gets to say so instead of burying it.
 */
async function within(
  sources: string[],
  terms: string[],
  limit: number,
  allowLoose: boolean
): Promise<IndexedBook[]> {
  if (!terms.length) return rank(await select(sources, [], limit), terms, limit);

  const whole = await select(sources, terms.map(wordLike), limit);
  if (whole.length >= limit || isAcronym(terms)) return rank(whole, terms, limit);

  const seen = new Set(whole.map(keyOf));
  const inside = (await select(sources, terms.map((term) => [`%${escapeLike(term)}%`]), limit))
    .filter((row) => !seen.has(keyOf(row)));
  const found = [...whole, ...inside];
  if (found.length >= limit || !allowLoose) return rank(found, terms, limit);

  for (const row of inside) seen.add(keyOf(row));
  const loose = (await select(sources, terms.map((term) => [looseLike(term)]), limit))
    .filter((row) => !seen.has(keyOf(row)));
  return rank([...found, ...loose], terms, limit);
}

function keyOf(row: IndexedBook): string {
  return `${row.source}-${row.extId}`;
}

/**
 * One group of patterns per term, and a row has to satisfy one pattern from
 * every group — "either spelling of this word, and then the next word too".
 */
async function select(
  sources: string[],
  groups: string[][],
  limit: number
): Promise<IndexedBook[]> {
  const database = await db();
  const where = [
    `source IN (${sources.map(() => '?').join(', ')})`,
    ...groups.map(
      (alternatives) =>
        `(${alternatives.map(() => "needle LIKE ? ESCAPE '\\'").join(' OR ')})`
    ),
  ].join(' AND ');
  const rows = await database.getAllAsync<{
    source: string;
    ext_id: string;
    title: string;
    author: string;
    language: string;
    href: string | null;
    terms: string | null;
    payload: string | null;
  }>(
    `SELECT source, ext_id, title, author, language, href, terms, payload FROM catalog
      WHERE ${where}
      ORDER BY length(title)
      LIMIT ?`,
    [...sources, ...groups.flat(), limit * 4]
  );
  return rows.map((row) => ({
    source: row.source,
    extId: row.ext_id,
    title: row.title,
    author: row.author,
    language: row.language,
    href: row.href ?? undefined,
    terms: row.terms ?? undefined,
    payload: row.payload ?? undefined,
  }));
}

function rank(rows: IndexedBook[], terms: string[], limit: number): IndexedBook[] {
  return [...rows]
    .sort((a, b) => score(b, terms) - score(a, terms) || a.title.length - b.title.length)
    .slice(0, limit);
}
