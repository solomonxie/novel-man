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

import { attr, decodeEntities, eachElement, stripTags } from '../import/xml';
import { hex, sha256 } from '../cloud/sha256';
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
  /**
   * What the catalog files it under. Not decoration: it is the only thing in
   * a bibliographic record that says whether this is a story or an argument,
   * which is what decides the sections a book's page gets. Messy by nature —
   * one catalog's "Fiction" is another's "Fiction, general" — so it is read
   * for the one distinction it reliably carries and never trusted further.
   */
  subjects: string[];
};

const OL_SEARCH = 'https://openlibrary.org/search.json';
const OL_COVER = 'https://covers.openlibrary.org/b';
const OL_BOOK = 'https://openlibrary.org/books';
const GOOGLE = 'https://www.googleapis.com/books/v1/volumes';
/**
 * The feed the old Books API left behind, and the reason this file has three
 * doors instead of two. It answers with no key at all, and it knows Chinese
 * editions that the current API will not serve keyless and that Open Library
 * does not hold: 9787532776771 is 挪威的森林 here, absent there, and a 429 from
 * the API. Atom rather than JSON, which is the only cost.
 */
const GOOGLE_FEED = 'https://books.google.com/books/feeds/volumes';

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

/** Every string in a catalog's list field, trimmed and without the blanks. */
function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean);
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
 * Google serves every size of a cover off one address, and curls the corner by
 * default — a paper fold drawn onto a picture of a paper book, which looks like
 * damage on a shelf of flat covers.
 *
 * The size is asked for as a width, not as `zoom=0`, and that is the fix for a
 * real bug: `zoom=0` is the size most books do not have, and Google answers a
 * size it does not have with a picture rather than a 404 — the grey "image not
 * available" panel, 575×750, byte for byte identical for every book. So the
 * cover in the grid looked right (it is the thumbnail, which exists) and the
 * one that got kept was the panel. `zoom=1&w=640` asks the address that works
 * for as much of it as there is, and comes back with the real cover at its own
 * size when that is smaller.
 */
const COVER_WIDTH = 640;

export function googleCover(url: string, size: 'thumb' | 'full'): string {
  const clean = url
    .replace(/^http:/, 'https:')
    .replace(/&edge=curl/, '')
    .replace(/([?&])w=\d+/, '$1')
    .replace(/([?&])zoom=\d/, '$1zoom=1');
  return size === 'full' ? `${clean}&w=${COVER_WIDTH}` : clean;
}

/**
 * That panel, recognised by what it is rather than by the URL that served it.
 * One asset, so one hash: nothing else Google returns from this endpoint is
 * these bytes. It has to be caught, because it is a valid PNG of a plausible
 * size — every other guard we have lets it through and it ends up on a shelf
 * reading "image not available" where a cover should be.
 */
const GOOGLE_NO_COVER = '3efa8c43e5b4348f303a528c81adf435f0111ea752fe9f0f6241478b60987fa6';

/**
 * Its length, which is a necessary condition and not a sufficient one — one
 * fixed asset has one size. Worth having so a sweep over every cover on a shelf
 * is a stat each and a hash only for the handful that could be it.
 */
export const PLACEHOLDER_SIZE = 9103;

export function isPlaceholderCover(bytes: Uint8Array): boolean {
  return hex(sha256(bytes)) === GOOGLE_NO_COVER;
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
    // The edition subquery, where the whole `isbn` and `edition_key` lists
    // used to be. An older reply that still carries those is read first, so a
    // cached page from before this changed still means something.
    const editions = (doc.editions as { docs?: unknown[] } | undefined)?.docs;
    const edition = (Array.isArray(editions) ? editions[0] : undefined) as
      | Record<string, unknown>
      | undefined;
    const isbn = firstString(doc.isbn) ?? firstString(edition?.isbn);
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
      edition: firstString(doc.edition_key) ?? text(edition?.key)?.replace(/^\/books\//, '') ?? null,
      subjects: strings(doc.subject),
    });
  }
  return found;
}

/** Every `<tag>…</tag>` in order, where the feed repeats one. */
function allTagText(xml: string, tag: string): string[] {
  const found: string[] = [];
  for (const element of eachElement(xml, tag)) {
    const opens = element.indexOf('>');
    if (opens < 0) continue;
    const value = decodeEntities(stripTags(element.slice(opens + 1))).trim();
    if (value) found.push(value);
  }
  return found;
}

/**
 * A `<link rel='…' href='…'/>`, which `eachElement` skips by design — it looks
 * for a closing tag and a link has none.
 */
function linkHref(entry: string, rel: string): string | null {
  for (const piece of entry.split('<link')) {
    if (piece.includes(rel)) return attr(piece, 'href') ?? null;
  }
  return null;
}

/**
 * The feed's Atom, as the same row everything else here produces. It says less
 * than the API — no page count, and its blurb is sometimes romanised — but it
 * says the title, the author, the year, the language and the cover, which is
 * the whole of what filling in a shelf entry needs.
 */
export function candidatesFromGoogleFeed(xml: string): Candidate[] {
  const found: Candidate[] = [];
  for (const entry of eachElement(xml, 'entry')) {
    const ids = allTagText(entry, 'dc:identifier');
    // The volume id is the one identifier that is not a numbering scheme.
    const volume = ids.find((value) => !/^(ISBN|OCLC|LCCN|ISSN):/i.test(value));
    // Two of them is a title and its subtitle, the way the API says them apart.
    const title = allTagText(entry, 'dc:title').join(': ');
    if (!volume || !title) continue;
    const isbns = ids
      .filter((value) => /^ISBN:/i.test(value))
      .map((value) => cleanIsbn(value.slice(5)));
    const thumb = linkHref(entry, '/books/2008/thumbnail');
    found.push({
      // Its own prefix, not the API's: the same book from both doors must not
      // arrive as one key twice. Which of them it is, `mergeCandidates` settles
      // on the ISBN.
      id: `gf:${volume}`,
      source: 'google',
      title,
      author: allTagText(entry, 'dc:creator')[0] ?? null,
      year: yearOf(allTagText(entry, 'dc:date')[0]),
      isbn: isbns.find((value) => value.length === 13) ?? isbns[0] ?? null,
      language: allTagText(entry, 'dc:language')[0] ?? null,
      // Served over plain http, which iOS will not load — `googleCover` is
      // already the thing that fixes that, along with the curled corner.
      thumb: thumb ? googleCover(thumb, 'thumb') : null,
      cover: thumb ? googleCover(thumb, 'full') : null,
      summary: allTagText(entry, 'dc:description')[0] ?? null,
      edition: null,
      subjects: [],
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
      thumb: thumb ? googleCover(thumb, 'thumb') : null,
      cover: thumb ? googleCover(thumb, 'full') : null,
      summary: text(info.description),
      edition: null,
      subjects: strings(info.categories),
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
/** Han characters: whether a title is in the script the book was printed in. */
const inHan = (text: string) => /[\u3400-\u4dbf\u4e00-\u9fff]/.test(text);

/**
 * Which of two catalogs gets to name the same printing.
 *
 * Open Library holds much of what China publishes only in ALA-LC
 * romanisation: 9787536042971 is "Pei gen sui bi ji" by "Pei gen" there and
 * 培根随笔集 by 培根 at Google. Romanised, the title has stopped being the
 * book's name — it cannot be searched for, it is not what is on the cover,
 * the language of the book is then detected as English, and no model asked
 * about "Pei gen sui bi ji" can place it. It was winning only by being first
 * in the list of catalogs to ask.
 *
 * Narrow on purpose: only on a Chinese ISBN, and only to take a title in Han
 * over one without. An English book published in China is answered in Latin
 * script by both, so there is nothing here to choose between.
 */
function preferred(held: Candidate, next: Candidate): Candidate {
  if (!held.isbn || !isChineseIsbn(held.isbn)) return held;
  if (inHan(held.title) || !inHan(next.title)) return held;
  // The romanised row often carries the cover, and a cover is not a name.
  return { ...next, thumb: next.thumb ?? held.thumb, cover: next.cover ?? held.cover };
}

export function mergeCandidates(lists: Candidate[][], limit = 10, asked = ''): Candidate[] {
  const at = new Map<string, number>();
  const kept: Candidate[] = [];
  for (const candidate of lists.flat()) {
    // Same ISBN is the same printing whichever catalog said it; failing that,
    // the same title by the same author in the same year is the same book.
    const key = candidate.isbn
      ? `i:${candidate.isbn}`
      : `t:${candidate.title.toLowerCase()}|${(candidate.author ?? '').toLowerCase()}|${candidate.year ?? ''}`;
    const already = at.get(key);
    if (already !== undefined) {
      kept[already] = preferred(kept[already], candidate);
      continue;
    }
    at.set(key, kept.length);
    kept.push(candidate);
  }
  const terms = asked.toLowerCase().split(/\s+/).filter(Boolean);
  // Two catalogs that disagree about the ISBN do not collide above, so the
  // romanised row survives as a row of its own — and a cover would float it
  // to the top. On a Chinese ISBN the script settles it before the cover does.
  const chinese = isIsbn(asked) && isChineseIsbn(asked);
  return kept
    .sort(
      (a, b) =>
        (chinese ? Number(!inHan(a.title)) - Number(!inHan(b.title)) : 0) ||
        Number(!a.thumb) - Number(!b.thumb) ||
        score({ title: b.title, author: b.author ?? '' }, terms) -
          score({ title: a.title, author: a.author ?? '' }, terms)
    )
    .slice(0, limit);
}

/** The status, kept rather than flattened into a message: 429 means something. */
export class HttpError extends Error {
  constructor(public status: number) {
    super(String(status));
  }
}

/**
 * How long any of these is given before it is treated as not having answered.
 *
 * `fetch` has no timeout of its own, so a slow door held the whole lookup for
 * as long as it felt like — and one of these doors is a deprecated Atom feed
 * that can take tens of seconds or never reply at all. A catalog that has not
 * spoken in five seconds is not going to be part of this search.
 */
const PATIENCE_MS = 5000;

async function within(url: string, accept: string, signal?: AbortSignal): Promise<Response> {
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), PATIENCE_MS);
  // The caller's own reason to stop — the search was abandoned, the screen
  // left — on top of the deadline. A request nobody is waiting for should not
  // go on holding the radio for the five seconds it was allowed.
  const give = () => stop.abort();
  if (signal?.aborted) give();
  signal?.addEventListener('abort', give);
  try {
    const response = await fetch(url, { headers: { accept }, signal: stop.signal });
    if (!response.ok) throw new HttpError(response.status);
    return response;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', give);
  }
}

async function json(url: string, signal?: AbortSignal): Promise<unknown> {
  return (await within(url, 'application/json', signal)).json();
}

async function xml(url: string, signal?: AbortSignal): Promise<string> {
  return (await within(url, 'application/atom+xml', signal)).text();
}

/**
 * What is asked of Open Library, and every one of these is here on purpose.
 *
 * `isbn` and `edition_key` used to be, and they are what a search of a famous
 * book costs: Open Library answers a *work*, so those two arrive as every
 * printing it has ever had. Ten rows for "pride and prejudice" is 162KB, of
 * which 155 is lists of numbers for editions nobody asked about — downloaded
 * over somebody's cellular connection and parsed on the thread that is drawing
 * the page, on a lookup that has five seconds to finish.
 *
 * `editions` is the same question narrowed: the subquery returns the one
 * edition Open Library would show, with its key and, where it has one, its
 * ISBN. The same ten rows are 9.7KB — seventeen times less — and the number
 * that is still missing is fetched by `fillFromEdition` if somebody actually
 * picks the row. `subject` stays: it is 6KB and it is what a kind is guessed
 * from.
 */
const OL_FIELDS =
  'key,title,author_name,first_publish_year,cover_i,language,subject' +
  ',editions,editions.key,editions.isbn';

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

export type CatalogId = 'openlibrary' | 'google';

/**
 * What a catalog did, and not only what it returned.
 *
 * A catalog that refused used to be indistinguishable from one that had
 * nothing: both paths ended in an empty array, and as long as the *other* one
 * answered, the reader was told "no results" about a book that is certainly in
 * there. Google's keyless quota went to zero at some point, so that is what has
 * been happening on every lookup — half the search silently not running.
 */
export type CatalogReport = {
  source: CatalogId;
  answered: boolean;
  found: number;
  /** The status or error, where it did not answer. */
  reason?: string;
  /** A refusal that a key of the reader's own would lift. */
  needsKey?: boolean;
};

export type Lookup = { candidates: Candidate[]; catalogs: CatalogReport[] };

/**
 * A Chinese ISBN. The group is the digits after the 978 prefix: 7 is China, and
 * the old ten-digit form starts with it directly. Worth knowing because it is
 * the one prefix where both of these catalogs are weak — Open Library holds a
 * fraction of what China publishes and romanises much of what it does hold —
 * and saying so is better than "no results", which reads as "no such book".
 */
export function isChineseIsbn(raw: string): boolean {
  const digits = cleanIsbn(raw);
  return digits.startsWith('9787') || (digits.length === 10 && digits.startsWith('7'));
}

async function ask(
  source: CatalogId,
  run: () => Promise<Candidate[]>
): Promise<{ candidates: Candidate[]; report: CatalogReport }> {
  try {
    const candidates = await run();
    return { candidates, report: { source, answered: true, found: candidates.length } };
  } catch (problem) {
    const status = problem instanceof HttpError ? problem.status : null;
    return {
      candidates: [],
      report: {
        source,
        answered: false,
        found: 0,
        reason: status ? String(status) : String(problem),
      },
    };
  }
}

/**
 * Two catalogs, three doors.
 *
 * Google's current API is asked only when there is a key for it, because
 * without one it does not answer at all — its anonymous quota is zero a day, so
 * asking is a guaranteed round trip to a 429. Its old feed is asked always: no
 * key, and it holds the Chinese editions that are the whole reason this needed
 * fixing. Either door answering means Google answered; only a key buys the
 * richer record, and nothing buys it coverage it does not have.
 */
export async function findBook(
  query: string,
  {
    limit = 10,
    googleKey,
    onPartial,
    signal,
  }: {
    limit?: number;
    googleKey?: string | null;
    /** Called each time a catalog answers, with everything known so far. */
    onPartial?: (lookup: Lookup) => void;
    /** Abandon the lookup: nobody is waiting for this search any more. */
    signal?: AbortSignal;
  } = {}
): Promise<Lookup> {
  const asked = query.trim();
  if (!asked) return { candidates: [], catalogs: [] };
  const isbn = isIsbn(asked) ? cleanIsbn(asked) : null;
  const key = googleKey?.trim() || null;
  const terms = isbn ? `isbn:${isbn}` : asked;

  const attempts = [
    ask('openlibrary', async () =>
      candidatesFromOpenLibrary(
        await json(
          isbn
            ? `${OL_SEARCH}?q=isbn:${isbn}&fields=${OL_FIELDS}&limit=${limit}`
            : `${OL_SEARCH}?q=${encodeURIComponent(openLibraryQuery(asked))}&fields=${OL_FIELDS}&limit=${limit}`,
          signal
        )
      )
    ),
    key
      ? ask('google', async () =>
          candidatesFromGoogle(
            await json(
              `${GOOGLE}?q=${encodeURIComponent(terms)}&maxResults=${limit}` +
                `&key=${encodeURIComponent(key)}`,
              signal
            )
          )
        )
      : null,
    ask('google', async () =>
      candidatesFromGoogleFeed(
        await xml(`${GOOGLE_FEED}?q=${encodeURIComponent(terms)}&max-results=${limit}`, signal)
      )
    ),
  ];

  /**
   * As each door answers, not once they all have.
   *
   * `Promise.all` meant the fastest catalog was worth nothing: a reader
   * waited on whichever of three was slowest, staring at a heading that said
   * the lookup was still running because it was. Open Library usually answers in
   * well under a second and the old feed sometimes never does, and there is
   * no reason the first should wait for the last.
   */
  const landed: Answer[] = [];
  await Promise.all(
    // The middle door is only tried with a key, and its slot is kept either
    // way so the three stay where `assemble` expects to find them.
    attempts.map((attempt, at) =>
      attempt
        ? attempt.then((answer) => {
            landed[at] = answer;
            onPartial?.(assemble(landed, asked, limit, Boolean(key), false));
          })
        : Promise.resolve()
    )
  );
  return assemble(landed, asked, limit, Boolean(key), true);
}

type Answer = { candidates: Candidate[]; report: CatalogReport };

/**
 * What is known so far, as one answer. `final` is what decides whether both
 * catalogs being quiet is a failure or simply not finished yet.
 */
function assemble(
  landed: Answer[],
  asked: string,
  limit: number,
  keyed: boolean,
  final: boolean
): Lookup {
  const [openLibrary, api, feed] = landed;
  // One row for Google however many of its doors were tried: to a reader it is
  // one catalog, and "the newer half of Google is rate limited" is not a
  // sentence anybody can act on.
  const google: CatalogReport = {
    source: 'google',
    answered: Boolean(api?.report.answered) || Boolean(feed?.report.answered),
    found: (api?.report.found ?? 0) + (feed?.report.found ?? 0),
    reason: feed?.report.reason ?? api?.report.reason,
    // A key would have opened a door that was not even tried.
    needsKey: !keyed && !feed?.report.answered,
  };
  const ol: CatalogReport = openLibrary?.report ?? {
    source: 'openlibrary',
    answered: false,
    found: 0,
  };

  // Both refused — a rate limit, no signal, a query one of them would not take.
  // Reporting that as "nothing found" sends someone looking for a book that is
  // there. Only once everything has had its turn: until then it is a search
  // still running, which is a different thing entirely.
  if (final && !ol.answered && !google.answered) throw new CatalogsUnreachable();
  return {
    candidates: mergeCandidates(
      [openLibrary?.candidates ?? [], api?.candidates ?? [], feed?.candidates ?? []],
      limit,
      asked
    ),
    catalogs: [ol, google],
  };
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
