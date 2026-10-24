import AsyncStorage from '@react-native-async-storage/async-storage';

import { rateBook, removeAnnotations, updateBook } from '../db/repo';
import { deleteBookSafely } from '../backup/trash';
import type { Was } from './imports';

export type ImportSource = 'csv' | 'goodreads' | 'notes';

/**
 * Everything one import wrote, so it can be taken back: the books it made,
 * the notes it added, and what it overwrote on books that were already here.
 */
export type ImportRun = {
  id: string;
  at: number;
  source: ImportSource;
  from: string;
  created: string[];
  notes: string[];
  was: Was[];
};

const RUNS = 'imports.runs';
const KEEP_RUNS = 10;

async function readRuns(): Promise<ImportRun[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(RUNS)) ?? '[]') as ImportRun[];
  } catch {
    return [];
  }
}

export async function recordRun(run: Omit<ImportRun, 'id' | 'at'>): Promise<void> {
  if (!run.created.length && !run.notes.length && !run.was.length) return;
  const at = Date.now();
  const runs = [{ ...run, id: `${at}`, at }, ...(await readRuns())].slice(0, KEEP_RUNS);
  await AsyncStorage.setItem(RUNS, JSON.stringify(runs));
}

export async function lastRun(source: ImportSource): Promise<ImportRun | null> {
  return (await readRuns()).find((run) => run.source === source) ?? null;
}

/**
 * Notes go, earlier answers come back, and the books it made move to Recently
 * Deleted — so an undo is itself undoable for a month.
 */
export async function undoRun(run: ImportRun): Promise<void> {
  await removeAnnotations(run.notes);
  for (const was of run.was) {
    await rateBook(was.id, { stars: was.stars, review: was.review });
    await updateBook(was.id, { status: was.status, year: was.year });
  }
  for (const id of run.created) await deleteBookSafely(id);
  await AsyncStorage.setItem(
    RUNS,
    JSON.stringify((await readRuns()).filter((kept) => kept.id !== run.id))
  );
}
