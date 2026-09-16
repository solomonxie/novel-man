import { scriptOf, type Script } from './language';

export type Span = { start: number; end: number };

const TERMINATORS: Record<Script, RegExp> = {
  latin: /[.!?]["'”’)\]]*(\s|$)/g,
  cjk: /[。！？…]+["'」』）】]*/g,
};

/** Abbreviations that would otherwise end a sentence mid-clause. */
const ABBREVIATIONS = /\b(mr|mrs|ms|dr|prof|st|jr|sr|vs|etc|e\.g|i\.e)\.$/i;

/**
 * Sentence spans as absolute offsets into `text`, so an annotation made here
 * still points at the same words after chapters are re-detected.
 */
export function segmentSentences(text: string, language: string, base = 0): Span[] {
  const script = scriptOf(language);
  const pattern = new RegExp(TERMINATORS[script].source, 'g');
  const spans: Span[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    const end = match.index + match[0].replace(/\s+$/, '').length;
    const candidate = text.slice(cursor, end);
    if (script === 'latin' && ABBREVIATIONS.test(candidate.trimEnd())) continue;
    push(spans, text, cursor, end, base);
    cursor = end;
  }
  push(spans, text, cursor, text.length, base);
  return spans;
}

function push(spans: Span[], text: string, from: number, to: number, base: number) {
  let start = from;
  let end = to;
  while (start < end && /\s/.test(text[start])) start += 1;
  while (end > start && /\s/.test(text[end - 1])) end -= 1;
  if (start >= end) return;
  spans.push({ start: base + start, end: base + end });
}
