/**
 * The shelf as a table anybody can read, in the columns this app already reads
 * back in — so the plain copy of a library is also a file it can import.
 *
 * Every backup carries one. A bundle restores perfectly and tells a human
 * nothing: it is one long line of JSON, and "will I still be able to read my
 * notes in ten years" is the question underneath every other question about
 * trust. The answer has to be a file you can open in anything, and it has to be
 * in the backup rather than behind a button somebody has to know to press.
 */
export type LibraryRow = {
  title: string;
  author: string | null;
  year: string | null;
  isbn: string | null;
  kind: string;
  language: string;
  status: string | null;
  stars: number | null;
  review: string | null;
  summary: string | null;
  words: number;
  chapters: number;
  notes: number;
  tags?: string[];
  source_name: string;
  source_hash: string;
  created_at: number;
  rated_at: number | null;
};

/** Goodreads' names where they fit, because a shelf import already reads them. */
const COLUMNS: { name: string; of: (row: LibraryRow) => string | number }[] = [
  { name: 'Title', of: (row) => row.title },
  { name: 'Author', of: (row) => row.author ?? '' },
  { name: 'Book Id', of: (row) => row.source_hash },
  { name: 'ISBN13', of: (row) => row.isbn ?? '' },
  { name: 'Year Published', of: (row) => row.year ?? '' },
  { name: 'Exclusive Shelf', of: (row) => row.status ?? '' },
  { name: 'My Rating', of: (row) => row.stars ?? 0 },
  { name: 'My Review', of: (row) => row.review ?? '' },
  { name: 'Date Read', of: (row) => day(row.rated_at) },
  { name: 'Date Added', of: (row) => day(row.created_at) },
  { name: 'Bookshelves', of: (row) => (row.tags ?? []).join(', ') },
  { name: 'Kind', of: (row) => row.kind },
  { name: 'Language', of: (row) => row.language },
  { name: 'Words', of: (row) => row.words },
  { name: 'Chapters', of: (row) => row.chapters },
  { name: 'Notes', of: (row) => row.notes },
  { name: 'Summary', of: (row) => row.summary ?? '' },
  { name: 'Came From', of: (row) => row.source_name },
];

/** A day, not a moment: nobody reading a shelf means the minute. */
function day(at: number | null): string {
  if (!at) return '';
  const date = new Date(at);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function csvCell(value: string | number): string {
  const text = String(value).replace(/\r\n?/g, '\n');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function libraryCsv(rows: LibraryRow[]): string {
  const lines = [COLUMNS.map((column) => column.name).join(',')];
  for (const row of rows) lines.push(COLUMNS.map((column) => csvCell(column.of(row))).join(','));
  return `${lines.join('\n')}\n`;
}
