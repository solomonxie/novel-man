/**
 * One book, looked up in the catalogs that publish one for free.
 *
 * This is the deterministic half of filling in a shelf entry, and it is worth
 * saying what that means: a model can tell you what a book is *about*, but it
 * cannot hand you the cover of the 1997 printing, and asked for an ISBN it
 * will produce thirteen plausible digits. A catalog either has the record or
 * says it does not.
 *
 * Two of them, because neither is enough alone. Open Library is CC0, needs no
 * key and carries the covers; Google Books has the better coverage of
 * everything published this century and of anything not in English. Both
 * answer the same question in different shapes, so both are reduced to the
 * same row here and the reader picks from one list.
 */

import { score } from './matching';

export type Candidate = {
  /** Unique within its source, and what the list is keyed by. */
  id: string;
  source: 'openlibrary' | 'google';
  title: string;
  author: string | null;
  year: string | null;
  isbn: string | null;
  language: string | null;
  /** Small enough for a grid of ten. */
  thumb: string | null;
  /** The one that gets kept, when this row is chosen. */
  cover: string | null;
  summary: string | null;
  /** Open Library only: the edition, for asking it the things a search omits. */
  edition: string | null;
};

const OL_SEARCH = 'https://openlibrary.org/search.json';
const OL_COVER = 'https://covers.openlibrary.org/b';
const OL_BOOK = 'https://openlibrary.org/books';
const GOOGLE = 'https://www.googleapis.com/books/v1/volumes';

/**
 * The digits and nothing else. An ISBN is printed with hyphens, read aloud
 * with spaces, and copied out of a web page with both.
 */
export function cleanIsbn(raw: string): string {
  return raw.replace(/[^0-9Xx]/g, '').toUpperCase();
}

/**
 * Whether those digits are an ISBN at all. Both check digits are worth
 * computing rather than trusting a length: the commonest way an ISBN is wrong
 * is a transposed pair, which the checksum catches and a length test does not.
 */
export function isIsbn(raw: string): boolean {
  const digits = cleanIsbn(raw);
  if (digits.length === 10) {
    let sum = 0;
    for (let at = 0; at < 10; at++) {
      const value = digits[at] === 'X' ? 10 : Number(digits[at]);
      if (Number.isNaN(value) || (value === 10 && at !== 9)) return false;
      sum += value * (10 - at);
    }
    return sum % 11 === 0;
  }
  if (digits.length === 13) {
    if (!/^\d{13}$/.test(digits)) return false;
    let sum = 0;
    for (let at = 0; at < 13; at++) sum += Number(digits[at]) * (at % 2 ? 3 : 1);
    return sum % 10 === 0;
  }
  return false;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function firstString(value: unknown): string | null {
  return Array.isArray(value) ? text(value[0]) : text(value);
}

/** `1997-06` and `June 1997` and `1997` are all the year, which is all we keep. */
function yearOf(value: unknown): string | null {
  const found = String(value ?? '').match(/\d{4}/);
  return found ? found[0] : null;
}

export function olCover(coverId: number, size: 'S' | 'M' | 'L'): string {
  return `${OL_COVER}/id/${coverId}-${size}.jpg`;
}

/** `default=false` is what makes a missing cover a 404 rather than a 1×1 pixel. */
export function olCoverByIsbn(isbn: string, size: 'S' | 'M' | 'L'): string {
  return `${OL_COVER}/isbn/${cleanIsbn(isbn)}-${size}.jpg?default=false`;
}

/**
 * Google serves one cover URL at several sizes through a `zoom` it puts in the
 * query, and curls the corner of it by default — a paper fold drawn onto a
 * picture of a paper book, which looks like damage on a shelf of flat covers.
 */
export function googleCover(url: string, zoom: 0 | 1): string {
  return url
    .replace(/^http:/, 'https:')
    .replace(/&edge=curl/, '')
    .replace(/([?&])zoom=\d/, `$1zoom=${zoom}`);
}

/**
 * Whether those bytes are a picture at all.
 *
 * A cover URL that is wrong does not usually 404. Open Library answers with a
 * 1×1, and Google's image endpoint — whose sizes live in a query parameter —
 * answers a size it does not have with a page, a placeholder, or nothing much.
 * All of them arrive as 200s, get written to a file ending in `.jpg`, and draw
 * as a black rectangle a month later. The first bytes of a file are the one
 * thing that cannot be wrong about it.
 */
export function looksLikeImage(bytes: Uint8Array): boolean {
  if (bytes.length < 64) return false;
  const [a, b, c, d] = bytes;
  if (a === 0xff && b === 0xd8 && c === 0xff) return true; // jpeg
  if (a === 0x89 && b === 0x50 && c === 0x4e && d === 0x47) return true; // png
  if (a === 0x47 && b === 0x49 && c === 0x46) return true; // gif
  // riff ... webp
  if (a === 0x52 && b === 0x49 && c === 0x46 && d === 0x46) {
    return bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  }
  return false;
}

export function candidatesFromOpenLibrary(payload: unknown): Candidate[] {
  const docs = (payload as { docs?: unknown[] })?.docs;
  if (!Array.isArray(docs)) return [];
  const found: Candidate[] = [];
  for (const raw of docs) {
    const doc = raw as Record<string, unknown>;
    const title = text(doc.title);
    const key = text(doc.key)?.replace(/^\/works\//, '');
    if (!title || !key) continue;
    const coverId = typeof doc.cover_i === 'number' ? doc.cover_i : null;
    const isbn = firstString(doc.isbn);
    found.push({
      id: `ol:${key}`,
      source: 'openlibrary',
      title,
      author: firstString(doc.author_name),
      year: yearOf(doc.first_publish_year),
      isbn: isbn ? cleanIsbn(isbn) : null,
      language: firstString(doc.language),
      thumb: coverId ? olCover(coverId, 'M') : isbn ? olCoverByIsbn(isbn, 'M') : null,
      cover: coverId ? olCover(coverId, 'L') : isbn ? olCoverByIsbn(isbn, 'L') : null,
      summary: null,
      edition: firstString(doc.edition_key),
    });
  }
  return found;
}

export function candidatesFromGoogle(payload: unknown): Candidate[] {
  const items = (payload as { items?: unknown[] })?.items;
  if (!Array.isArray(items)) return [];
  const found: Candidate[] = [];
  for (const raw of items) {
    const item = raw as Record<string, unknown>;
    const info = (item.volumeInfo ?? {}) as Record<string, unknown>;
    const title = text(info.title);
    const id = text(item.id);
    if (!title || !id) continue;
    const subtitle = text(info.subtitle);
    const images = (info.imageLinks ?? {}) as Record<string, unknown>;
    const thumb = text(images.thumbnail) ?? text(images.smallThumbnail);
    const ids = Array.isArray(info.industryIdentifiers) ? info.industryIdentifiers : [];
    const isbns = ids
      .map((entry) => entry as Record<string, unknown>)
      .filter((entry) => String(entry.type ?? '').startsWith('ISBN'));
    // 13 where there is one: it is the number printed on everything since 2007.
    const isbn =
      text(isbns.find((entry) => entry.type === 'ISBN_13')?.identifier) ??
      text(isbns[0]?.identifier);
    found.push({
      id: `g:${id}`,
      source: 'google',
      title: subtitle ? `${title}: ${subtitle}` : title,
      author: firstString(info.authors),
      year: yearOf(info.publishedDate),
      isbn: isbn ? cleanIsbn(isbn) : null,
      language: text(info.language),
      thumb: thumb ? googleCover(thumb, 1) : null,
      cover: thumb ? googleCover(thumb, 0) : null,
      summary: text(info.description),
      edition: null,
    });
  }
  return found;
}

/**
 * The two lists as one, in the order somebody actually chooses from.
 *
 * Catalog order is relevance to a search engine, and a search engine thinks a
 * book *about* the King James Version answers "Holy Bible KJV". So the rows
 * are put back in the order of how well each one answers the words that were
 * typed, and a row with a cover comes first within that, because this list is
 * looked at rather than read. The same printing is never shown twice.
 */
export function mergeCandidates(lists: Candidate[][], limit = 10, asked = ''): Candidate[] {
  const seen = new Set<string>();
  const kept: Candidate[] = [];
  for (const candidate of lists.flat()) {
    // Same ISBN is the same printing whichever catalog said it; failing that,
    // the same title by the same author in the same year is the same book.
    const key = candidate.isbn
      ? `i:${candidate.isbn}`
      : `t:${candidate.title.toLowerCase()}|${(candidate.author ?? '').toLowerCase()}|${candidate.year ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(candidate);
  }
  const terms = asked.toLowerCase().split(/\s+/).filter(Boolean);
  return kept
    .sort(
      (a, b) =>
        Number(!a.thumb) - Number(!b.thumb) ||
        score({ title: b.title, author: b.author ?? '' }, terms) -
          score({ title: a.title, author: a.author ?? '' }, terms)
    )
    .slice(0, limit);
}

async function json(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`${response.status}`);
  return response.json();
}

const OL_FIELDS = 'key,title,author_name,first_publish_year,cover_i,language,edition_key';

/**
 * What the reader typed, asked of both catalogs at once. An ISBN is a lookup
 * and everything else is a search — the difference being that a lookup has one
 * right answer, so it is asked as one and not ranked against anything.
 *
 * Neither source is allowed to sink the other: a catalog that is down, rate
 * limited or simply has nothing returns an empty list, and the other one still
 * answers.
 */
/**
 * Open Library refuses any `q` shorter than three characters — it answers 422,
 * "Query too short". In English that rules out nothing anybody searches for;
 * in Chinese it rules out most book titles there are. 活着, 围城 and 三体 are
 * whole novels in two characters each, and every one of them came back as "no
 * results" when what happened was that the request was never run.
 *
 * Asking for the same thing as a title search is longer than three characters
 * by construction, passes their check, and finds all three.
 */
export function openLibraryQuery(asked: string): string {
  return asked.length < 3 ? `title:${asked}` : asked;
}

/** Neither catalog could be reached, which is not the same as neither knowing. */
export class CatalogsUnreachable extends Error {}

export async function findBook(query: string, limit = 10): Promise<Candidate[]> {
  const asked = query.trim();
  if (!asked) return [];
  const isbn = isIsbn(asked) ? cleanIsbn(asked) : null;

  const answered = [false, false];
  const [openLibrary, google] = await Promise.all([
    json(
      isbn
        ? `${OL_SEARCH}?q=isbn:${isbn}&fields=${OL_FIELDS}&limit=${limit}`
        : `${OL_SEARCH}?q=${encodeURIComponent(openLibraryQuery(asked))}&fields=${OL_FIELDS}&limit=${limit}`
    )
      .then((body) => {
        answered[0] = true;
        return candidatesFromOpenLibrary(body);
      })
      .catch(() => [] as Candidate[]),
    json(
      `${GOOGLE}?q=${encodeURIComponent(isbn ? `isbn:${isbn}` : asked)}&maxResults=${limit}`
    )
      .then((body) => {
        answered[1] = true;
        return candidatesFromGoogle(body);
      })
      .catch(() => [] as Candidate[]),
  ]);

  // Both refused — a rate limit, no signal, a query one of them would not take.
  // Reporting that as "nothing found" sends someone looking for a book that is
  // there.
  if (!answered[0] && !answered[1]) throw new CatalogsUnreachable();
  return mergeCandidates([openLibrary, google], limit, asked);
}

/**
 * The things a search result leaves out. Open Library's search answers about a
 * work — every printing of it at once — so the ISBN of the one it showed has
 * to be asked for separately, and only once somebody has chosen that row.
 */
export async function fillFromEdition(candidate: Candidate): Promise<Candidate> {
  if (candidate.isbn || !candidate.edition) return candidate;
  try {
    const book = (await json(`${OL_BOOK}/${candidate.edition}.json`)) as Record<string, unknown>;
    const isbn = firstString(book.isbn_13) ?? firstString(book.isbn_10);
    return {
      ...candidate,
      isbn: isbn ? cleanIsbn(isbn) : null,
      year: candidate.year ?? yearOf(book.publish_date),
    };
  } catch {
    return candidate;
  }
}
