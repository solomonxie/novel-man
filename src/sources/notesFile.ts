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

export { chapterNamed, shelfMatch, titleKey, type ShelfBook } from './sameBook';

export const noteKey = (quote: string, note: string | null) =>
  `${quote.replace(/\s+/g, '')}\u0000${(note ?? '').replace(/\s+/g, '')}`;
