/**
 * Notes kept somewhere else — Word comments, screenshots, a paper margin —
 * brought onto books the shelf already has. Each note is a quote and what was
 * said about it; neither is anchored, because the words came from another
 * edition or no edition at all.
 *
 *   { "format": "novel-man-notes", "version": 1,
 *     "books": [{ "title", "author", "libraryId"?, "status"?,
 *                 "notes": [{ "quote", "note", "chapter"? }] }] }
 */
export const NOTES_FORMAT = 'novel-man-notes';

/** `chapter` names where the quote is, when known. */
export type ImportedNote = { quote: string; note: string; chapter: string };

export type NotedBook = {
  title: string;
  author: string;
  /** The shelf's own id, when whoever made the file could see the shelf. */
  libraryId: string;
  status: string | null;
  notes: ImportedNote[];
};

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

export function notedBooksFrom(json: string): NotedBook[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  const root = parsed as { format?: unknown; books?: unknown };
  if (!root || root.format !== NOTES_FORMAT || !Array.isArray(root.books)) return [];
  const found: NotedBook[] = [];
  for (const raw of root.books as Record<string, unknown>[]) {
    const title = text(raw?.title);
    if (!title) continue;
    const notes = (Array.isArray(raw.notes) ? (raw.notes as Record<string, unknown>[]) : [])
      .map((note) => ({ quote: text(note?.quote), note: text(note?.note), chapter: text(note?.chapter) }))
      .filter((note) => note.quote || note.note);
    if (!notes.length) continue;
    found.push({
      title,
      author: text(raw.author),
      libraryId: text(raw.libraryId),
      status: text(raw.status) || null,
      notes,
    });
  }
  return found;
}

/**
 * A title with what editions and shops wrap around it taken off: 《》, a
 * trailing (精) or [美], full-width letters, punctuation and case.
 */
export function titleKey(title: string): string {
  let plain = title.normalize('NFKC').toLowerCase();
  const quoted = /《([^》]+)》/.exec(plain);
  if (quoted) plain = quoted[1];
  plain = plain.replace(/[(\[【][^)\]】]*[)\]】]\s*$/u, '');
  return plain.replace(/[^\p{L}\p{N}]+/gu, '');
}

/**
 * The same title with its subtitle dropped: 中的精神: 吴清源自传 is 中的精神.
 * Not where the subtitle names a volume — 三体: 黑暗森林. II is not 三体.
 */
function mainTitleKey(title: string): string {
  const [main, ...rest] = title.normalize('NFKC').toLowerCase().split(/[:：]|\s[-—]\s/);
  if (/\d|\b[ivx]+\b|[上中下卷册部]/u.test(rest.join(' '))) return titleKey(title);
  return titleKey(main);
}

export type ShelfBook = { id: string; title: string; author: string | null };

/**
 * Which book on the shelf these notes belong to, or null for a new one. The
 * id wins; then the whole title; then a title missing only its subtitle on
 * one side. Where the shelf holds the same title twice, the first one listed
 * gets the notes rather than neither.
 */
export function shelfMatch(book: Pick<NotedBook, 'title' | 'libraryId'>, shelf: ShelfBook[]): ShelfBook | null {
  if (book.libraryId) {
    const byId = shelf.find((entry) => entry.id === book.libraryId);
    if (byId) return byId;
  }
  const key = titleKey(book.title);
  if (!key) return null;
  const whole = shelf.find((entry) => titleKey(entry.title) === key);
  if (whole) return whole;
  const main = mainTitleKey(book.title);
  return (
    shelf.find((entry) => {
      const theirs = titleKey(entry.title);
      const theirMain = mainTitleKey(entry.title);
      return (theirMain === key && theirMain !== theirs) || (main === theirs && main !== key);
    }) ?? null
  );
}

/** The book's own chapter of that name, if it has one. */
export function chapterNamed<T extends { title: string }>(name: string, chapters: T[]): T | null {
  const key = titleKey(name);
  if (!key) return null;
  return chapters.find((chapter) => titleKey(chapter.title) === key) ?? null;
}

export const noteKey = (quote: string, note: string | null) =>
  `${quote.replace(/\s+/g, '')}\u0000${(note ?? '').replace(/\s+/g, '')}`;
