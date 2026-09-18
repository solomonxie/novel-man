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
 * The reference, then the passage with every verse numbered — clipped to what
 * was selected, so half a verse quotes as half a verse under its own number.
 */
export function quoteWithVerses(
  text: string,
  span: Span,
  verses: Verse[],
  chapterTitle: string
): string | null {
  const touched = versesIn(verses, span);
  if (!touched.length) return null;
  const body = touched
    .map((verse) => {
      const from = Math.max(verse.start, span.start);
      const to = Math.min(verse.end, span.end);
      return `[${verse.number}] ${text.slice(from, to).trim()}`;
    })
    .filter((line) => line.length > `[] `.length)
    .join(' ');
  return `${referenceOf(chapterTitle, touched)}. ${body}`;
}
