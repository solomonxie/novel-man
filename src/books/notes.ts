import { addAnnotation, listAnnotations, listChapters, saveRecordBook } from '../db/repo';
import { chapterNamed, noteKey, shelfMatch, type NotedBook } from '../sources/notesFile';
import { shelfBooks, type Planned } from './imports';
import { hueFrom } from '../ui/fields';
import { yieldToUI } from '../async/yield';
import { languageOfRecord } from './save';

export const NOTES_FILE = 'a notes file';

export type NotesPlan = Planned<NotedBook>[];

/** Where each book's notes will go, for the reader to see before anything is written. */
export async function planNotes(books: NotedBook[]): Promise<NotesPlan> {
  const shelf = await shelfBooks();
  return books.map((item) => ({ item, onto: shelfMatch(item, shelf), skip: false }));
}

export type KeptNotes = {
  books: number;
  created: number;
  added: number;
  already: number;
  /** For taking it back: the books made and the notes written. */
  made: string[];
  notes: string[];
};

/**
 * Every note as its own entry about the book: the quote, and what was said of
 * it. Running the same file twice adds nothing the second time.
 */
export async function keepNotes(
  plan: NotesPlan,
  kind: string,
  onProgress?: (done: number, total: number) => void
): Promise<KeptNotes> {
  const count: KeptNotes = { books: 0, created: 0, added: 0, already: 0, made: [], notes: [] };
  for (let at = 0; at < plan.length; at++) {
    const { item: book, onto, skip } = plan[at];
    if (skip) {
      onProgress?.(at + 1, plan.length);
      continue;
    }
    let bookId = onto?.id;
    if (!bookId) {
      bookId = await saveRecordBook({
        title: book.title,
        author: book.author || null,
        language: languageOfRecord(book.title, book.author),
        kind,
        source_name: NOTES_FILE,
        cover_hue: hueFrom(book.title),
        status: book.status,
      });
      count.created += 1;
      count.made.push(bookId);
    }
    const kept = new Set((await listAnnotations(bookId)).map((entry) => noteKey(entry.quote, entry.note)));
    const chapters = onto ? await listChapters(bookId) : [];
    for (const note of book.notes) {
      const key = noteKey(note.quote, note.note);
      if (kept.has(key)) {
        count.already += 1;
        continue;
      }
      kept.add(key);
      // Under the book's own chapter where it has one by that name; otherwise
      // the name is kept, so the notes still fall into chapters.
      const chapter = note.chapter ? chapterNamed(note.chapter, chapters) : null;
      const id = await addAnnotation({
        bookId,
        chapterId: chapter?.id ?? null,
        place: chapter ? null : note.chapter || null,
        kind: note.note ? 'note' : 'highlight',
        start: 0,
        end: 0,
        quote: note.quote,
        color: null,
        note: note.note || null,
        prefix: '',
        suffix: '',
        standalone: true,
      });
      count.notes.push(id);
      count.added += 1;
    }
    count.books += 1;
    await yieldToUI();
    onProgress?.(at + 1, plan.length);
  }
  return count;
}
