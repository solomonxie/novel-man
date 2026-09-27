import type { NormalizedDocument, PlacedBlock } from '../import/normalize';

/** Only blocks carrying structure are worth storing; the rest are recoverable. */
export type StructureHint = { start: number; end: number; heading?: number; boundary?: boolean };

export function hintsOf(doc: NormalizedDocument): StructureHint[] {
  return doc.blocks
    .filter((block) => block.heading !== undefined || block.boundary)
    .map(({ start, end, heading, boundary }) => ({ start, end, heading, boundary }));
}

export function parseHints(raw: string): StructureHint[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Rebuilds the document detection ran on. `normalize` joins blocks with
 * exactly one blank line, so paragraph bounds come back out of the text and
 * only the hints have to be stored.
 */
export function reconstruct(text: string, hints: StructureHint[]): NormalizedDocument {
  const byStart = new Map(hints.map((hint) => [hint.start, hint]));
  const blocks: PlacedBlock[] = [];
  let cursor = 0;
  for (const chunk of text.split('\n\n')) {
    const start = cursor;
    cursor += chunk.length + 2;
    if (!chunk.trim()) continue;
    const hint = byStart.get(start);
    blocks.push({ start, end: start + chunk.length, heading: hint?.heading, boundary: hint?.boundary });
  }
  return { text, blocks };
}

/**
 * Not a name, whatever a model puts there. Asked for a field it has no answer
 * for, a model fills it rather than leaving it out — and the filler is always
 * one of a short list of ways of saying nothing. A part called 未知 is not a
 * part of a book; it is the absence of one, written down.
 */
const NOT_A_NAME = new Set([
  'unknown', 'n/a', 'na', 'none', 'null', 'undefined', 'unspecified', 'untitled',
  'no part', 'not applicable', 'part', 'volume', 'book', 'section', '-', '—', '–', '?',
  '未知', '无', '無', '未分卷', '未命名', '不详', '不詳', '无标题', '無標題',
]);

export function meaningfulName(name: string | null | undefined): string {
  const trimmed = name?.trim() ?? '';
  return NOT_A_NAME.has(trimmed.toLowerCase()) ? '' : trimmed;
}

/**
 * Which part each chapter belongs to, once it is settled whether the book has
 * parts at all.
 *
 * One part is not a division. Asked for the parts of a book that has none, a
 * model answers with the same placeholder on every row — "未知", "Part 1", the
 * book's own title — and a Volumes page appears holding a single volume that
 * contains the whole book. That page is worse than no page: it is a level of
 * structure the book does not have, standing between the reader and the
 * chapters.
 *
 * Runs, not names: a part is a stretch of consecutive chapters, which is what
 * a part is in a book. The same name returning later starts another one.
 */
export function partsOf(names: (string | null | undefined)[]): {
  titles: string[];
  /** Per chapter, its index into `titles` — null where the book has no parts. */
  indexes: (number | null)[];
} {
  const trimmed = names.map(meaningfulName);
  const runs: string[] = [];
  for (const name of trimmed) {
    if (name && runs[runs.length - 1] !== name) runs.push(name);
  }
  if (runs.length < 2) return { titles: [], indexes: trimmed.map(() => null) };

  const titles: string[] = [];
  const indexes = trimmed.map((name) => {
    if (!name) return null;
    if (titles[titles.length - 1] !== name) titles.push(name);
    return titles.length - 1;
  });
  return { titles, indexes };
}


/**
 * The rows of a table of contents that arrived cut off.
 *
 * A model asked for a long contents can run out of room mid-object, and the
 * answer is then not JSON at all — so a book whose first forty chapters came
 * back perfectly well failed outright on the forty-first. The complete
 * objects before the cut are real answers and there is no reason to throw
 * them away with the broken one.
 *
 * Only ever used after a strict parse has already failed: this reads less
 * carefully than `JSON.parse`, and where the real thing works it wins.
 */
export function salvageRows<T>(answer: string): T[] {
  const rows: T[] = [];
  // Object literals at one level of nesting, which is the shape of a row.
  for (const match of answer.matchAll(/\{[^{}]*\}/g)) {
    try {
      const row = JSON.parse(match[0]) as T;
      if (row && typeof row === 'object') rows.push(row);
    } catch {
      // A row that does not parse on its own is the cut one, or not a row.
    }
  }
  return rows;
}
