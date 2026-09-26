import { forEachCsvRow } from './csv';
import { decodeEntities, eachElement, firstTagText } from '../import/xml';
import type { ReadingStatus } from '../books/record';

/**
 * A library somebody has already kept for years, brought over as it stands.
 *
 * Goodreads retired its API in 2020 — no new keys, and the old ones were
 * switched off — so there is no live sync to write against however much anyone
 * would like one. What is left is what they still publish to their own users,
 * and it is enough: the CSV export of an entire library, and a per-shelf RSS
 * feed. Both carry the three things this app cannot get from a catalog —
 * the rating, the review, and which shelf a book is on.
 *
 * Nothing here talks to a database or a file: it turns their bytes into rows,
 * so the fixtures can run it outside the app.
 */
export type Shelved = {
  /** Goodreads' own book id, so a second import updates rather than duplicates. */
  id: string;
  title: string;
  author: string;
  year: string;
  isbn: string;
  /** One to five as the reader gave it; null where they never rated it. */
  stars: number | null;
  review: string | null;
  /** Their private notes, which are a note about the book and not a review. */
  notes: string | null;
  status: ReadingStatus | null;
  /** When they finished it, or failing that when they shelved it. */
  at: number | null;
  /** The two apart, for a timeline that wants to say which was which. */
  read: number | null;
  added: number | null;
  /** Every shelf they filed it under, which is the closest thing to a category. */
  shelves: string[];
};

const EXPORT_SHELVES: Record<string, ReadingStatus> = {
  read: 'read',
  'currently-reading': 'reading',
  'to-read': 'wishlist',
};

/**
 * The export names one exclusive shelf per row; a feed lists every shelf a
 * book is on, comma separated — `to-read, math`. Reading only the whole string
 * meant a book filed under anything of the reader's own lost its status
 * entirely, which is most of a well-kept shelf.
 */
export function statusFromShelf(shelf: string | undefined): ReadingStatus | null {
  for (const name of (shelf ?? '').split(',')) {
    const known = EXPORT_SHELVES[name.trim().toLowerCase()];
    if (known) return known;
  }
  return null;
}

function starsFrom(value: string | undefined): number | null {
  const stars = Number.parseInt((value ?? '').trim(), 10);
  // Nought is how the export spells "never rated", not a rating of zero.
  return Number.isInteger(stars) && stars >= 1 && stars <= 5 ? stars : null;
}

/** A date they wrote as a day; the shelf only ever shows the year of it. */
function dateFrom(...values: (string | undefined)[]): number | null {
  for (const value of values) {
    const at = Date.parse((value ?? '').trim());
    if (Number.isFinite(at)) return at;
  }
  return null;
}

function yearFrom(...values: (string | undefined)[]): string {
  for (const value of values) {
    const year = Number.parseInt((value ?? '').trim(), 10);
    if (Number.isInteger(year) && year > 0 && year < 2200) return String(year);
  }
  return '';
}

/**
 * A review is typed into a web page, so it arrives as HTML: `<br/>` where the
 * reader pressed return, and entities for anything they quoted. Their
 * paragraphs are the point of keeping it, so the breaks become real ones.
 */
export function plainText(value: string | undefined): string | null {
  const text = decodeEntities((value ?? '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''))
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
  return text || null;
}

/** Goodreads puts the series in the title: `Dune (Dune, #1)`. That is the series. */
export function titleAndSeries(raw: string): { title: string; series: string } {
  const match = raw.trim().match(/^(.*?)\s*\(([^()]*#\s*[\d.]+)\)$/);
  if (!match) return { title: raw.replace(/\s+/g, ' ').trim(), series: '' };
  return { title: match[1].replace(/\s+/g, ' ').trim(), series: match[2].trim() };
}

function shelvesFrom(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((shelf) => shelf.trim())
    .filter((shelf) => shelf && !EXPORT_SHELVES[shelf]);
}

/** `="9780441013593"` — the export quotes an ISBN so a spreadsheet keeps its zeros. */
function isbnFrom(...values: (string | undefined)[]): string {
  for (const value of values) {
    const digits = (value ?? '').replace(/[^0-9Xx]/g, '');
    if (digits.length >= 10) return digits.toUpperCase();
  }
  return '';
}

/**
 * The export, row by row. Their column names have been stable for a decade,
 * and a row missing the two that matter — a title and an id — is dropped
 * rather than guessed at.
 */
export function booksFromExport(csv: string): Shelved[] {
  const found: Shelved[] = [];
  forEachCsvRow(csv, (row) => {
    const { title, series } = titleAndSeries(row['Title'] ?? '');
    if (!title) return;
    const shelves = shelvesFrom(row['Bookshelves']);
    if (series) shelves.unshift(series);
    found.push({
      id: (row['Book Id'] ?? '').trim(),
      title,
      author: (row['Author'] ?? '').replace(/\s+/g, ' ').trim(),
      year: yearFrom(row['Original Publication Year'], row['Year Published']),
      isbn: isbnFrom(row['ISBN13'], row['ISBN']),
      stars: starsFrom(row['My Rating']),
      review: plainText(row['My Review']),
      notes: plainText(row['Private Notes']),
      status: statusFromShelf(row['Exclusive Shelf']),
      at: dateFrom(row['Date Read'], row['Date Added']),
      read: dateFrom(row['Date Read']),
      added: dateFrom(row['Date Added']),
      shelves,
    });
  });
  return found;
}

/**
 * The other door, and the only one that can be opened twice without exporting
 * anything: a shelf's RSS feed. Goodreads still serves it to whoever has the
 * address — it is on the shelf page, and it carries the key that stands in for
 * signing in — so a feed url pasted once can be re-read whenever the shelf
 * changes. It says less than the export (no private notes, no dates added) and
 * it is paged a hundred books at a time.
 */
export function booksFromFeed(xml: string, shelf?: string | null): Shelved[] {
  const found: Shelved[] = [];
  for (const item of eachElement(xml, 'item')) {
    const { title, series } = titleAndSeries(decodeEntities(firstTagText(item, 'title') ?? ''));
    if (!title) continue;
    const shelves = shelvesFrom(firstTagText(item, 'user_shelves'));
    if (series) shelves.unshift(series);
    found.push({
      id: (firstTagText(item, 'book_id') ?? '').trim(),
      title,
      author: decodeEntities(firstTagText(item, 'author_name') ?? '').trim(),
      year: yearFrom(firstTagText(item, 'book_published')),
      isbn: isbnFrom(firstTagText(item, 'isbn')),
      stars: starsFrom(firstTagText(item, 'user_rating')),
      review: plainText(firstTagText(item, 'user_review')),
      notes: null,
      status:
        statusFromShelf(firstTagText(item, 'user_shelves')) ??
        statusFromShelf(shelf ?? undefined) ??
        (firstTagText(item, 'user_read_at')?.trim() ? 'read' : null),
      at: dateFrom(firstTagText(item, 'user_read_at'), firstTagText(item, 'user_date_added')),
      read: dateFrom(firstTagText(item, 'user_read_at')),
      added: dateFrom(firstTagText(item, 'user_date_added')),
      shelves,
    });
  }
  return found;
}

/**
 * What a pasted Goodreads address is for. Anything that is not one of theirs
 * is refused here rather than fetched — a url this app will send a request to
 * is the one thing not worth being relaxed about.
 *
 * Three things are the same shelf to us, because they are the same number: the
 * feed itself, the profile page a reader would copy out of their browser, and
 * the shelf listing. Nobody has the feed address to hand — it is three clicks
 * into a settings page most people have never opened — and the profile link is
 * the one they already know. The feed is public for a public profile, so no
 * key is needed to read it; a private one keeps its `key=` when pasted whole.
 */
const PROFILE = /^https:\/\/(www\.)?goodreads\.com\/(user\/show|review\/list(_rss)?)\/(\d+)/;

export function parseFeedUrl(pasted: string): { url: string; id: string; shelf: string | null } | null {
  const trimmed = pasted.trim();
  const matched = PROFILE.exec(trimmed);
  if (!matched) return null;
  const shelf = trimmed.match(/[?&]shelf=([^&]+)/);
  const named = shelf ? decodeURIComponent(shelf[1]) : null;
  // A feed address is kept exactly as pasted, key and all. Anything else is
  // only a user number, so the feed is built from it.
  const url = /\/review\/list_rss\//.test(trimmed)
    ? trimmed
    : `https://www.goodreads.com/review/list_rss/${matched[4]}${named ? `?shelf=${encodeURIComponent(named)}` : ''}`;
  return { url, id: matched[4], shelf: named };
}

/** A hundred to a page, in their numbering: `&page=2`. */
export function pageUrl(url: string, page: number): string {
  const withoutPage = url.replace(/([?&])page=\d+(&|$)/, (_whole, lead: string, tail: string) =>
    tail ? lead : ''
  );
  return `${withoutPage}${withoutPage.includes('?') ? '&' : '?'}page=${page}`;
}

const FEED_PAGES = 20;

/**
 * Whose shelf it is, in their own words: the feed titles itself "Solo's
 * bookshelf: all". Worth reading because it is the only human name in the
 * whole exchange — an address is a number, and a number is not something
 * anybody recognises their own library by.
 */
export function shelfOwner(xml: string): string | null {
  const channel = firstTagText(xml, 'title');
  return channel?.trim() || null;
}

export type Shelf = { books: Shelved[]; owner: string | null };

export async function fetchShelf(
  pasted: string,
  onProgress?: (books: number) => void
): Promise<Shelf> {
  const feed = parseFeedUrl(pasted);
  if (!feed) throw new Error('not a Goodreads shelf feed');
  const all: Shelved[] = [];
  const seen = new Set<string>();
  let owner: string | null = null;
  for (let page = 1; page <= FEED_PAGES; page++) {
    const response = await fetch(pageUrl(feed.url, page), { headers: { accept: 'application/xml' } });
    if (!response.ok) throw new Error(`${response.status}`);
    const xml = await response.text();
    owner ??= shelfOwner(xml);
    const batch = booksFromFeed(xml, feed.shelf);
    let fresh = 0;
    for (const book of batch) {
      const key = book.id || `${book.title}|${book.author}`;
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(book);
      fresh += 1;
    }
    onProgress?.(all.length);
    // A page that adds nothing new is the end of the shelf, or a feed that
    // ignores `page` — either way there is nothing further to ask for.
    if (!fresh) break;
  }
  return { books: all, owner };
}
