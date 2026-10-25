import AsyncStorage from '@react-native-async-storage/async-storage';

import { db, newId, transaction } from '../db';
import { getBook, listBookNames, type Book } from '../db/repo';
import { copyToTrash, purgeTrashed, restoreTrashed } from '../backup/trash';
import { noticeChange } from '../backup/changes';
import { canKeep, copiesOf, mergeMode, pairKey } from './duplicates';
import { STATUSES, statusOf } from './record';

/**
 * One book out of two. The copy that stays takes whatever it was missing — an
 * author, a cover, a rating, a review — and the reader's own filing: tags,
 * lists, notes kept without a passage, the dates it was read. The other goes
 * to Recently Deleted whole, so nothing it held is lost to a wrong merge.
 *
 * Two manuscripts are not merged: their offsets address different texts. They
 * stay as editions, the reader's verdict and filing move onto one of them, and
 * the pair is not suggested again.
 */
type Field = keyof Book;

const DETAILS: Field[] = ['author', 'year', 'edition', 'cover_path', 'isbn', 'publisher', 'website', 'summary', 'impressions'];
const VERDICT: Field[][] = [['stars', 'rated_at'], ['review', 'reviewed_at']];

type Values = Partial<Record<Field, Book[Field]>>;

export type MergeRun = {
  id: string;
  batch: string;
  at: number;
  mode: 'edition' | 'merge';
  keep: string;
  other: string;
  title: string;
  trashed: string | null;
  /** What each book held, for every column this changed. */
  was: { keep: Values; other: Values };
  tags: string[];
  lists: string[];
  otherTags: string[];
  otherLists: string[];
  notes: string[];
  events: string[];
};

const RUNS = 'duplicates.runs';
const DISMISSED = 'duplicates.dismissed';
const KEEP_BATCHES = 5;

const blank = (value: unknown) => value === null || value === undefined || (typeof value === 'string' && !value.trim());

/** What the keeper takes from the other, and which of the other's columns that empties. */
function takenFrom(keep: Book, other: Book, mode: MergeRun['mode']): { onto: Values; off: Field[] } {
  const onto: Values = {};
  const off: Field[] = [];
  for (const field of DETAILS) {
    if (mode === 'edition' && field === 'edition') continue;
    if (blank(keep[field]) && !blank(other[field])) onto[field] = other[field];
  }
  for (const [field, date] of VERDICT) {
    if (blank(keep[field]) && !blank(other[field])) {
      onto[field] = other[field];
      onto[date] = other[date];
      off.push(field, date);
    }
  }
  const mine = statusOf(keep.status);
  const theirs = statusOf(other.status);
  if (theirs && (!mine || STATUSES.indexOf(theirs) > STATUSES.indexOf(mine))) {
    onto.status = theirs;
    off.push('status');
  }
  return { onto, off };
}

function pick(book: Book, fields: Field[]): Values {
  return Object.fromEntries(fields.map((field) => [field, book[field]]));
}

async function setColumns(id: string, values: Values) {
  const fields = Object.keys(values) as Field[];
  if (!fields.length) return;
  const database = await db();
  await database.runAsync(
    `UPDATE books SET ${fields.map((field) => `${field} = ?`).join(', ')} WHERE id = ?`,
    [...fields.map((field) => (values[field] ?? null) as string | number | null), id]
  );
}

const marks = (ids: string[]) => ids.map(() => '?').join(', ');

export async function mergeBooks(keepId: string, otherId: string, batch: string = newId()): Promise<MergeRun> {
  const [keep, other] = await Promise.all([getBook(keepId), getBook(otherId)]);
  if (!keep || !other) throw new Error('one of these books is no longer on the shelf');
  if (!canKeep(keep, [keep, other])) throw new Error('the copy with the text has to be the one kept');
  const mode = mergeMode(keep, other);
  const trashed = mode === 'merge' ? await copyToTrash(otherId) : null;
  if (mode === 'merge' && !trashed) throw new Error('could not keep a copy; nothing was merged');

  const { onto, off } = takenFrom(keep, other, mode);
  const database = await db();
  const ids = async (sql: string, ...args: string[]) =>
    (await database.getAllAsync<{ id: string }>(sql, ...args)).map((row) => row.id);

  const run: MergeRun = {
    id: newId(),
    batch,
    at: Date.now(),
    mode,
    keep: keepId,
    other: otherId,
    title: other.title,
    trashed,
    was: { keep: pick(keep, Object.keys(onto) as Field[]), other: pick(other, off) },
    tags: await ids(
      `SELECT tag AS id FROM book_tags WHERE book_id = ?
          AND tag NOT IN (SELECT tag FROM book_tags WHERE book_id = ?)`, otherId, keepId),
    lists: await ids(
      `SELECT list_id AS id FROM list_books WHERE book_id = ?
          AND list_id NOT IN (SELECT list_id FROM list_books WHERE book_id = ?)`, otherId, keepId),
    otherTags: await ids('SELECT tag AS id FROM book_tags WHERE book_id = ?', otherId),
    otherLists: await ids('SELECT list_id AS id FROM list_books WHERE book_id = ?', otherId),
    notes: mode === 'merge'
      ? await ids('SELECT id FROM annotations WHERE book_id = ? AND standalone = 1', otherId)
      : [],
    events: mode === 'merge' ? await ids('SELECT id FROM reading_events WHERE book_id = ?', otherId) : [],
  };

  try {
    await moveOnto(run, onto, off);
  } catch (problem) {
    if (trashed) await purgeTrashed(trashed);
    throw problem;
  }

  if (mode === 'edition') await dismissPair(keepId, otherId);
  await saveRuns([run, ...(await readRuns())]);
  noticeChange();
  return run;
}

async function moveOnto(run: MergeRun, onto: Values, off: Field[]) {
  const { keep: keepId, other: otherId, mode } = run;
  const database = await db();
  await transaction(async () => {
    await setColumns(keepId, onto);
    await database.runAsync(
      `INSERT OR IGNORE INTO book_tags (book_id, tag) SELECT ?, tag FROM book_tags WHERE book_id = ?`,
      keepId, otherId
    );
    await database.runAsync(
      `INSERT OR IGNORE INTO list_books (list_id, book_id, added_at)
       SELECT list_id, ?, added_at FROM list_books WHERE book_id = ?`,
      keepId, otherId
    );
    if (mode === 'merge') {
      if (run.notes.length) {
        await database.runAsync(
          `UPDATE annotations SET book_id = ?, chapter_id = NULL WHERE id IN (${marks(run.notes)})`,
          [keepId, ...run.notes]
        );
      }
      await database.runAsync('UPDATE reading_events SET book_id = ? WHERE book_id = ?', keepId, otherId);
      await database.runAsync('DELETE FROM books WHERE id = ?', otherId);
    } else {
      await setColumns(otherId, Object.fromEntries(off.map((field) => [field, null])));
      await database.runAsync('DELETE FROM book_tags WHERE book_id = ?', otherId);
      await database.runAsync('DELETE FROM list_books WHERE book_id = ?', otherId);
    }
  });
}

/** Every other copy into the keeper, as one undo. */
export async function mergeGroup(keepId: string, others: string[], batch: string = newId()): Promise<MergeRun[]> {
  const runs: MergeRun[] = [];
  for (const other of others) runs.push(await mergeBooks(keepId, other, batch));
  return runs;
}

async function undoRun(run: MergeRun) {
  const database = await db();
  await transaction(async () => {
    await setColumns(run.keep, run.was.keep);
    if (run.tags.length) {
      await database.runAsync(
        `DELETE FROM book_tags WHERE book_id = ? AND tag IN (${marks(run.tags)})`,
        [run.keep, ...run.tags]
      );
    }
    if (run.lists.length) {
      await database.runAsync(
        `DELETE FROM list_books WHERE book_id = ? AND list_id IN (${marks(run.lists)})`,
        [run.keep, ...run.lists]
      );
    }
    if (run.mode === 'merge') {
      // The restored copy carries its own; these are the ones that moved.
      for (const [table, moved] of [['annotations', run.notes], ['reading_events', run.events]] as const) {
        if (moved.length) {
          await database.runAsync(`DELETE FROM ${table} WHERE id IN (${marks(moved)})`, moved);
        }
      }
      return;
    }
    if (!(await getBook(run.other))) return;
    await setColumns(run.other, run.was.other);
    for (const tag of run.otherTags) {
      await database.runAsync('INSERT OR IGNORE INTO book_tags (book_id, tag) VALUES (?, ?)', run.other, tag);
    }
    for (const list of run.otherLists) {
      await database.runAsync(
        'INSERT OR IGNORE INTO list_books (list_id, book_id, added_at) VALUES (?, ?, ?)',
        list, run.other, Date.now()
      );
    }
  });
  if (run.trashed) await restoreTrashed(run.trashed);
  if (run.mode === 'edition') await undismissPair(run.keep, run.other);
}

/** The last merge, or merge-all, back the way it was. */
export async function undoLastMerge(): Promise<number> {
  const runs = await readRuns();
  const batch = runs[0]?.batch;
  if (!batch) return 0;
  const undone = runs.filter((run) => run.batch === batch);
  for (const run of undone) await undoRun(run);
  await saveRuns(runs.filter((run) => run.batch !== batch));
  noticeChange();
  return undone.length;
}

export async function lastMerge(): Promise<MergeRun[]> {
  const runs = await readRuns();
  return runs.filter((run) => run.batch === runs[0]?.batch);
}

async function readRuns(): Promise<MergeRun[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(RUNS)) ?? '[]') as MergeRun[];
  } catch {
    return [];
  }
}

async function saveRuns(runs: MergeRun[]) {
  const batches = [...new Set(runs.map((run) => run.batch))].slice(0, KEEP_BATCHES);
  await AsyncStorage.setItem(RUNS, JSON.stringify(runs.filter((run) => batches.includes(run.batch))));
}

/** Pairs the reader said are two books, or kept as two editions. */
export async function dismissedPairs(): Promise<Set<string>> {
  try {
    return new Set(JSON.parse((await AsyncStorage.getItem(DISMISSED)) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

export async function dismissPair(a: string, b: string) {
  const pairs = await dismissedPairs();
  pairs.add(pairKey(a, b));
  await AsyncStorage.setItem(DISMISSED, JSON.stringify([...pairs]));
}

async function undismissPair(a: string, b: string) {
  const pairs = await dismissedPairs();
  pairs.delete(pairKey(a, b));
  await AsyncStorage.setItem(DISMISSED, JSON.stringify([...pairs]));
}

/** Every pair in a group, so none of them comes back. */
export async function dismissGroup(ids: string[]) {
  const pairs = await dismissedPairs();
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) pairs.add(pairKey(ids[i], ids[j]));
  }
  await AsyncStorage.setItem(DISMISSED, JSON.stringify([...pairs]));
}

/** How many other copies of this book the shelf holds. */
export async function copiesOnShelf(bookId: string): Promise<number> {
  const shelf = await listBookNames();
  const book = shelf.find((entry) => entry.id === bookId);
  return book ? copiesOf(book, shelf, await dismissedPairs()).length : 0;
}
