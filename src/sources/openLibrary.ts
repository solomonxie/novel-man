import type { IndexRow } from './catalog';
import { yieldToUI } from '../async/yield';

/**
 * Open Library is the one catalog that will tell you about a book it cannot
 * give you: 40 million works, titles, authors, first publication years and
 * covers, no key, no quota, CC0. That is exactly what a shelf of books the app
 * does not hold needs — the record, not the text.
 *
 * It answers two different questions, and both are worth having. `search.json`
 * is the whole catalog, live, for the book somebody is holding. A subject is a
 * list that can be kept: fetched once, searched on the device forever after,
 * which is the only form of "find me a book" that works on a plane.
 */
const SEARCH = 'https://openlibrary.org/search.json';
const SUBJECT = (slug: string) => `https://openlibrary.org/subjects/${slug}.json`;
const COVER = 'https://covers.openlibrary.org/b/id';

/** A work, not an edition: the book people name, rather than one printing of it. */
export type Work = {
  /** `OL45804W` — the key without its path, which is what a row is keyed by. */
  key: string;
  title: string;
  author: string;
  /** First publication, as a year. A record's date is a year, never a day. */
  year: string;
  coverId: number | null;
  language: string;
  /** What the catalog files it under — searchable, and what a kind is guessed from. */
  subjects: string[];
};

/**
 * The categories worth keeping a list of. Open Library has hundreds of
 * thousands of subject tags; these are the ones where the most-read books in
 * them are actually the books somebody is looking for. The names are the
 * catalog's own, in English, the same way arXiv's categories are.
 */
export const subjects: { slug: string; group: string; name: string }[] = [
  { slug: 'fiction', group: 'Fiction', name: 'Fiction' },
  { slug: 'fantasy', group: 'Fiction', name: 'Fantasy' },
  { slug: 'science_fiction', group: 'Fiction', name: 'Science Fiction' },
  { slug: 'mystery_and_detective_stories', group: 'Fiction', name: 'Mystery and Detective' },
  { slug: 'romance', group: 'Fiction', name: 'Romance' },
  { slug: 'historical_fiction', group: 'Fiction', name: 'Historical Fiction' },
  { slug: 'horror', group: 'Fiction', name: 'Horror' },
  { slug: 'poetry', group: 'Fiction', name: 'Poetry' },
  { slug: 'drama', group: 'Fiction', name: 'Drama' },
  { slug: 'juvenile_literature', group: 'Fiction', name: "Children's and Young Adult" },
  { slug: 'biography', group: 'Nonfiction', name: 'Biography' },
  { slug: 'history', group: 'Nonfiction', name: 'History' },
  { slug: 'philosophy', group: 'Nonfiction', name: 'Philosophy' },
  { slug: 'psychology', group: 'Nonfiction', name: 'Psychology' },
  { slug: 'religion', group: 'Nonfiction', name: 'Religion' },
  { slug: 'science', group: 'Nonfiction', name: 'Science' },
  { slug: 'mathematics', group: 'Nonfiction', name: 'Mathematics' },
  { slug: 'computer_science', group: 'Nonfiction', name: 'Computing' },
  { slug: 'economics', group: 'Nonfiction', name: 'Economics' },
  { slug: 'business', group: 'Nonfiction', name: 'Business' },
  { slug: 'art', group: 'Nonfiction', name: 'Art' },
  { slug: 'travel', group: 'Nonfiction', name: 'Travel' },
  { slug: 'cooking', group: 'Nonfiction', name: 'Cooking' },
  { slug: 'textbooks', group: 'Nonfiction', name: 'Textbooks' },
];

/** Each kept list is its own index, so one category can be had without the rest. */
export const SUBJECT_PREFIX = 'openlibrary';

export function sourceIdFor(slug: string): string {
  return `${SUBJECT_PREFIX}:${slug}`;
}

export function subjectOf(sourceId: string): { slug: string; name: string } | null {
  if (!sourceId.startsWith(`${SUBJECT_PREFIX}:`)) return null;
  const slug = sourceId.slice(SUBJECT_PREFIX.length + 1);
  const found = subjects.find((subject) => subject.slug === slug);
  return found ? { slug, name: found.name } : { slug, name: slug };
}

export function coverUrl(coverId: number, size: 'S' | 'M' | 'L' = 'M'): string {
  return `${COVER}/${coverId}-${size}.jpg`;
}

/** `/works/OL45804W` and `OL45804W` are the same work. */
function keyOf(raw: unknown): string {
  return typeof raw === 'string' ? raw.replace(/^\/works\//, '').trim() : '';
}

/** Open Library speaks ISO 639-2; everything else here speaks 639-1. */
const LANGUAGES: Record<string, string> = {
  eng: 'en',
  chi: 'zh',
  zho: 'zh',
  fre: 'fr',
  fra: 'fr',
  ger: 'de',
  deu: 'de',
  spa: 'es',
  ita: 'it',
  rus: 'ru',
  jpn: 'ja',
  kor: 'ko',
  por: 'pt',
  ara: 'ar',
  lat: 'la',
  grc: 'el',
};

export function languageOf(codes: unknown): string {
  const first = Array.isArray(codes) ? codes.find((code) => typeof code === 'string') : codes;
  if (typeof first !== 'string') return '';
  const code = first.toLowerCase().replace(/^\/languages\//, '');
  return LANGUAGES[code] ?? (code.length === 2 ? code : '');
}

function yearOf(value: unknown): string {
  const year = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(year) && year > 0 && year < 2200 ? String(year) : '';
}

function names(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return value
    .map((entry) =>
      typeof entry === 'string' ? entry : typeof (entry as { name?: string })?.name === 'string'
        ? (entry as { name: string }).name
        : ''
    )
    .filter(Boolean)
    .slice(0, 3)
    .join(', ');
}

function strings(value: unknown, cap: number): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string').slice(0, cap);
}

/** What `search.json` answers, reduced to the fields a record is made of. */
export function worksFromSearch(payload: unknown): Work[] {
  const docs = (payload as { docs?: unknown[] })?.docs;
  if (!Array.isArray(docs)) return [];
  const found: Work[] = [];
  for (const raw of docs) {
    const doc = raw as Record<string, unknown>;
    const key = keyOf(doc.key);
    const title = typeof doc.title === 'string' ? doc.title.replace(/\s+/g, ' ').trim() : '';
    if (!key || !title) continue;
    found.push({
      key,
      title,
      author: names(doc.author_name),
      year: yearOf(doc.first_publish_year),
      coverId: typeof doc.cover_i === 'number' ? doc.cover_i : null,
      language: languageOf(doc.language),
      subjects: strings(doc.subject, 8),
    });
  }
  return found;
}

/** And what a subject's own page answers, which is shaped differently. */
export function worksFromSubject(payload: unknown): Work[] {
  const works = (payload as { works?: unknown[] })?.works;
  if (!Array.isArray(works)) return [];
  const found: Work[] = [];
  for (const raw of works) {
    const work = raw as Record<string, unknown>;
    const key = keyOf(work.key);
    const title = typeof work.title === 'string' ? work.title.replace(/\s+/g, ' ').trim() : '';
    if (!key || !title) continue;
    found.push({
      key,
      title,
      author: names(work.authors),
      year: yearOf(work.first_publish_year),
      coverId: typeof work.cover_id === 'number' ? work.cover_id : null,
      language: '',
      subjects: strings(work.subject, 8),
    });
  }
  return found;
}

/** A work as a row of a kept list: the cover id rides along in `href`. */
export function rowOf(work: Work): IndexRow {
  return {
    extId: work.key,
    title: work.title,
    author: work.author,
    language: work.language,
    extra: [work.year, ...work.subjects].filter(Boolean).join(' '),
    href: work.coverId === null ? undefined : String(work.coverId),
    terms: work.year || undefined,
  };
}

/** And back, for a row the reader picked off a kept list. */
export function workOf(row: {
  extId: string;
  title: string;
  author: string;
  language: string;
  href?: string;
  terms?: string;
}): Work {
  const coverId = Number.parseInt(row.href ?? '', 10);
  return {
    key: row.extId,
    title: row.title,
    author: row.author,
    year: row.terms ?? '',
    coverId: Number.isInteger(coverId) ? coverId : null,
    language: row.language,
    subjects: [],
  };
}

const SEARCH_FIELDS = 'key,title,author_name,first_publish_year,cover_i,language,subject';

export async function searchOpenLibrary(query: string, limit = 25): Promise<Work[]> {
  const url =
    `${SEARCH}?q=${encodeURIComponent(query.trim())}` +
    `&fields=${SEARCH_FIELDS}&limit=${limit}&lang=en`;
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`${response.status}`);
  return worksFromSearch(await response.json());
}

/**
 * A page at a time, because a subject's page is a megabyte at a thousand works
 * and the rows are written as they arrive. Capped: a list is for finding the
 * book you half-remember, and past the first thousand of a subject the titles
 * are no longer ones anybody half-remembers.
 */
const PAGE = 200;
export const SUBJECT_CAP = 1000;

export async function fetchSubject(
  slug: string,
  onProgress?: (done: number, total: number) => void
): Promise<IndexRow[]> {
  const rows: IndexRow[] = [];
  const seen = new Set<string>();
  for (let offset = 0; offset < SUBJECT_CAP; offset += PAGE) {
    const response = await fetch(`${SUBJECT(slug)}?limit=${PAGE}&offset=${offset}`, {
      headers: { accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`${response.status}`);
    const page = worksFromSubject(await response.json());
    await yieldToUI();
    for (const work of page) {
      if (seen.has(work.key)) continue;
      seen.add(work.key);
      rows.push(rowOf(work));
    }
    onProgress?.(rows.length, SUBJECT_CAP);
    // The subject ran out before the cap did.
    if (page.length < PAGE) break;
  }
  return rows;
}
