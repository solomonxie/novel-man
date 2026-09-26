/**
 * A shelf typed out in one go, for the books the app will never hold: the
 * paperbacks on the wall, the library loans, the list somebody keeps in Notes.
 *
 * One at a time is a form per book — three taps and a keyboard dismissal for a
 * line of text — so the whole list is one field instead, in the format anybody
 * would write it in without being told:
 *
 *     Name: The Leopard
 *     Author: Giuseppe Tomasi di Lampedusa
 *     ISBN: 9780099512318
 *
 *     Name: Stoner
 *
 * Deliberately forgiving, because the reader is typing, not filling in a form.
 * Keys are matched whatever their case, only the name is required, a bare line
 * is taken as a name — so a plain list of titles works — and a second name
 * starts a new book whether or not a blank line separates them.
 */
export type TypedBook = { title: string; author?: string; isbn?: string };

/** What each key is called here, and everything anybody would call it. */
const FIELDS: Record<string, keyof TypedBook> = {
  name: 'title',
  title: 'title',
  book: 'title',
  author: 'author',
  by: 'author',
  writer: 'author',
  isbn: 'isbn',
};

/** `Name: x` — the key is one word, so `Dune: Messiah` stays a title. */
const FIELD_LINE = /^\s*([A-Za-z]+)\s*:\s*(.*)$/;

export function parseTypedBooks(text: string): TypedBook[] {
  const books: TypedBook[] = [];
  let current: TypedBook | null = null;

  const flush = () => {
    if (current?.title) books.push(current);
    current = null;
  };

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const matched = FIELD_LINE.exec(line);
    const field = matched ? FIELDS[matched[1].toLowerCase()] : undefined;
    const value = field ? matched![2].trim() : line;
    if (!value) continue;

    // A second name is a second book, blank line or not.
    if ((!field || field === 'title') && current?.title) flush();
    current ??= { title: '' };
    if (!field) current.title ||= value;
    else if (field === 'title') current.title ||= value;
    else current[field] ||= value;
  }
  flush();
  return books;
}
