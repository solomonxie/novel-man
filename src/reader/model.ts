import type { Annotation, Chapter } from '../db/repo';
import { segmentSentences, type Span } from '../text/segment';

/** `marker`: a list item's bullet or number, drawn hanging outside its words. */
export type Paragraph = { start: number; sentences: Span[]; marker?: string; depth?: number };

const LIST_MARK = /^(•|◦|\d{1,3}[.)])[ \t]+/;

/** Paragraphs keep the manuscript's shape; sentences inside them are the tap targets. */
export function layoutChapter(text: string, chapter: Chapter, language: string): Paragraph[] {
  const body = text.slice(chapter.start, chapter.end);
  const paragraphs: Paragraph[] = [];
  let cursor = 0;
  for (const chunk of body.split('\n\n')) {
    const start = chapter.start + cursor;
    cursor += chunk.length + 2;
    if (!chunk.trim()) continue;
    const list = LIST_MARK.exec(chunk);
    if (list && chunk.length > list[0].length) {
      const from = start + list[0].length;
      const marker = list[1] === '◦' ? '•' : list[1];
      const depth = list[1] === '◦' ? 1 : 0;
      paragraphs.push({ start, sentences: segmentSentences(chunk.slice(list[0].length), language, from), marker, depth });
    } else paragraphs.push({ start, sentences: segmentSentences(chunk, language, start) });
  }
  return paragraphs;
}

/**
 * A highlight is made over a passage, but the page is drawn a sentence at a
 * time — so a mark that covered three sentences used to match none of them and
 * showed up nowhere. Exact first, since that is the mark this range made; then
 * whatever else is drawn across it.
 */
export function annotationAt(annotations: Annotation[], span: Span): Annotation | undefined {
  return (
    annotations.find((entry) => entry.start === span.start && entry.end === span.end) ??
    annotations.find((entry) => entry.end > span.start && entry.start < span.end)
  );
}

/** The mark this exact range made — the one a note or a colour on it belongs to. */
export function annotationExact(annotations: Annotation[], span: Span): Annotation | undefined {
  return annotations.find((entry) => entry.start === span.start && entry.end === span.end);
}

/** Of the marks over one offset, the narrowest: a phrase marked inside a marked sentence wins. */
export function markAt(annotations: Annotation[], at: number): Annotation | undefined {
  return annotations
    .filter((entry) => entry.start <= at && at < entry.end)
    .sort((a, b) => a.end - a.start - (b.end - b.start))[0];
}

export type MarkedPiece = Span & { mark?: Annotation };

/**
 * A sentence cut where marks begin and end, so a highlight is drawn over the
 * words it covers rather than the whole sentence it falls in. Each piece wears
 * the narrowest mark over it; a sentence no mark touches is one piece.
 */
export function markedPieces(span: Span, annotations: Annotation[]): MarkedPiece[] {
  const touching = annotations.filter((entry) => entry.color && entry.end > span.start && entry.start < span.end);
  const cuts = new Set([span.start, span.end]);
  for (const entry of touching) {
    if (entry.start > span.start) cuts.add(entry.start);
    if (entry.end < span.end) cuts.add(entry.end);
  }
  const at = [...cuts].sort((a, b) => a - b);
  return at.slice(0, -1).map((start, index) => ({
    start,
    end: at[index + 1],
    mark: markAt(touching, start),
  }));
}

export function progressWithin(chapter: Chapter, offset: number): number {
  const length = Math.max(1, chapter.end - chapter.start);
  return Math.min(1, Math.max(0, (offset - chapter.start) / length));
}
