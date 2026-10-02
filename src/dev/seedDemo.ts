import { db } from '../db/index';
import {
  addAnnotation,
  createEntity,
  listBooks,
  saveImportedBook,
  rateBook,
  saveProgress,
  updateEntity,
  type ChapterInsert,
} from '../db/repo';
import { addTag, createBookList, findListNamed, seedSystemLists, setInList, FAVORITES } from '../db/shelves';
import { recordAnswer } from '../db/study';
import { answer, unseen, DAY } from '../study/schedule';
import { fingerprint } from '../reader/anchor';
import { countUnits } from '../text/counts';
import { demoBooks, demoLists, type DemoBook } from './demoLibrary';
import { demoMode } from './demo';

/**
 * Fills the demo library, once.
 *
 * Only ever in demo mode, and only ever into an empty shelf — this writes a
 * whole library and must never be able to do it on top of somebody's own.
 * Both are checked here, and the database it would write to is a different
 * file anyway; see `demo.ts` for why that is the real guarantee and this is
 * the belt.
 *
 * What it builds is a library with a history, because that is what a
 * screenshot needs. Books part-read rather than untouched, highlights with
 * notes on them, flash cards already answered twice and due at different
 * times, a rating, a review, two lists and some tags. A demo of empty states
 * sells an empty app.
 */
export async function seedDemoLibrary(): Promise<number> {
  if (!demoMode()) throw new Error('not-demo');
  const existing = await listBooks();
  if (existing.length) return 0;

  await seedSystemLists();
  const lists = new Map<string, string>();
  for (const name of demoLists) {
    const id = (await findListNamed(name)) ?? (await createBookList(name));
    lists.set(name, id);
  }

  let made = 0;
  for (const book of demoBooks) {
    await seedBook(book, lists);
    made += 1;
  }
  return made;
}

/** Paragraph breaks are what `layoutChapter` splits on, so the text is joined with them. */
function manuscriptOf(book: DemoBook): { text: string; chapters: ChapterInsert[] } {
  let text = '';
  const chapters: ChapterInsert[] = [];
  for (const chapter of book.chapters) {
    if (text) text += '\n\n';
    const start = text.length;
    text += `${chapter.title}\n\n${chapter.text.trim()}`;
    chapters.push({ title: chapter.title, start, end: text.length, confident: true });
  }
  return { text, chapters };
}

async function seedBook(book: DemoBook, lists: Map<string, string>) {
  const { text, chapters } = manuscriptOf(book);
  const counts = countUnits(text, book.language);

  const bookId = await saveImportedBook({
    book: {
      title: book.title,
      author: book.author,
      language: book.language,
      kind: book.kind,
      source_name: `${book.title}.md`,
      // Nothing on disk backs a demo book: it is its text in the database and
      // nothing else, so the hash and the path are empty rather than lying
      // about a file that was never adopted.
      source_hash: '',
      source_path: '',
      source_ext: 'md',
      word_count: counts.words,
      char_count: text.length,
      cover_hue: hueOf(book.title),
    },
    text,
    hints: [],
    chapters,
    scenes: [],
  });

  if (book.stars || book.review) {
    await rateBook(bookId, {
      ...(book.stars ? { stars: book.stars } : {}),
      ...(book.review ? { review: book.review } : {}),
    });
  }

  for (const tag of book.tags ?? []) await addTag(bookId, tag);
  // Everything rated highly is in Favourites, which is where a reader would
  // have put it and what makes the shelf's own lists look used.
  if ((book.stars ?? 0) >= 5) {
    // The constant, not a name: the system list is stored as `Favorites` and
    // shown translated, so looking it up by any spelling is how a second one
    // gets made.
    await setInList(FAVORITES, bookId, true);
  }
  const winter = lists.get('Read this winter');
  if (winter && book.kind !== 'paper') await setInList(winter, bookId, true);

  if (book.progress) await saveProgress(bookId, Math.floor(text.length * book.progress));

  const chapterIds = await chapterIdsOf(bookId);

  for (const mark of book.annotations ?? []) {
    // Found rather than stated: an offset written by hand in a fixture is one
    // that goes wrong the moment anybody edits the excerpt above it.
    const at = text.indexOf(mark.quote);
    if (at < 0) continue;
    const end = at + mark.quote.length;
    await addAnnotation({
      bookId,
      chapterId: chapterIds[mark.chapter] ?? null,
      kind: mark.note ? 'note' : 'highlight',
      start: at,
      end,
      quote: mark.quote,
      color: mark.color ?? null,
      note: mark.note ?? null,
      ...fingerprint(text, at, end),
    });
  }

  for (const entity of book.entities ?? []) {
    const id = await createEntity(bookId, entity.kind, entity.name);
    await updateEntity(id, {
      ...(entity.alias ? { alias: entity.alias } : {}),
      ...(entity.summary ? { summary: entity.summary } : {}),
    });
    if (entity.studied) await recordHistory(bookId, id, entity.studied);
  }

  for (const card of book.cards ?? []) {
    const id = await createEntity(bookId, 'card', card.front);
    await updateEntity(id, { summary: card.back });
    if (card.studied) await recordHistory(bookId, id, card.studied);
  }
}

/**
 * A card that has been answered before, so the deck is not all new.
 *
 * Replayed through the real scheduler rather than written as numbers: an ease
 * and an interval invented by hand are a pair SM-2 would never have produced,
 * and the first real answer on top of them moves the card somewhere strange.
 */
async function recordHistory(
  bookId: string,
  entityId: string,
  { daysAgo, reps }: { daysAgo: number; reps: number }
) {
  const when = Date.now() - daysAgo * DAY;
  let schedule = unseen(when);
  for (let round = 0; round < reps; round += 1) {
    schedule = answer(schedule, 'right', when);
  }
  await recordAnswer(bookId, entityId, schedule);
}

async function chapterIdsOf(bookId: string): Promise<string[]> {
  const database = await db();
  const rows = await database.getAllAsync<{ id: string }>(
    'SELECT id FROM chapters WHERE book_id = ? ORDER BY idx',
    bookId
  );
  return rows.map((row) => row.id);
}

/** The same arithmetic the importer uses, so a demo cover looks like any other. */
function hueOf(title: string): number {
  let hash = 0;
  for (let at = 0; at < title.length; at += 1) hash = (hash * 31 + title.charCodeAt(at)) % 360;
  return hash;
}
