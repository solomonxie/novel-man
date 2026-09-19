import { base64 } from '../import/base64';
import { utf8 } from '../cloud/sha256';
import { attr, decodeEntities, eachElement, firstTagText } from '../import/xml';
import type { IndexRow } from './catalog';
import { yieldToUI } from '../async/yield';

/**
 * The same books Gutenberg has, produced again by hand: typeset, proofread,
 * and marked up with a spine that says what a chapter is. Gutenberg's epubs
 * are machine conversions of century-old plain text, so its structure is a
 * guess this app then has to re-guess. These state it.
 *
 * The catch is the feed. Standard Ebooks answers 401 to every OPDS url and
 * disallows `/ebooks/*\/downloads/*` in robots.txt, so there is no open
 * machine path to either the list or the files — access to the feeds is a
 * Patrons Circle benefit, and the credential is an email address with a blank
 * password over HTTP Basic. That makes this the second source the reader
 * unlocks with something of their own, after the ESV, and the first one where
 * doing so yields a book rather than a lookup.
 */
const HOST = 'https://standardebooks.org';
const ROOT = `${HOST}/feeds/opds`;

export type StandardEbook = {
  /** The path under `/ebooks/`: `gustave-flaubert/sentimental-education`. */
  id: string;
  title: string;
  author: string;
  /** The url the feed stated. Never built from the id — see robots.txt. */
  url: string;
  language: string;
  /** The licence line, in the feed's own words. */
  rights: string;
};

export class StandardEbooksError extends Error {
  constructor(public code: 'no-email' | 'rejected' | 'offline' | 'no-feed') {
    super(code);
  }
}

/** Their instruction is the email in the username and nothing in the password. */
export function authHeader(email: string): string {
  return `Basic ${base64(utf8(`${email.trim()}:`))}`;
}

async function read(url: string, email: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { accept: 'application/atom+xml', authorization: authHeader(email) },
    });
  } catch {
    throw new StandardEbooksError('offline');
  }
  if (response.status === 401 || response.status === 403) {
    throw new StandardEbooksError('rejected');
  }
  if (!response.ok) throw new StandardEbooksError('offline');
  return response.text();
}

/** Enough to say whether the credential works, without pulling the catalog. */
export async function testStandardEbooks(email: string | null): Promise<void> {
  if (!email?.trim()) throw new StandardEbooksError('no-email');
  await read(ROOT, email);
}

/**
 * Returns the rows rather than writing them, so this file stays a function of
 * its bytes and the fixture tests can run it outside the app.
 */
export async function fetchStandardEbooksIndex(email: string | null): Promise<IndexRow[]> {
  if (!email?.trim()) throw new StandardEbooksError('no-email');
  const root = await read(ROOT, email);
  // The root is a navigation feed, so the list is wherever it says it is. The
  // path is not hardcoded: a feed that moves its own catalog is still a feed
  // that told us where it went.
  let next = booksFrom(root).length ? ROOT : catalogLinkFrom(root);
  if (!next) throw new StandardEbooksError('no-feed');

  const rows: IndexRow[] = [];
  const seen = new Set<string>();
  // An acquisition feed is allowed to be paginated, and says so itself. The
  // cap is here so a feed that links its first page as its next one stops.
  for (let page = 0; next && page < PAGES; page++) {
    const feed: string = next === ROOT && page === 0 ? root : await read(next, email);
    for (const row of booksFrom(feed)) {
      if (seen.has(row.extId)) continue;
      seen.add(row.extId);
      rows.push(row);
    }
    const following = nextLinkFrom(feed);
    next = following && following !== next ? following : null;
    await yieldToUI();
  }
  return rows;
}

/** 1,200-odd books; even at 50 an OPDS page that is twenty pages of headroom. */
const PAGES = 40;

const LINK = /<link\b[^>]*>/g;

/** The acquisition feed this navigation feed points at — the whole shelf, by preference. */
export function catalogLinkFrom(navFeed: string): string | null {
  const found: string[] = [];
  for (const tag of navFeed.match(LINK) ?? []) {
    if (!(attr(tag, 'type') ?? '').includes('kind=acquisition')) continue;
    const href = attr(tag, 'href');
    if (href) found.push(absolute(decodeEntities(href)));
  }
  // The newest fifteen books is a feed too, and the one thing this must not
  // mistake for the catalog.
  const shelves = found.filter((href) => !/new-releases/.test(href));
  if (!shelves.length) return found[0] ?? null;
  return shelves.find((href) => /\/all\b/.test(href)) ?? shelves[0];
}

/** Paging, in the feed's own words. */
export function nextLinkFrom(feed: string): string | null {
  for (const tag of feed.match(LINK) ?? []) {
    if (attr(tag, 'rel') !== 'next') continue;
    const href = attr(tag, 'href');
    if (href) return absolute(decodeEntities(href));
  }
  return null;
}

export function booksFrom(feed: string): IndexRow[] {
  const rows: IndexRow[] = [];
  const seen = new Set<string>();
  for (const entry of eachElement(feed, 'entry')) {
    const url = epubLinkFrom(entry);
    const title = firstTagText(entry, 'title');
    // A navigation row is an entry too, and has no book behind it.
    if (!url || !title) continue;
    const extId = pathOf(firstTagText(entry, 'id') ?? url);
    if (!extId || seen.has(extId)) continue;
    seen.add(extId);
    rows.push({
      extId,
      title,
      author: authorsIn(entry),
      language: languageOf(entry),
      extra: subjectsIn(entry),
      href: url,
      terms: firstTagText(entry, 'rights') ?? '',
    });
  }
  return rows;
}

const ACQUISITION = /<link\b[^>]*rel="http:\/\/opds-spec\.org\/acquisition"[^>]*>/g;

/**
 * A book is published three ways: the epub, an `_advanced` epub using features
 * only a handful of readers implement, and a Kobo-flavoured `.kepub.epub`.
 * The plain one is the compatible one, and size does not tell them apart — all
 * three are the same words.
 */
export function epubLinkFrom(entry: string): string | null {
  let fallback: string | null = null;
  for (const tag of entry.match(ACQUISITION) ?? []) {
    if (attr(tag, 'type') !== 'application/epub+zip') continue;
    const href = attr(tag, 'href');
    if (!href) continue;
    const url = absolute(decodeEntities(href));
    if (/\.kepub\.epub$/.test(url) || /_advanced\.epub$/.test(url)) {
      fallback ??= url;
      continue;
    }
    if (/\.epub$/.test(url)) return url;
    fallback ??= url;
  }
  return fallback;
}

/** `url:https://standardebooks.org/ebooks/jane-austen/persuasion` → the path. */
export function pathOf(id: string): string {
  const at = id.indexOf('/ebooks/');
  const path = at < 0 ? id : id.slice(at + '/ebooks/'.length);
  return path.replace(/\/downloads\/.*$/, '').replace(/^\/+|\/+$/g, '');
}

function absolute(href: string): string {
  return href.startsWith('/') ? HOST + href : href;
}

function authorsIn(entry: string): string {
  const names: string[] = [];
  for (const author of eachElement(entry, 'author')) {
    const name = firstTagText(author, 'name');
    if (name && !names.includes(name)) names.push(name);
  }
  return names.join(', ');
}

/** They publish it under whichever of the three namespaces the feed version uses. */
function languageOf(entry: string): string {
  for (const tag of ['dcterms:language', 'dc:language', 'schema:language']) {
    const found = firstTagText(entry, tag);
    if (found) return found;
  }
  return '';
}

const CATEGORY = /<category\b[^>]*>/g;

function subjectsIn(entry: string): string {
  const subjects: string[] = [];
  for (const tag of entry.match(CATEGORY) ?? []) {
    const label = attr(tag, 'label') ?? attr(tag, 'term');
    if (label && !subjects.includes(label)) subjects.push(label);
  }
  return subjects.join(' ');
}

/** A row of the kept index is the whole download: the feed stated the url. */
export function bookFromIndex(row: {
  extId: string;
  title: string;
  author: string;
  language?: string;
  href?: string;
  terms?: string;
}): StandardEbook {
  return {
    id: row.extId,
    title: row.title,
    author: row.author,
    url: row.href ?? '',
    language: row.language ?? '',
    rights: row.terms ?? '',
  };
}

/** As Gutenberg: the url's own tail is not a name anybody wrote. */
export function fileNameFor(book: { id: string; title: string }): string {
  const stem =
    book.title.replace(/[\\/:*?"<>|\n\r]+/g, ' ').trim().slice(0, 60) ||
    book.id.replace(/\//g, '-');
  return `${stem}.epub`;
}
