import type { Span } from '../text/segment';

/** Just the shape, so citing a passage never has to reach for the database. */
export type Verse = { number: number; start: number; end: number };

/**
 * A quoted bible is cited, not just pasted: the reference says where it came
 * from, and the numbers say which verse each sentence is. "Hebrews 3" is
 * already the chapter's title, so the reference is that plus the verses the
 * selection actually touched.
 */
export function versesIn(verses: Verse[], span: Span): Verse[] {
  return verses.filter((verse) => verse.end > span.start && verse.start < span.end);
}

export function referenceOf(chapterTitle: string, touched: Verse[]): string {
  const title = chapterTitle.trim();
  if (!touched.length) return title;
  const first = touched[0].number;
  const last = touched[touched.length - 1].number;
  return `${title}:${first === last ? first : `${first}-${last}`}`;
}

/**
 * The reference first, then the words. One verse runs on after it on the same
 * line; several put each verse on its own line under its number, clipped to
 * what was selected.
 */
export function quoteWithVerses(
  text: string,
  span: Span,
  verses: Verse[],
  chapterTitle: string,
  edition?: string
): string | null {
  const touched = versesIn(verses, span);
  if (!touched.length) return null;
  const clip = (verse: Verse) =>
    text.slice(Math.max(verse.start, span.start), Math.min(verse.end, span.end)).trim();
  const head = `${referenceOf(chapterTitle, touched)}${edition ? ` (${edition})` : ''}`;
  if (touched.length === 1) return `${head} ${clip(touched[0])}`;
  const lines = touched
    .map((verse) => ({ number: verse.number, words: clip(verse) }))
    .filter((line) => line.words)
    .map((line) => `[${line.number}] ${line.words}`);
  return [head, ...lines].join('\n');
}

/** Any other book: where it is from, then the words. */
export function quotePlain(text: string, bookTitle: string, chapterTitle?: string | null): string {
  const where = [bookTitle.trim(), chapterTitle?.trim()].filter(Boolean).join(' ');
  return where ? `${where}: ${text.trim()}` : text.trim();
}

/**
 * A fetched chapter carries its numbers inline as "[2] ". Reading them back
 * gives the same verse list a stored bible has, with each verse's text
 * starting after its own marker.
 */
export function versesFromMarkers(text: string): Verse[] {
  const marks = [...text.matchAll(/\[(\d+)\]\s*/g)];
  return marks.map((mark, at) => ({
    number: Number(mark[1]),
    start: mark.index! + mark[0].length,
    end: marks[at + 1]?.index ?? text.length,
  }));
}
