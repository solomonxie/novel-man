/**
 * Enough CSV for a published catalog: quoted fields, doubled quotes inside
 * them, commas and newlines inside those. Not a general parser — it reads one
 * file whose shape is known, and anything it can't read is a row it drops
 * rather than a book it invents.
 */
export function parseCsv(source: string): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  forEachCsvRow(source, (row) => {
    rows.push(row);
  });
  return rows;
}

/**
 * The same read, one row at a time. Gutenberg's catalog is 21 MB and 90,000
 * rows; holding all of them as objects before writing any of them is how a
 * phone runs out of memory doing something it could have streamed.
 */
export function forEachCsvRow(
  source: string,
  onRow: (row: Record<string, string>) => void
): void {
  let header: string[] | null = null;
  eachRow(source.replace(/^﻿/, ''), (cells) => {
    if (!header) {
      header = cells;
      return;
    }
    const row: Record<string, string> = {};
    header.forEach((name, at) => {
      row[name] = cells[at] ?? '';
    });
    onRow(row);
  });
}

function eachRow(source: string, onCells: (cells: string[]) => void): void {
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let at = 0; at < source.length; at++) {
    const char = source[at];
    if (quoted) {
      if (char !== '"') {
        cell += char;
      } else if (source[at + 1] === '"') {
        cell += '"';
        at++;
      } else {
        quoted = false;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[at + 1] === '\n') at++;
      row.push(cell);
      // A blank line between rows is not a row of one empty field.
      if (row.length > 1 || row[0] !== '') onCells(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    onCells(row);
  }
}
