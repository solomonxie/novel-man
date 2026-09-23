import { db } from '../db/index';
import { listChapters, getDocumentText } from '../db/repo';
import { listUnits, seedUnits, type TranslationUnit } from '../db/translation';
import { sentencesOf } from './run';

/** Rows per statement, so one repair is tens of writes rather than tens of thousands. */
const BATCH = 200;

export type Resplit = { added: number; removed: number; refiled: number; kept: number };

/**
 * Put a book's sentence rows back in agreement with the way the reader splits
 * it, once.
 *
 * A row remembers the span it was made from, and that is only a sentence for
 * as long as the splitter that made it is the splitter in use. It stopped
 * being one: a chapter used to be cut in one pass, so a row could run across a
 * paragraph break, and a chapter with no full stop in it — a table of contents
 * — became a single row thousands of characters long that ran on into the
 * chapter beneath. The paragraphs it swallowed had no row of their own, so
 * they read in the language the book was written in while the translation page
 * listed every sentence it knew about as done. It had never heard of them.
 *
 * What is done here: every current sentence gets a row, a row that is no
 * longer a sentence is dropped, and a row that is still one keeps its
 * translation and is re-filed under the chapter it is actually inside.
 *
 * What is never done: a row somebody has edited by hand is not deleted,
 * whatever has happened to the offsets around it. A machine line can be bought
 * again; a line the translator wrote cannot.
 */
export async function resplitUnits(bookId: string): Promise<Resplit> {
  const database = await db();
  const targets = await database.getAllAsync<{ target: string }>(
    'SELECT DISTINCT target FROM translation_units WHERE book_id = ?',
    bookId
  );
  const done = { added: 0, removed: 0, refiled: 0, kept: 0 };
  if (!targets.length) return done;

  const text = await getDocumentText(bookId);
  const chapters = await listChapters(bookId);
  if (!text || !chapters.length) return done;

  const book = await database.getFirstAsync<{ language: string }>(
    'SELECT language FROM books WHERE id = ?',
    bookId
  );
  const language = book?.language ?? 'en';

  const wanted = chapters.flatMap((chapter) =>
    sentencesOf(text, chapter, language).map((sentence) => ({
      chapter_idx: chapter.idx,
      start: sentence.start,
      end: sentence.end,
      source: sentence.source,
    }))
  );
  const spans = new Map(wanted.map((unit) => [`${unit.start}:${unit.end}`, unit] as const));

  for (const { target } of targets) {
    const existing = await listUnits(bookId, target);
    const stale: TranslationUnit[] = [];
    const misfiled: TranslationUnit[] = [];
    for (const unit of existing) {
      const span = spans.get(`${unit.start}:${unit.end}`);
      if (!span) {
        if (!unit.edited) stale.push(unit);
        continue;
      }
      done.kept += 1;
      if (unit.chapter_idx !== span.chapter_idx) misfiled.push({ ...unit, chapter_idx: span.chapter_idx });
    }

    for (let from = 0; from < stale.length; from += BATCH) {
      const slice = stale.slice(from, from + BATCH);
      await database.runAsync(
        `DELETE FROM translation_units WHERE id IN (${slice.map(() => '?').join(', ')})`,
        slice.map((unit) => unit.id)
      );
    }
    done.removed += stale.length;

    for (const unit of misfiled) {
      await database.runAsync(
        'UPDATE translation_units SET chapter_idx = ? WHERE id = ?',
        unit.chapter_idx,
        unit.id
      );
    }
    done.refiled += misfiled.length;

    // Insert-or-ignore, so the rows that survived are left exactly as they are.
    const before = existing.length - stale.length;
    await seedUnits(bookId, target, wanted);
    const after = await database.getFirstAsync<{ n: number }>(
      'SELECT COUNT(*) AS n FROM translation_units WHERE book_id = ? AND target = ?',
      bookId,
      target
    );
    done.added += Math.max(0, (after?.n ?? before) - before);
  }

  return done;
}

/**
 * The repair, at most once per book. Every page that reads a translation calls
 * this first; after the first time it is one cheap read of a flag.
 */
export async function ensureUnitsCurrent(bookId: string): Promise<Resplit | null> {
  const database = await db();
  const book = await database.getFirstAsync<{ units_resplit: number }>(
    'SELECT units_resplit FROM books WHERE id = ?',
    bookId
  );
  if (!book || book.units_resplit) return null;
  const done = await resplitUnits(bookId);
  await database.runAsync('UPDATE books SET units_resplit = 1 WHERE id = ?', bookId);
  return done;
}
