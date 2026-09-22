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
};

const INLINE =
  /(\*\*|__)(?=\S)([\s\S]*?\S)\1|(\*|_)(?=\S)([\s\S]*?\S)\3|`([^`\n]+)`|~~(?=\S)([\s\S]*?\S)~~|==(?=\S)([\s\S]*?\S)==/g;

/** Most sentences carry no markup at all, and Hermes charges per regex run. */
const MARKERS = /[*_`~=]/;

export function runsIn(text: string): Run[] {
  if (!MARKERS.test(text)) return [{ text }];
  const runs: Run[] = [];
  let cursor = 0;
  for (const match of text.matchAll(INLINE)) {
    const at = match.index ?? 0;
    if (at > cursor) runs.push({ text: text.slice(cursor, at) });
    if (match[2] !== undefined) runs.push({ text: match[2], bold: true });
    else if (match[4] !== undefined) runs.push({ text: match[4], italic: true });
    else if (match[5] !== undefined) runs.push({ text: match[5], code: true });
    else if (match[6] !== undefined) runs.push({ text: match[6], strike: true });
    else if (match[7] !== undefined) runs.push({ text: match[7], mark: true });
    cursor = at + match[0].length;
  }
  if (cursor < text.length) runs.push({ text: text.slice(cursor) });
  return runs.length ? runs : [{ text }];
}

/**
 * A fenced block is not prose: it is set monospaced, unwrapped and unsegmented,
 * because a line break inside code is part of the code and a sentence is not a
 * unit anything in there is divided into.
 */
export function codeBlockIn(paragraph: string): string | null {
  const fenced = /^```[^\n]*\n([\s\S]*?)\n?```$/.exec(paragraph.trim());
  if (fenced) return fenced[1];
  // Four spaces is the other way Markdown says the same thing.
  const lines = paragraph.replace(/\s+$/, '').split('\n');
  if (lines.length > 1 && lines.every((line) => !line.trim() || /^ {4}|\t/.test(line))) {
    return lines.map((line) => line.replace(/^ {4}|\t/, '')).join('\n');
  }
  return null;
}
