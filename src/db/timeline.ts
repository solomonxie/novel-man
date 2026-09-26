import { db, newId } from './index';
import { noticeChange } from '../backup/changes';

/**
 * How a book was read, as the few moments worth remembering about it.
 *
 * Deliberately not an activity log. Nothing here is written per page turn or
 * per session: what goes in is what somebody would actually say out loud —
 * wanted it, started it, got through a chapter, finished it — and each row can
 * be moved, reworded or deleted, because most of a reading history happened
 * before this app was installed.
 */
export type EventKind = 'status' | 'chapter' | 'note';
export type EventSource = 'app' | 'goodreads' | 'manual';

export type ReadingEvent = {
  id: string;
  book_id: string;
  kind: EventKind;
  /** When it happened, which is not when it was recorded. */
  at: number;
  /** For a status, which one. For a chapter, what it is called. */
  label: string | null;
  chapter_idx: number | null;
  note: string | null;
  source: EventSource;
  created_at: number;
};

export async function listEvents(bookId: string): Promise<ReadingEvent[]> {
  const database = await db();
  // Oldest first: this is the story of reading the book, and a story is not
  // told backwards.
  return database.getAllAsync<ReadingEvent>(
    'SELECT * FROM reading_events WHERE book_id = ? ORDER BY at, created_at',
    bookId
  );
}

export type NewEvent = {
  bookId: string;
  kind: EventKind;
  at: number;
  label?: string | null;
  chapterIdx?: number | null;
  note?: string | null;
  source?: EventSource;
};

/**
 * Written once. The same status set twice in a day, or a shelf imported again,
 * is the same event — see the unique index in `migrations`.
 */
export async function addEvent(event: NewEvent): Promise<void> {
  const database = await db();
  await database.runAsync(
    `INSERT INTO reading_events (id, book_id, kind, at, label, chapter_idx, note, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(book_id, kind, COALESCE(label, ''), at) DO NOTHING`,
    newId(),
    event.bookId,
    event.kind,
    event.at,
    event.label ?? null,
    event.chapterIdx ?? null,
    event.note ?? null,
    event.source ?? 'app',
    Date.now()
  );
  noticeChange();
}

export async function editEvent(id: string, patch: { at?: number; note?: string | null }) {
  const database = await db();
  if (patch.at !== undefined) {
    await database.runAsync('UPDATE reading_events SET at = ? WHERE id = ?', patch.at, id);
  }
  if (patch.note !== undefined) {
    await database.runAsync('UPDATE reading_events SET note = ? WHERE id = ?', patch.note, id);
  }
  noticeChange();
}

export async function deleteEvent(id: string) {
  const database = await db();
  await database.runAsync('DELETE FROM reading_events WHERE id = ?', id);
  noticeChange();
}

/** A day the reader typed, in the only format that is the same in every country. */
export function dayOf(at: number): string {
  const date = new Date(at);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Null for anything that is not a real day, so a typo never moves an event. */
export function fromDay(typed: string, keepTimeOf = 0): number | null {
  const parts = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(typed.trim());
  if (!parts) return null;
  const [year, month, day] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const was = new Date(keepTimeOf);
  const at = new Date(year, month - 1, day, was.getHours(), was.getMinutes());
  return Number.isNaN(at.getTime()) || at.getMonth() !== month - 1 ? null : at.getTime();
}
