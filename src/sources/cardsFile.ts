import { csvRows } from './csv';

export type CardDraft = { topics: string[]; tags: string[]; front: string; back: string; book: string };

const NAMES = {
  topics: ['topics', 'topic', 'deck'],
  tags: ['tags', 'tag'],
  front: ['front', 'question', 'term', 'word', 'q'],
  back: ['back', 'answer', 'definition', 'meaning', 'a'],
  book: ['book', 'book title', 'source'],
} as const;
/** The order without a header row; four columns is the older file, without tags. */
const COLUMNS = ['topics', 'tags', 'book', 'front', 'back'] as const;
const UNTAGGED = ['topics', 'book', 'front', 'back'] as const;

const topicsIn = (cell = '') => cell.split(/[;|]/).map((topic) => topic.replace(/\s+/g, ' ').trim()).filter(Boolean);

/**
 * Cards out of a CSV or tab-separated file: topics, tags, book, front, back — in that
 * order, or in any order under a header row naming them. Lines starting with #
 * are skipped, and so is a row without a front.
 */
export function parseCardsFile(source: string): CardDraft[] {
  const text = source.replace(/^﻿/, '');
  const lines = text.split(/\r?\n/).filter((line) => line.trim() && !line.startsWith('#'));
  const rows = lines[0]?.includes('\t')
    ? lines.map((line) => line.split('\t'))
    : csvRows(text).filter((row) => !row[0]?.startsWith('#'));
  if (!rows.length) return [];

  const head = rows[0].map((cell) => cell.trim().toLowerCase());
  const named = head.some((cell) => (NAMES.front as readonly string[]).includes(cell));
  const order: readonly string[] = rows.some((row) => row.length >= COLUMNS.length) ? COLUMNS : UNTAGGED;
  const at = Object.fromEntries(
    COLUMNS.map((field) => [
      field,
      named ? head.findIndex((cell) => (NAMES[field] as readonly string[]).includes(cell)) : order.indexOf(field),
    ])
  ) as Record<(typeof COLUMNS)[number], number>;
  const cell = (row: string[], field: (typeof COLUMNS)[number]) => (at[field] < 0 ? '' : row[at[field]]?.trim() ?? '');

  return (named ? rows.slice(1) : rows)
    .map((row) => ({
      topics: topicsIn(cell(row, 'topics')),
      tags: topicsIn(cell(row, 'tags')).map((tag) => tag.replace(/^#+/, '')).filter(Boolean),
      front: cell(row, 'front'),
      back: cell(row, 'back'),
      book: cell(row, 'book'),
    }))
    .filter((draft) => draft.front);
}
