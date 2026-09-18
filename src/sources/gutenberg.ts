import { gunzipSync, strFromU8 } from 'fflate';

import { attr, decodeEntities, eachElement, firstTagText } from '../import/xml';
import { forEachCsvRow } from './csv';
import type { IndexRow } from './catalog';
import { yieldToUI } from '../async/yield';

/**
 * Project Gutenberg publishes its catalog as OPDS — Atom, with one entry per
 * book and, on a book's own feed, an acquisition link per format carrying the
 * type, the byte length and the licence line. So the search is the source's
 * own search and the download is a link it stated, the same bargain eBible's
 * catalog offers.
 *
 * Gutendex, the JSON mirror everyone reaches for first, took 39 seconds on a
 * two-word query and answers 400 to a Chinese one. This is first-party, fast,
 * and already speaks a format this app parses.
 */
const SEARCH = 'https://www.gutenberg.org/ebooks/search.opds/?query=';
/** The whole catalog, as Gutenberg publishes it: 5.6 MB, ~90,000 rows. */
const INDEX = 'https://www.gutenberg.org/cache/epub/feeds/pg_catalog.csv.gz';
const FEED = (id: string) => `https://www.gutenberg.org/ebooks/${id}.opds`;

export type GutenbergBook = { id: string; title: string; author: string };

/** A book once its own feed has been read: what will be fetched, and its terms. */
export type GutenbergEdition = GutenbergBook & {
  url: string;
  fileName: string;
  language: string;
  bytes: number;
  rights: string;
};

/**
 * The catalog, fetched whole. Gutenberg publishes it as one gzipped CSV, which
 * is a better bargain than its search endpoint: kept on the device the list is
 * instant, works with no signal, and can be searched in the same query as
 * every other source's.
 *
 * It returns the rows rather than writing them, so this file stays a function
 * of its bytes — the fixture tests run it outside the app, where there is no
 * database.
 */
export async function fetchGutenbergIndex(): Promise<IndexRow[]> {
  const response = await fetch(INDEX, { headers: { accept: 'application/octet-stream' } });
  if (!response.ok) throw new Error(`${response.status}`);
  const packed = new Uint8Array(await response.arrayBuffer());
  await yieldToUI();
  const csv = strFromU8(gunzipSync(packed));
  await yieldToUI();

  // Mapped to four short strings as each row is read, so the 21 MB of text
  // stays the only large thing in memory and goes as soon as this returns.
  const rows: IndexRow[] = [];
  forEachCsvRow(csv, (row) => {
    if (row.Type && row.Type !== 'Text') return;
    const title = row.Title?.replace(/\s+/g, ' ').trim();
    const id = row['Text#']?.trim();
    if (!id || !title) return;
    rows.push({
      extId: id,
      title,
      author: (row.Authors ?? '').replace(/\s+/g, ' ').trim(),
      language: (row.Language ?? '').trim(),
      extra: row.Bookshelves ?? '',
    });
  });
  return rows;
}

/** A row of the kept index is enough to start a download: the feed has the rest. */
export function bookFromIndex(row: { extId: string; title: string; author: string }): GutenbergBook {
  return { id: row.extId, title: row.title, author: row.author };
}

export async function searchGutenberg(query: string): Promise<GutenbergBook[]> {
  const response = await fetch(SEARCH + encodeURIComponent(query.trim()), {
    headers: { accept: 'application/atom+xml' },
  });
  if (!response.ok) throw new Error(`${response.status}`);
  return booksFrom(await response.text());
}

export async function readGutenbergBook(book: GutenbergBook): Promise<GutenbergEdition> {
  const response = await fetch(FEED(book.id), { headers: { accept: 'application/atom+xml' } });
  if (!response.ok) throw new Error(`${response.status}`);
  const edition = editionFrom(await response.text(), book);
  if (!edition) throw new Error('no epub');
  return edition;
}

/** A row of the search feed. Sort links and facets are entries too — skipped. */
export function booksFrom(feed: string): GutenbergBook[] {
  const books: GutenbergBook[] = [];
  for (const entry of eachElement(feed, 'entry')) {
    const id = /\/ebooks\/(\d+)\.opds/.exec(firstTagText(entry, 'id') ?? '')?.[1];
    const title = firstTagText(entry, 'title');
    if (!id || !title || books.some((book) => book.id === id)) continue;
    books.push({ id, title, author: firstTagText(entry, 'content') ?? '' });
  }
  return books;
}

const ACQUISITION = /<link\b[^>]*rel="http:\/\/opds-spec\.org\/acquisition"[^>]*>/g;

/**
 * A Gutenberg book is published twice, with images and without — 24.8 MB and
 * 558 KB of the same words. This app reads the words, so the smaller one is
 * not a compromise; it is the same book without the plates.
 */
export function editionFrom(feed: string, book: GutenbergBook): GutenbergEdition | null {
  let best: { url: string; bytes: number } | null = null;
  let language = '';
  let rights = '';
  for (const entry of eachElement(feed, 'entry')) {
    language ||= firstTagText(entry, 'dcterms:language') ?? '';
    rights ||= firstTagText(entry, 'rights') ?? '';
    for (const tag of entry.match(ACQUISITION) ?? []) {
      if (attr(tag, 'type') !== 'application/epub+zip') continue;
      const url = attr(tag, 'href');
      if (!url) continue;
      const bytes = Number.parseInt(attr(tag, 'length') ?? '', 10) || 0;
      if (!best || (bytes && bytes < best.bytes)) best = { url: decodeEntities(url), bytes };
    }
  }
  if (!best) return null;
  return { ...book, ...best, language, rights, fileName: fileNameFor(book) };
}

/**
 * The name the queue shows and the importer reads the format from. Gutenberg's
 * epub urls end `/ebooks/1342.epub.noimages`, which has no extension anything
 * downstream would recognise — so the book's own title becomes the file name.
 */
export function fileNameFor(book: GutenbergBook): string {
  const stem = book.title.replace(/[\\/:*?"<>|\n\r]+/g, ' ').trim().slice(0, 60) || `pg${book.id}`;
  return `${stem}.epub`;
}
