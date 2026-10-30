/**
 * The markup a technical book is actually written in. A tutorial from a repo,
 * a README, a set of notes — they arrive as Markdown, and reading `**this**`
 * with the asterisks still in it is reading the source rather than the book.
 * An EPUB's `<b>`, `<em>`, `<u>` and the rest are written the same way on import.
 */
export type Run = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  strike?: boolean;
  /** `++inserted++`, which is how `<u>` and `<ins>` are kept. */
  underline?: boolean;
  /** `==marked==`, the one piece of syntax that means "highlight". */
  mark?: boolean;
  /** `$x^2$`: TeX, drawn as a formula where it can be. */
  math?: boolean;
  /** Where `text` begins in what was given, so a link can be cut out of it. */
  from: number;
};

type Style = 'bold' | 'italic' | 'code' | 'strike' | 'underline' | 'mark' | 'math';

/** One capture group each, so group `n` is `SPANS[n - 1]`. Underscores never open inside a word. */
const SPANS: [string, Style[]][] = [
  [String.raw`\*\*\*(?=\S)([\s\S]*?\S)\*\*\*`, ['bold', 'italic']],
  [String.raw`(?<!\w)___(?=\S)([\s\S]*?\S)___(?!\w)`, ['bold', 'italic']],
  [String.raw`\*\*(?=\S)([\s\S]*?\S)\*\*`, ['bold']],
  [String.raw`(?<!\w)__(?=\S)([\s\S]*?\S)__(?!\w)`, ['bold']],
  [String.raw`\*(?=[^\s*])([\s\S]*?[^\s*])\*`, ['italic']],
  [String.raw`(?<!\w)_(?=[^\s_])([\s\S]*?[^\s_])_(?!\w)`, ['italic']],
  ['`([^`\\n]+)`', ['code']],
  [String.raw`~~(?=\S)([\s\S]*?\S)~~`, ['strike']],
  [String.raw`(?<![\w+])\+\+(?=[^\s+])([\s\S]*?[^\s+])\+\+(?![\w+])`, ['underline']],
  [String.raw`==(?=\S)([\s\S]*?\S)==`, ['mark']],
  [String.raw`\$([^\s$](?:[^$\n]*?[^\s$\\])?)\$(?!\d)`, ['math']],
];
const INLINE = new RegExp(SPANS.map(([source]) => source).join('|'), 'g');

/** Most sentences carry no markup at all, and Hermes charges per regex run. */
const MARKERS = /[*_`~=$+]/;

/** Styles inside styles: `**bold _and italic_**`. Code and TeX are taken as written. */
export function runsIn(text: string): Run[] {
  if (!MARKERS.test(text)) return [{ text, from: 0 }];
  const runs = styledRuns(text, 0, {});
  return runs.length ? runs : [{ text, from: 0 }];
}

function styledRuns(text: string, base: number, outer: Partial<Record<Style, true>>): Run[] {
  const runs: Run[] = [];
  let cursor = 0;
  const plain = (to: number) => {
    if (to > cursor) runs.push({ text: text.slice(cursor, to), ...outer, from: base + cursor });
  };
  for (const match of text.matchAll(INLINE)) {
    const at = match.index ?? 0;
    plain(at);
    const group = match.findIndex((value, index) => index > 0 && value !== undefined);
    const inner = match[group];
    const styles = SPANS[group - 1][1];
    const from = at + match[0].indexOf(inner);
    const style = { ...outer };
    for (const each of styles) style[each] = true;
    if (style.code || style.math || !MARKERS.test(inner)) runs.push({ text: inner, ...style, from: base + from });
    else runs.push(...styledRuns(inner, base + from, style));
    cursor = at + match[0].length;
  }
  plain(text.length);
  return runs;
}

/** Inline code is padded by a thin space each side, so its tint does not touch the letters. */
const PAD = '\u2009';

export function drawn(run: Run): string {
  return run.code ? `${PAD}${run.text}${PAD}` : run.text;
}

export function drawnText(text: string): string {
  return runsIn(text).map(drawn).join('');
}

/** Where a character drawn `at` into `text` sits in `text` itself, markup and padding undone. */
export function sourceOffset(text: string, at: number): number {
  let shown = 0;
  for (const run of runsIn(text)) {
    const pad = run.code ? PAD.length : 0;
    const length = run.text.length + pad * 2;
    if (at < shown + length) return run.from + Math.min(run.text.length - 1, Math.max(0, at - shown - pad));
    shown += length;
  }
  return text.length;
}

/**
 * A run cut where links begin and end, offsets measured in the same text the
 * runs were found in.
 */
export function cutAt<T extends { from: number; to: number }>(run: Run, links: T[]): (Run & { link?: T })[] {
  const end = run.from + run.text.length;
  const inside = links.filter((link) => link.from < end && link.to > run.from);
  if (!inside.length) return [run];
  const pieces: (Run & { link?: T })[] = [];
  let cursor = run.from;
  for (const link of inside) {
    const from = Math.max(cursor, link.from);
    const to = Math.min(end, link.to);
    if (from > cursor) pieces.push({ ...run, text: run.text.slice(cursor - run.from, from - run.from), from: cursor });
    if (to > from) pieces.push({ ...run, text: run.text.slice(from - run.from, to - run.from), from, link });
    cursor = Math.max(cursor, to);
  }
  if (cursor < end) pieces.push({ ...run, text: run.text.slice(cursor - run.from), from: cursor });
  return pieces;
}

export type Align = 'left' | 'center' | 'right';

/** A paragraph that is not prose, and what to draw it with. */
export type RichBlock =
  | { kind: 'code'; lang: string; body: string }
  | { kind: 'diagram'; body: string }
  | { kind: 'math'; tex: string }
  /** `at`: where each cell's words begin in the paragraph, so a link in one can be found. */
  | { kind: 'table'; rows: string[][]; at: number[][]; head: boolean; align: Align[] };

const FENCED = /^```([^\n]*)\n([\s\S]*?)\n?```$/;
const DISPLAY_MATH = /^\$\$([\s\S]+?)\$\$$/;
const TABLE_LINE = /^\|.*\|$/;
const TABLE_RULE = /^\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?$/;

/** A blank line inside code is stored as one space, so the paragraph holds together. */
const unblank = (body: string) => body.replace(/^ $/gm, '');

function cellsOf(line: string): string[] {
  return cellsAt(line, 0).map((cell) => cell.text);
}

function cellsAt(line: string, base: number): { text: string; at: number }[] {
  const cells: { text: string; at: number }[] = [];
  let from = 1;
  for (const edge of line.slice(1, -1).matchAll(/(?<!\\)\||$/g)) {
    const end = 1 + (edge.index ?? 0);
    const raw = line.slice(from, end);
    const lead = raw.length - raw.trimStart().length;
    cells.push({ text: raw.trim().replace(/\\\|/g, '|'), at: base + from + lead });
    from = end + 1;
    if (!edge[0]) break;
  }
  return cells;
}

export function blockOf(paragraph: string): RichBlock | null {
  const trimmed = paragraph.trim();
  const first = trimmed[0];
  if (first !== '`' && first !== '$' && first !== '|' && !/^( {4}|\t)/.test(paragraph)) return null;
  const fenced = FENCED.exec(trimmed);
  if (fenced) {
    const lang = fenced[1].trim().split(/\s+/)[0].toLowerCase();
    const body = unblank(fenced[2]);
    if (lang === 'mermaid') return { kind: 'diagram', body };
    if (lang === 'math' || lang === 'latex' || lang === 'tex') return { kind: 'math', tex: body.trim() };
    return { kind: 'code', lang, body };
  }
  const display = DISPLAY_MATH.exec(trimmed);
  if (display) return { kind: 'math', tex: display[1].trim() };
  if (first === '|') {
    const lines = trimmed.split('\n').map((line) => line.trim());
    if (lines.length >= 2 && lines.every((line) => TABLE_LINE.test(line))) {
      const placed: { text: string; at: number }[][] = [];
      let cursor = 0;
      for (const line of lines) {
        const at = paragraph.indexOf(line, cursor);
        placed.push(cellsAt(line, at));
        cursor = at + line.length;
      }
      const head = TABLE_RULE.test(lines[1]);
      const align: Align[] = head
        ? cellsOf(lines[1]).map((cell) =>
            cell.startsWith(':') && cell.endsWith(':') ? 'center' : cell.endsWith(':') ? 'right' : 'left')
        : [];
      const kept = placed.filter((_, at) => !(head && at === 1));
      return {
        kind: 'table',
        rows: kept.map((row) => row.map((cell) => cell.text)),
        at: kept.map((row) => row.map((cell) => cell.at)),
        head,
        align,
      };
    }
  }
  const indented = indentedCode(paragraph);
  return indented === null ? null : { kind: 'code', lang: '', body: indented };
}

function indentedCode(paragraph: string): string | null {
  const lines = paragraph.replace(/\s+$/, '').split('\n');
  if (lines.length > 1 && lines.every((line) => !line.trim() || /^ {4}|\t/.test(line))) {
    return lines.map((line) => line.replace(/^ {4}|\t/, '')).join('\n');
  }
  return null;
}

/**
 * A fenced block is not prose: it is set monospaced, unwrapped and unsegmented,
 * because a line break inside code is part of the code and a sentence is not a
 * unit anything in there is divided into.
 */
export function codeBlockIn(paragraph: string): string | null {
  const block = blockOf(paragraph);
  return block?.kind === 'code' ? block.body : null;
}
