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
  { name: 'Book Id', fills: 'id' },
  { name: 'Author', fills: 'author' },
  { name: 'Exclusive Shelf', fills: 'shelf' },
  { name: 'My Rating', fills: 'rating' },
  { name: 'My Review', fills: 'review' },
  { name: 'Date Read', fills: 'date' },
  { name: 'ISBN13', fills: 'isbn' },
];

/**
 * Other names the same columns go by — a spreadsheet of one's own, another
 * app's export, a Chinese site's — matched without case or spacing.
 */
const ALIASES: Record<string, string[]> = {
  Title: ['title', 'book title', 'book', 'name', '书名', '書名', '标题', '標題', '名称', '书籍名称'],
  'Book Id': ['book id', 'bookid', 'id', '编号', '豆瓣id'],
  Author: ['author', 'authors', 'author name', 'writer', '作者', '著者', '作者名'],
  'Exclusive Shelf': ['exclusive shelf', 'shelf', 'status', 'read status', '状态', '狀態', '书架', '阅读状态'],
  'My Rating': ['my rating', 'rating', 'stars', 'score', '评分', '評分', '我的评分', '星级', '星級'],
  'My Review': ['my review', 'review', 'comment', 'comments', '评论', '評論', '短评', '书评', '我的评论'],
  'Date Read': ['date read', 'read date', 'read at', 'finished', '读完日期', '阅读日期', '读过日期', '日期'],
  'Date Added': ['date added', 'added', 'added at', '添加日期', '加入日期'],
  ISBN13: ['isbn13', 'isbn-13', 'isbn 13'],
  ISBN: ['isbn', 'isbn10', 'isbn-10'],
  'Private Notes': ['private notes', 'notes', 'note', '笔记', '筆記', '备注', '備註'],
  Bookshelves: ['bookshelves', 'tags', 'labels', '标签', '標籤'],
  'Original Publication Year': ['original publication year', 'year', 'published', '出版年', '出版年份'],
};

const plainHeader = (name: string) => name.normalize('NFKC').trim().toLowerCase().replace(/[\s_]+/g, ' ');

const BY_ALIAS = new Map(
  Object.entries(ALIASES).flatMap(([column, names]) => names.map((name) => [plainHeader(name), column] as const))
);

export function columnFor(header: string): string {
  return BY_ALIAS.get(plainHeader(header)) ?? header;
}

export function booksFromCsv(csv: string): Shelved[] {
  return booksFromExport(csv, columnFor);
}
