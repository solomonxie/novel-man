import { rememberRows, type IndexRow, type IndexedBook } from './catalog';
import type { Candidate } from './identify';

/**
 * Published records this device has already been shown, kept so it is not
 * shown them again only when there is signal.
 *
 * The catalogs of published books are far too large to hold — Open Library
 * alone is forty million works — so the general answer has to be a request.
 * But the books one reader looks up are not forty million of anything, and
 * the record was in hand the moment it arrived. Writing it down costs a few
 * hundred bytes and makes the index self-warming: everything ever searched
 * for answers instantly, offline, from then on.
 *
 * This is a cache and behaves like one. It is never fetched, never counted
 * among the lists the reader keeps, and the oldest rows go when it fills.
 */
export const SEEN = 'seen';

/**
 * Enough that years of looking things up never evicts anything anybody
 * remembers looking up, small enough to stay a rounding error on disk — a row
 * is a few hundred bytes, so this is single-digit megabytes at worst.
 */
const CEILING = 4000;

export async function rememberSeen(candidates: Candidate[]): Promise<void> {
  const rows: IndexRow[] = candidates.map((candidate) => ({
    extId: candidate.id,
    title: candidate.title,
    author: candidate.author ?? '',
    language: candidate.language ?? '',
    // Searchable: the number counts, because looking a book up by it twice is
    // exactly the case this is for.
    extra: [candidate.isbn, candidate.year, ...candidate.subjects].filter(Boolean).join(' '),
    payload: JSON.stringify(candidate),
  }));
  await rememberRows(SEEN, rows, CEILING);
}

/**
 * The record a remembered row stands for. A row whose payload will not parse
 * is one written by a version that stored something else; it is treated as a
 * miss rather than a crash, and the next lookup overwrites it.
 */
export function seenCandidate(row: IndexedBook): Candidate | null {
  if (!row.payload) return null;
  try {
    const parsed = JSON.parse(row.payload) as Candidate;
    return parsed && typeof parsed.title === 'string' ? parsed : null;
  } catch {
    return null;
  }
}
