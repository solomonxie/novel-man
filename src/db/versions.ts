import { db, newId, transaction, type Database } from './index';
import {
  getBook,
  getDocument,
  listAnnotations,
  listChapters,
  reindexByOffset,
  type Annotation,
  type Chapter,
} from './repo';
import { reanchor } from '../reader/anchor';
import { versionOf, type Step } from '../structure/merge';
import { indexCase, mapOffset, mergeSegments, offsetCase, type Segment } from '../structure/remap';
import type { StructureHint } from '../structure/document';
import { countUnits } from '../text/counts';

/**
 * A chapter's other wordings. The manuscript holds the one being read; this
 * table holds every wording a chapter has been given, so switching back and
 * forth, or merging in another copy of the book, never throws one away.
 */

export type ChapterVersion = {
  chapter_id: string;
  hash: string;
  title: string;
  source_name: string | null;
  created_at: number;
  chars: number;
};

export async function listVersions(bookId: string): Promise<ChapterVersion[]> {
  const database = await db();
  return database.getAllAsync<ChapterVersion>(
    `SELECT chapter_id, hash, title, source_name, created_at, LENGTH(text) AS chars
       FROM chapter_versions WHERE book_id = ? ORDER BY created_at, rowid`,
    bookId
  );
}

/** `v2`, for a note written on a chapter's second wording. Null while it has only one. */
export function versionLabel(versions: ChapterVersion[], chapterId: string, hash: string | null) {
  if (!hash) return null;
  const own = versions.filter((version) => version.chapter_id === chapterId);
  if (own.length < 2) return null;
  const at = own.findIndex((version) => version.hash === hash);
  return at >= 0 ? `v${at + 1}` : null;
}

/** The chapters as they read now, trailing blank lines dropped, for lining up against a file. */
export async function chapterBodies(bookId: string) {
  const [{ text, hints }, chapters] = await Promise.all([getDocument(bookId), listChapters(bookId)]);
  return chapters.map((chapter, index) => {
    const end = index + 1 < chapters.length ? chapters[index + 1].start : text.length;
    return {
      chapter,
      title: chapter.title,
      text: text.slice(chapter.start, end).trimEnd(),
      hints: within(hints, chapter.start, end),
    };
  });
}

/** What a chapter becomes in a rewrite. */
type Slot =
  | { kind: 'as-is'; chapter: Chapter }
  | { kind: 'reword'; chapter: Chapter; text: string; hints: StructureHint[]; title: string; version: string }
  | { kind: 'add'; title: string; text: string; hints: StructureHint[] };

type Snapshot = {
  chapter: Chapter;
  hash: string;
  title: string;
  text: string;
  hints: StructureHint[];
  source: string | null;
  at: number;
};

export type Incoming = { title: string; text: string; hints: StructureHint[] };
export type Decision = 'mine' | 'theirs';

/**
 * Another copy of the book, folded into this one. Identical chapters are left
 * alone, new ones go in where they stand, and a chapter both copies have
 * worded differently keeps both wordings — the decision is only which one is
 * read. Nothing of this book's is removed.
 */
export async function mergeInto(
  bookId: string,
  steps: Step[],
  incoming: Incoming[],
  decide: (stepIndex: number) => Decision,
  include: (stepIndex: number) => boolean,
  sourceName: string
) {
  const [book, bodies] = await Promise.all([getBook(bookId), chapterBodies(bookId)]);
  if (!book) throw new Error('missing book');
  const known = await versionsByChapter(bookId);
  const now = Date.now();
  const slots: Slot[] = [];
  const snapshots: Snapshot[] = [];

  steps.forEach((step, index) => {
    if (step.kind === 'same' || step.kind === 'kept') {
      slots.push({ kind: 'as-is', chapter: bodies[step.base].chapter });
      return;
    }
    if (step.kind === 'added') {
      if (include(index)) slots.push({ kind: 'add', ...incoming[step.incoming] });
      return;
    }
    const mine = bodies[step.base];
    const theirs = incoming[step.incoming];
    const mineHash = versionOf(mine.text);
    const theirsHash = versionOf(theirs.text);
    const first = !known.get(mine.chapter.id)?.size;
    snapshots.push(
      {
        chapter: mine.chapter, hash: mineHash, title: mine.title, text: mine.text, hints: mine.hints,
        source: book.source_name, at: first ? book.created_at : now,
      },
      {
        chapter: mine.chapter, hash: theirsHash, title: theirs.title, text: theirs.text,
        hints: theirs.hints, source: sourceName, at: now + 1,
      }
    );
    slots.push(
      decide(index) === 'theirs'
        ? {
            kind: 'reword', chapter: mine.chapter, text: theirs.text, hints: theirs.hints,
            title: mine.chapter.user_edited ? mine.chapter.title : theirs.title, version: theirsHash,
          }
        : { kind: 'as-is', chapter: mine.chapter }
    );
  });
  if (!snapshots.length && !steps.some((step, index) => step.kind === 'added' && include(index))) return;
  await rewrite(bookId, book.language, slots, snapshots);
}

/** Read a chapter as another of its wordings. The one it leaves is kept. */
export async function switchVersion(chapterId: string, hash: string) {
  const database = await db();
  const chapter = await database.getFirstAsync<Chapter>('SELECT * FROM chapters WHERE id = ?', chapterId);
  if (!chapter) return;
  const book = await getBook(chapter.book_id);
  if (!book) return;
  const target = await database.getFirstAsync<{ title: string; text: string; hints: string }>(
    'SELECT title, text, hints FROM chapter_versions WHERE chapter_id = ? AND hash = ?',
    chapterId, hash
  );
  if (!target) return;
  const current = (await chapterBodies(chapter.book_id)).find((body) => body.chapter.id === chapterId);
  if (!current) return;
  const currentHash = versionOf(current.text);
  if (currentHash === hash) return;

  const snapshots: Snapshot[] = [{
    // Re-splitting can leave a chapter reading as something no version holds
    // exactly. It is kept before it is left.
    chapter, hash: currentHash, title: chapter.title, text: current.text, hints: current.hints,
    source: book.source_name, at: Date.now(),
  }];
  const slots: Slot[] = (await listChapters(chapter.book_id)).map((each) =>
    each.id === chapterId
      ? {
          kind: 'reword', chapter: each, text: target.text, hints: parseList(target.hints),
          title: each.user_edited ? each.title : target.title, version: hash,
        }
      : { kind: 'as-is', chapter: each }
  );
  await rewrite(chapter.book_id, book.language, slots, snapshots);
}

async function versionsByChapter(bookId: string) {
  const byChapter = new Map<string, Set<string>>();
  for (const version of await listVersions(bookId)) {
    const found = byChapter.get(version.chapter_id) ?? new Set<string>();
    found.add(version.hash);
    byChapter.set(version.chapter_id, found);
  }
  return byChapter;
}

/**
 * The manuscript, rebuilt from its chapters, and everything that points into
 * it moved with them: notes, scenes, verses, pages, translations, pictures,
 * the reading position, and every row filed under a chapter number.
 */
async function rewrite(bookId: string, language: string, slots: Slot[], snapshots: Snapshot[]) {
  const database = await db();
  const [{ text, hints }, chapters, annotations] = await Promise.all([
    getDocument(bookId), listChapters(bookId), listAnnotations(bookId),
  ]);
  if (!chapters.length) throw new Error('no chapters');
  const oldEnd = (index: number) => (index + 1 < chapters.length ? chapters[index + 1].start : text.length);
  const position = new Map(chapters.map((chapter, index) => [chapter.id, index]));

  let out = text.slice(0, chapters[0].start);
  const outHints: StructureHint[] = within(hints, 0, chapters[0].start);
  const segments: Segment[] = [{ os: 0, oe: chapters[0].start, ns: 0, ne: out.length, linear: true }];
  const placed: { slot: Slot; start: number }[] = [];

  for (const slot of slots) {
    if (out && !out.endsWith('\n\n')) out += out.endsWith('\n') ? '\n' : '\n\n';
    const start = out.length;
    if (slot.kind === 'as-is') {
      const index = position.get(slot.chapter.id)!;
      const body = text.slice(slot.chapter.start, oldEnd(index)).trimEnd();
      out += body;
      outHints.push(...shift(within(hints, slot.chapter.start, oldEnd(index)), start));
      segments.push({ os: slot.chapter.start, oe: oldEnd(index), ns: start, ne: out.length, linear: true });
    } else {
      const body = slot.text.trimEnd();
      out += body;
      outHints.push(...shift(slot.hints, start));
      if (slot.kind === 'reword') {
        const index = position.get(slot.chapter.id)!;
        segments.push({ os: slot.chapter.start, oe: oldEnd(index), ns: start, ne: out.length, linear: false });
      }
    }
    placed.push({ slot, start });
  }
  const merged = mergeSegments(segments);
  const map = (offset: number) => mapOffset(merged, offset, text.length, out.length);
  const reworded = merged.filter((segment) => !segment.linear);
  const inReworded = (offset: number) => reworded.find((s) => offset >= s.os && offset < s.oe);

  const newIdx = new Map<number, number>();
  placed.forEach((entry, index) => {
    if (entry.slot.kind !== 'add') newIdx.set(entry.slot.chapter.idx, index);
  });

  const versioned = new Set(snapshots.map((snapshot) => snapshot.chapter.id));
  const units = await database.getAllAsync<{ id: string; target: string; start: number; end: number; source: string }>(
    'SELECT id, target, start, end, source FROM translation_units WHERE book_id = ?', bookId);

  await transaction(async () => {
    for (const snapshot of snapshots) {
      await database.runAsync(
        `INSERT OR IGNORE INTO chapter_versions
           (book_id, chapter_id, hash, title, text, hints, source_name, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        bookId, snapshot.chapter.id, snapshot.hash, snapshot.title, snapshot.text,
        JSON.stringify(snapshot.hints), snapshot.source, snapshot.at
      );
    }
    // A chapter that has just gained a second wording names its first, and
    // so does every note already written on it.
    for (const id of versioned) {
      const chapter = chapters[position.get(id)!];
      const index = position.get(id)!;
      const current = versionOf(text.slice(chapter.start, oldEnd(index)).trimEnd());
      await database.runAsync('UPDATE chapters SET version = ? WHERE id = ? AND version IS NULL', current, id);
      await database.runAsync(
        `UPDATE annotations SET version = ?
          WHERE book_id = ? AND version IS NULL AND standalone = 0 AND chapter_id IS NULL
            AND start >= ? AND start < ?`,
        current, bookId, chapter.start, oldEnd(index)
      );
    }

    for (const [table, columns] of OFFSET_COLUMNS) {
      const where = table === 'annotations' ? ' AND chapter_id IS NULL AND standalone = 0' : '';
      await database.runAsync(
        `UPDATE ${table} SET ${columns.map((c) => `${c} = ${offsetCase(merged, c, text.length, out.length)}`).join(', ')}
          WHERE book_id = ?${where}`,
        bookId
      );
    }
    await moveUnits(database, bookId, units, merged, reworded, out, text.length);

    // A note in a reworded chapter is looked for in the new words; found, it
    // sits on them, and either way it keeps the wording it was written on.
    for (const note of annotations) {
      if (note.chapter_id || note.standalone || !inReworded(note.start)) continue;
      const segment = inReworded(note.start)!;
      const found = reanchor(out.slice(segment.ns, segment.ne), {
        ...note, start: map(note.start) - segment.ns, end: map(note.end) - segment.ns,
      } as Annotation);
      if (found) {
        await database.runAsync('UPDATE annotations SET start = ?, end = ? WHERE id = ?',
          segment.ns + found.start, segment.ns + found.end, note.id);
      }
    }

    for (const [table, columns] of INDEX_COLUMNS) {
      for (const column of columns) {
        await database.runAsync(
          `UPDATE ${table} SET ${column} = -${column} - 1 WHERE book_id = ? AND ${column} >= 0`, bookId);
        await database.runAsync(
          `UPDATE ${table} SET ${column} = ${indexCase(newIdx, `(-${column} - 1)`)}
            WHERE book_id = ? AND ${column} < 0`,
          bookId
        );
      }
    }

    for (let index = 0; index < placed.length; index++) {
      const { slot, start } = placed[index];
      const end = index + 1 < placed.length ? placed[index + 1].start : out.length;
      if (slot.kind === 'add') {
        const neighbour = placed.slice(0, index).reverse().find((entry) => entry.slot.kind !== 'add')
          ?? placed.slice(index + 1).find((entry) => entry.slot.kind !== 'add');
        const part = neighbour && neighbour.slot.kind !== 'add' ? neighbour.slot.chapter : null;
        await database.runAsync(
          `INSERT INTO chapters (id, book_id, idx, title, start, end, confident, user_edited,
                                 part_idx, part_title)
           VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?)`,
          newId(), bookId, index, slot.title, start, end, part?.part_idx ?? null, part?.part_title ?? null
        );
        continue;
      }
      const chapter = slot.chapter;
      if (slot.kind === 'reword') {
        await database.runAsync(
          'UPDATE chapters SET idx = ?, start = ?, end = ?, title = ?, version = ? WHERE id = ?',
          index, start, end, slot.title, slot.version, chapter.id
        );
      } else if (chapter.idx !== index || chapter.start !== start || chapter.end !== end) {
        await database.runAsync('UPDATE chapters SET idx = ?, start = ?, end = ? WHERE id = ?',
          index, start, end, chapter.id);
      }
    }

    await database.runAsync('UPDATE documents SET text = ?, hints = ? WHERE book_id = ?',
      out, JSON.stringify(outHints), bookId);
    const counts = countUnits(out, language);
    await database.runAsync('UPDATE books SET word_count = ?, char_count = ? WHERE id = ?',
      counts.words, out.length, bookId);
    await reindexByOffset(database, bookId);
  });
}

/** Every column that is an offset into the manuscript. Translations are moved apart. */
const OFFSET_COLUMNS: [string, string[]][] = [
  ['annotations', ['start', 'end']],
  ['scenes', ['start', 'end']],
  ['verses', ['start', 'end']],
  ['images', ['start', 'end']],
  ['excerpts', ['at']],
  ['pages', ['start', 'end']],
  ['reading_state', ['offset']],
];

/** Every column that is a chapter's number. Translations re-file by offset instead. */
const INDEX_COLUMNS: [string, string[]][] = [
  ['observations', ['chapter_idx']],
  ['mentions', ['chapter_idx']],
  ['relations', ['first_chapter', 'last_chapter']],
  ['script_elements', ['chapter_idx']],
  ['work_jobs', ['chapter_idx']],
  ['images', ['chapter_idx']],
  ['reading_events', ['chapter_idx']],
  ['excerpts', ['chapter_idx']],
];

/**
 * Translated sentences carry a unique span, so they cannot pass through each
 * other on the way: all of them step aside first, the ones in untouched text
 * move by their chapter's shift, and the ones in a reworded chapter look for
 * their sentence in the new words. A sentence that is not there any more is
 * kept, marked stale, at about the place it was.
 */
async function moveUnits(
  database: Database,
  bookId: string,
  units: { id: string; target: string; start: number; end: number; source: string }[],
  merged: Segment[],
  reworded: Segment[],
  out: string,
  oldLength: number
) {
  if (!units.length) return;
  await database.runAsync(
    'UPDATE translation_units SET start = -start - 1, end = -end - 1 WHERE book_id = ?', bookId);
  const outside = reworded
    .map((s) => `NOT ((-start - 1) >= ${s.os} AND (-start - 1) < ${s.oe})`)
    .join(' AND ');
  await database.runAsync(
    `UPDATE translation_units
        SET start = ${offsetCase(merged, '(-start - 1)', oldLength, out.length)},
            end = ${offsetCase(merged, '(-end - 1)', oldLength, out.length)}
      WHERE book_id = ? AND start < 0${outside ? ` AND ${outside}` : ''}`,
    bookId
  );
  const taken = new Set<string>();
  for (const unit of units) {
    const segment = reworded.find((s) => unit.start >= s.os && unit.start < s.oe);
    if (!segment) continue;
    const words = out.slice(segment.ns, segment.ne);
    const guess = mapOffset(merged, unit.start, oldLength, out.length) - segment.ns;
    const found = nearest(words, unit.source, guess);
    let start = found >= 0 ? segment.ns + found : segment.ns + guess;
    let end = found >= 0 ? start + unit.source.length : start + Math.max(1, unit.end - unit.start);
    while (taken.has(`${unit.target}:${start}:${end}`)) { start++; end++; }
    taken.add(`${unit.target}:${start}:${end}`);
    await database.runAsync('UPDATE translation_units SET start = ?, end = ?, stale = ? WHERE id = ?',
      start, end, found >= 0 ? 0 : 1, unit.id);
  }
}

function nearest(text: string, needle: string, hint: number): number {
  if (!needle) return -1;
  let best = -1;
  for (let at = text.indexOf(needle); at >= 0; at = text.indexOf(needle, at + 1)) {
    if (best < 0 || Math.abs(at - hint) < Math.abs(best - hint)) best = at;
  }
  return best;
}

/** A book made from the very same file. */
export async function bookWithSource(hash: string) {
  const database = await db();
  return database.getFirstAsync<{ id: string; title: string; author: string | null }>(
    'SELECT id, title, author FROM books WHERE source_hash = ? LIMIT 1', hash);
}

/** The hints inside one range, measured from its start. */
export function hintsIn(hints: StructureHint[], start: number, end: number): StructureHint[] {
  return within(hints, start, end);
}

function within(hints: StructureHint[], start: number, end: number): StructureHint[] {
  return hints
    .filter((hint) => hint.start >= start && hint.start < end)
    .map((hint) => ({ ...hint, start: hint.start - start, end: hint.end - start }));
}

function shift(hints: StructureHint[], by: number): StructureHint[] {
  return hints.map((hint) => ({ ...hint, start: hint.start + by, end: hint.end + by }));
}

function parseList(raw: string): StructureHint[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
