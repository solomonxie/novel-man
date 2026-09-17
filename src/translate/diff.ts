export type Piece = { text: string; change: 'same' | 'added' | 'removed' };

/**
 * A word-level diff of the machine output against the author's edit. It is
 * shown so a correction can be read at a glance, and stored so the same
 * correction can be quoted back to the model on similar lines.
 */
export function diffWords(machine: string, edited: string): Piece[] {
  const from = tokenize(machine);
  const to = tokenize(edited);
  const table = lcs(from, to);

  const pieces: Piece[] = [];
  let i = 0;
  let j = 0;
  while (i < from.length && j < to.length) {
    if (from[i] === to[j]) {
      push(pieces, from[i], 'same');
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      push(pieces, from[i], 'removed');
      i += 1;
    } else {
      push(pieces, to[j], 'added');
      j += 1;
    }
  }
  while (i < from.length) push(pieces, from[i++], 'removed');
  while (j < to.length) push(pieces, to[j++], 'added');
  return pieces;
}

/** CJK has no spaces, so a token is a character there and a word elsewhere. */
function tokenize(text: string): string[] {
  return text.match(/[㐀-鿿぀-ヿ]|[^\s㐀-鿿぀-ヿ]+|\s+/g) ?? [];
}

function push(pieces: Piece[], text: string, change: Piece['change']) {
  const last = pieces[pieces.length - 1];
  if (last && last.change === change) last.text += text;
  else pieces.push({ text, change });
}

function lcs(from: string[], to: string[]): number[][] {
  const table = Array.from({ length: from.length + 1 }, () => new Array(to.length + 1).fill(0));
  for (let i = from.length - 1; i >= 0; i--) {
    for (let j = to.length - 1; j >= 0; j--) {
      table[i][j] = from[i] === to[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  return table;
}

export function hasChanges(machine: string | null, edited: string | null): boolean {
  return !!edited && !!machine && edited.trim() !== machine.trim();
}
