import { db, newId, transaction } from './index';

export type TranslationUnit = {
  id: string;
  book_id: string;
  target: string;
  chapter_idx: number;
  start: number;
  end: number;
  source: string;
  machine: string | null;
  edited: string | null;
  stale: number;
  updated_at: number;
};

export type Term = {
  id: string;
  book_id: string;
  target: string;
  source: string;
  translation: string;
  locked: number;
  note: string | null;
  entity_id: string | null;
  created_at: number;
};

export type MemoryEntry = {
  id: string;
  book_id: string;
  target: string;
  source: string;
  machine: string;
  edited: string;
  created_at: number;
};

export async function listTargets(bookId: string): Promise<{ target: string; units: number; done: number }[]> {
  const database = await db();
  return database.getAllAsync(
    `SELECT target,
            COUNT(*) AS units,
            SUM(CASE WHEN machine IS NOT NULL AND stale = 0 THEN 1 ELSE 0 END) AS done
     FROM translation_units WHERE book_id = ? GROUP BY target ORDER BY target`,
    bookId
  );
}

export async function listUnits(bookId: string, target: string, chapterIdx?: number): Promise<TranslationUnit[]> {
  const database = await db();
  if (chapterIdx === undefined) {
    return database.getAllAsync<TranslationUnit>(
      'SELECT * FROM translation_units WHERE book_id = ? AND target = ? ORDER BY start',
      bookId,
      target
    );
  }
  return database.getAllAsync<TranslationUnit>(
    'SELECT * FROM translation_units WHERE book_id = ? AND target = ? AND chapter_idx = ? ORDER BY start',
    bookId,
    target,
    chapterIdx
  );
}

const UNIT_BATCH = 200;

/** Sentences are created once per chapter; a re-run fills them in, not re-adds. */
export async function seedUnits(
  bookId: string,
  target: string,
  units: { chapter_idx: number; start: number; end: number; source: string }[]
) {
  const database = await db();
  const now = Date.now();
  await transaction(async () => {
    for (let from = 0; from < units.length; from += UNIT_BATCH) {
      const slice = units.slice(from, from + UNIT_BATCH);
      const values: (string | number)[] = [];
      const rows = slice.map((unit) => {
        values.push(newId(), bookId, target, unit.chapter_idx, unit.start, unit.end, unit.source, now);
        return '(?, ?, ?, ?, ?, ?, ?, ?)';
      });
      await database.runAsync(
        `INSERT INTO translation_units
           (id, book_id, target, chapter_idx, start, end, source, updated_at)
         VALUES ${rows.join(', ')}
         ON CONFLICT(book_id, target, start, end) DO NOTHING`,
        values
      );
    }
  });
}

export async function saveMachine(bookId: string, target: string, rows: { start: number; end: number; text: string }[]) {
  const database = await db();
  const now = Date.now();
  await transaction(async () => {
    for (const row of rows) {
      await database.runAsync(
        `UPDATE translation_units SET machine = ?, stale = 0, updated_at = ?
         WHERE book_id = ? AND target = ? AND start = ? AND end = ?`,
        row.text, now, bookId, target, row.start, row.end
      );
    }
  });
}

export async function saveEdit(unitId: string, edited: string | null) {
  const database = await db();
  await database.runAsync(
    'UPDATE translation_units SET edited = ?, updated_at = ? WHERE id = ?',
    edited,
    Date.now(),
    unitId
  );
}

/** Only the sentences that actually contain the term are worth re-running. */
export async function markStaleContaining(bookId: string, target: string, needle: string): Promise<number> {
  const database = await db();
  const result = await database.runAsync(
    `UPDATE translation_units SET stale = 1
     WHERE book_id = ? AND target = ? AND machine IS NOT NULL AND instr(source, ?) > 0`,
    bookId,
    target,
    needle
  );
  return result.changes;
}

export async function deleteTarget(bookId: string, target: string) {
  const database = await db();
  await database.runAsync(
    'DELETE FROM translation_units WHERE book_id = ? AND target = ?',
    bookId,
    target
  );
}

export async function listTerms(bookId: string, target: string): Promise<Term[]> {
  const database = await db();
  return database.getAllAsync<Term>(
    'SELECT * FROM terms WHERE book_id = ? AND target = ? ORDER BY locked DESC, source',
    bookId,
    target
  );
}

export async function upsertTerm(input: {
  bookId: string;
  target: string;
  source: string;
  translation: string;
  locked?: boolean;
  note?: string | null;
  entityId?: string | null;
}): Promise<string> {
  const database = await db();
  const id = newId();
  await database.runAsync(
    `INSERT INTO terms (id, book_id, target, source, translation, locked, note, entity_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(book_id, target, source) DO UPDATE SET
       translation = excluded.translation,
       locked = excluded.locked,
       note = excluded.note`,
    id, input.bookId, input.target, input.source, input.translation,
    input.locked ? 1 : 0, input.note ?? null, input.entityId ?? null, Date.now()
  );
  return id;
}

export async function setTermLocked(id: string, locked: boolean) {
  const database = await db();
  await database.runAsync('UPDATE terms SET locked = ? WHERE id = ?', locked ? 1 : 0, id);
}

export async function deleteTerm(id: string) {
  const database = await db();
  await database.runAsync('DELETE FROM terms WHERE id = ?', id);
}

export async function rememberEdit(input: {
  bookId: string;
  target: string;
  source: string;
  machine: string;
  edited: string;
}) {
  const database = await db();
  await database.runAsync(
    `INSERT INTO translation_memory (id, book_id, target, source, machine, edited, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    newId(), input.bookId, input.target, input.source, input.machine, input.edited, Date.now()
  );
}

export async function listMemory(bookId: string, target: string, limit = 200): Promise<MemoryEntry[]> {
  const database = await db();
  return database.getAllAsync<MemoryEntry>(
    'SELECT * FROM translation_memory WHERE book_id = ? AND target = ? ORDER BY created_at DESC LIMIT ?',
    bookId,
    target,
    limit
  );
}
