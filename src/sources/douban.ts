import { booksFromExport, type Shelved } from './goodreads';

/**
 * A Douban library, by way of a file.
 *
 * Douban retired its API, publishes no export of its own, and its interests
 * RSS is ten mixed items with no paging — so unlike Goodreads there is no
 * address to paste and re-read. What there is, is the shelf pages, and
 * `tools/douban-shelf.py` in this repo turns those into a CSV.
 *
 * That CSV is written in Goodreads' export columns on purpose. The two sites
 * hold the same things about a book — a shelf, a rating, a comment, a date —
 * and one reader is importing both, so one parser reads both and the second
 * site costs a column list rather than a format.
 */
export const COLUMNS: { name: string; fills: string; required?: boolean }[] = [
  { name: 'Title', fills: 'title', required: true },
  { name: 'Book Id', fills: 'id', required: true },
  { name: 'Author', fills: 'author' },
  { name: 'Exclusive Shelf', fills: 'shelf' },
  { name: 'My Rating', fills: 'rating' },
  { name: 'My Review', fills: 'review' },
  { name: 'Date Read', fills: 'date' },
  { name: 'ISBN13', fills: 'isbn' },
];

export function booksFromCsv(csv: string): Shelved[] {
  return booksFromExport(csv);
}
