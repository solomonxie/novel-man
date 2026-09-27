import { booksFromExport, type Shelved } from './goodreads';

/**
 * A library from anywhere, by way of a CSV.
 *
 * Every site that keeps a reading list holds the same handful of things about a
 * book — a shelf, a rating, a comment, a date — so there is no reason for a
 * second site to cost a second format. The columns are Goodreads' export
 * columns because that export is the one that already exists in the wild: a
 * Goodreads file works as it stands, and anything else needs only a header row
 * that matches, whether it comes from a scraper, a spreadsheet or another app.
 *
 * `tools/douban-shelf.py` in this repo is one such writer, for Douban — which
 * retired its API, publishes no export, and serves an RSS of ten mixed items
 * with no paging, so a file is the only door it has.
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
