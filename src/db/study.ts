import { db } from './index';
import { unseen, type Schedule } from '../study/schedule';
import type { Entity, EntityKind } from './repo';

/**
 * The reader's memory of this book, as rows.
 *
 * Kept apart from `repo.ts` the way the translation tables are: this is one
 * table with one owner, and the only thing that decides what goes in it is
 * `src/study/schedule.ts`.
 */

/** What a book puts in its deck. A card made on purpose, and the language kept. */
export const STUDIED: EntityKind[] = ['card', 'term', 'word'];

export type StudyCard = { entity: Entity; schedule: Schedule };

type Row = {
  entity_id: string;
  reps: number;
  lapses: number;
  ease: number;
  interval_days: number;
  due_at: number;
  last_at: number | null;
  last_recalled: number | null;
};

function scheduleOf(row: Row): Schedule {
  return {
    reps: row.reps,
    lapses: row.lapses,
    ease: row.ease,
    intervalDays: row.interval_days,
    dueAt: row.due_at,
    lastAt: row.last_at,
    lastRecalled: row.last_recalled === null ? null : row.last_recalled === 1,
  };
}

/**
 * Everything this book has to study, schedule included.
 *
 * A left join in effect: an entity with no row has never been studied, and
 * `unseen` is what that means — due now, with no history to compute from. So
 * a word kept thirty seconds ago is in the deck without anything having been
 * written when it was kept.
 */
export async function deckOf(bookId: string, now = Date.now()): Promise<StudyCard[]> {
  const database = await db();
  const entities = await database.getAllAsync<Entity>(
    `SELECT * FROM entities
      WHERE book_id = ? AND kind IN (${STUDIED.map(() => '?').join(', ')})
        AND TRIM(name) <> ''
      ORDER BY sort_index, name`,
    bookId,
    ...STUDIED
  );
  const rows = await database.getAllAsync<Row>('SELECT * FROM study WHERE book_id = ?', bookId);
  const byId = new Map(rows.map((row) => [row.entity_id, scheduleOf(row)]));
  return entities.map((entity) => ({
    entity,
    schedule: byId.get(entity.id) ?? unseen(now),
  }));
}

export async function recordAnswer(bookId: string, entityId: string, schedule: Schedule) {
  const database = await db();
  await database.runAsync(
    `INSERT INTO study
       (entity_id, book_id, reps, lapses, ease, interval_days, due_at, last_at, last_recalled)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(entity_id) DO UPDATE SET
       reps = excluded.reps,
       lapses = excluded.lapses,
       ease = excluded.ease,
       interval_days = excluded.interval_days,
       due_at = excluded.due_at,
       last_at = excluded.last_at,
       last_recalled = excluded.last_recalled`,
    entityId,
    bookId,
    schedule.reps,
    schedule.lapses,
    schedule.ease,
    schedule.intervalDays,
    schedule.dueAt,
    schedule.lastAt,
    schedule.lastRecalled === null ? null : Number(schedule.lastRecalled),
  );
}

/** What the book page says about studying without loading the whole deck. */
export type StudyState = { total: number; due: number; studied: number; lastAt: number | null };

export async function studyState(bookId: string, now = Date.now()): Promise<StudyState> {
  const database = await db();
  const row = await database.getFirstAsync<{
    total: number;
    studied: number;
    due_later: number;
    last_at: number | null;
  }>(
    `SELECT
       COUNT(*) AS total,
       COUNT(s.entity_id) AS studied,
       -- Everything not yet due. Due is the remainder, which is what keeps an
       -- entity with no row counted as due without a join that invents one.
       SUM(CASE WHEN s.due_at > ? THEN 1 ELSE 0 END) AS due_later,
       MAX(s.last_at) AS last_at
     FROM entities e
     LEFT JOIN study s ON s.entity_id = e.id
     WHERE e.book_id = ? AND e.kind IN (${STUDIED.map(() => '?').join(', ')})
       AND TRIM(e.name) <> ''`,
    now,
    bookId,
    ...STUDIED
  );
  const total = row?.total ?? 0;
  return {
    total,
    due: Math.max(0, total - (row?.due_later ?? 0)),
    studied: row?.studied ?? 0,
    lastAt: row?.last_at ?? null,
  };
}
