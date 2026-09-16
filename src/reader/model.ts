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

export function annotationAt(annotations: Annotation[], span: Span): Annotation | undefined {
  return annotations.find((entry) => entry.start === span.start && entry.end === span.end);
}

export function progressWithin(chapter: Chapter, offset: number): number {
  const length = Math.max(1, chapter.end - chapter.start);
  return Math.min(1, Math.max(0, (offset - chapter.start) / length));
}
