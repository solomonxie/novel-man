/**
 * The markup a technical book is actually written in. A tutorial from a repo,
 * a README, a set of notes — they arrive as Markdown, and reading `**this**`
 * with the asterisks still in it is reading the source rather than the book.
 *
 * Only inline styles live here, and only ones that cannot be confused with the
 * app's own marks: underline is the app's own, so an
 * underline in the text would be a lie about what the reader put there.
 */
export type Run = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  strike?: boolean;
  /** `==marked==`, the one piece of syntax that means "highlight". */
  mark?: boolean;
  /** `$x^2$`: TeX, drawn as a formula where it can be. */
  math?: boolean;
  /** Where `text` begins in what was given, so a link can be cut out of it. */
  from: number;
};

const INLINE =
  /(\*\*|__)(?=\S)([\s\S]*?\S)\1|(\*|_)(?=\S)([\s\S]*?\S)\3|`([^`\n]+)`|~~(?=\S)([\s\S]*?\S)~~|==(?=\S)([\s\S]*?\S)==|\$([^\s$](?:[^$\n]*?[^\s$\\])?)\$(?!\d)/g;

/** Most sentences carry no markup at all, and Hermes charges per regex run. */
const MARKERS = /[*_`~=$]/;

const STYLES = ['bold', 'italic', 'code', 'strike', 'mark', 'math'] as const;

export function runsIn(text: string): Run[] {
  if (!MARKERS.test(text)) return [{ text, from: 0 }];
  const runs: Run[] = [];
  let cursor = 0;
  for (const match of text.matchAll(INLINE)) {
    const at = match.index ?? 0;
    if (at > cursor) runs.push({ text: text.slice(cursor, at), from: cursor });
    const group = [2, 4, 5, 6, 7, 8].findIndex((index) => match[index] !== undefined);
    const inner = match[[2, 4, 5, 6, 7, 8][group]];
    runs.push({ text: inner, from: at + match[0].indexOf(inner), [STYLES[group]]: true });
    cursor = at + match[0].length;
  }
  if (cursor < text.length) runs.push({ text: text.slice(cursor), from: cursor });
  return runs.length ? runs : [{ text, from: 0 }];
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
  | { kind: 'table'; rows: string[][]; head: boolean; align: Align[] };

const FENCED = /^```([^\n]*)\n([\s\S]*?)\n?```$/;
const DISPLAY_MATH = /^\$\$([\s\S]+?)\$\$$/;
const TABLE_LINE = /^\|.*\|$/;
const TABLE_RULE = /^\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?$/;

/** A blank line inside code is stored as one space, so the paragraph holds together. */
const unblank = (body: string) => body.replace(/^ $/gm, '');

function cellsOf(line: string): string[] {
  return line
    .slice(1, -1)
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim().replace(/\\\|/g, '|'));
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
      const head = TABLE_RULE.test(lines[1]);
      const align: Align[] = head
        ? cellsOf(lines[1]).map((cell) =>
            cell.startsWith(':') && cell.endsWith(':') ? 'center' : cell.endsWith(':') ? 'right' : 'left')
        : [];
      const rows = lines.filter((_, at) => !(head && at === 1)).map(cellsOf);
      return { kind: 'table', rows, head, align };
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
