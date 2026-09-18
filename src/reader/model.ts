import type { Annotation, Chapter } from '../db/repo';
import { segmentSentences, type Span } from '../text/segment';

export type Paragraph = { start: number; sentences: Span[] };

/** Paragraphs keep the manuscript's shape; sentences inside them are the tap targets. */
export function layoutChapter(text: string, chapter: Chapter, language: string): Paragraph[] {
  const body = text.slice(chapter.start, chapter.end);
  const paragraphs: Paragraph[] = [];
  let cursor = 0;
  for (const chunk of body.split('\n\n')) {
    const start = chapter.start + cursor;
    cursor += chunk.length + 2;
    if (!chunk.trim()) continue;
    paragraphs.push({ start, sentences: segmentSentences(chunk, language, start) });
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

export function progressWithin(chapter: Chapter, offset: number): number {
  const length = Math.max(1, chapter.end - chapter.start);
  return Math.min(1, Math.max(0, (offset - chapter.start) / length));
}
