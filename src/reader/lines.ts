import type { Span } from '../text/segment';

/** One rendered line of a paragraph, as the text engine laid it out. */
export type Line = { y: number; height: number; length: number };

/**
 * Which sentence a tap belongs to when the tap missed the words. Most of a
 * page is not glyphs: the ragged right edge, the space after a full stop, the
 * gap under a short last line. Tapping there did nothing, which reads as the
 * mode being broken rather than as the tap being a near miss.
 *
 * The line is found by where it sits, and the sentence by where the middle of
 * that line falls — the middle rather than the start, because a line that
 * begins with the tail of the previous sentence is still, to a reader, the
 * line the next one is on.
 */
export function sentenceAtLine(
  lines: Line[],
  spans: Span[],
  paragraphStart: number,
  y: number
): Span | null {
  if (!spans.length) return null;
  if (!lines.length) return spans[spans.length - 1];

  let index = lines.findIndex((line) => y >= line.y && y < line.y + line.height);
  // Below the last line — the gap under a short paragraph — is that paragraph.
  if (index < 0) index = y < lines[0].y ? 0 : lines.length - 1;

  let before = 0;
  for (let at = 0; at < index; at++) before += lines[at].length;
  const offset = paragraphStart + before + Math.floor(lines[index].length / 2);

  return (
    spans.find((span) => offset >= span.start && offset < span.end) ??
    // Between two sentences: the one this offset has already passed into.
    [...spans].reverse().find((span) => span.start <= offset) ??
    spans[0]
  );
}
