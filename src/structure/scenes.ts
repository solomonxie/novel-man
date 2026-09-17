import type { NormalizedDocument } from '../import/normalize';

export type DetectedScene = { start: number; end: number };

/**
 * Two kinds of separator, because they need different evidence. An ornament
 * means nothing else, so one is enough — a lone `※` is a scene break in most
 * Chinese typesetting. A dash or an asterisk has other jobs, so it has to
 * repeat before it counts.
 */
const ORNAMENT = /^[※◇◆○●☆★✽❉❖＊❋⁂]+$/;
const REPEATED = /^[*·•\-–—_=~#.]+$/;
const MIN_REPEATS = 3;
const MAX_SEPARATOR_LENGTH = 24;

/**
 * Scenes are breaks *inside* a chapter. A manuscript marks them with a glyph
 * run; a normalized document has already collapsed blank-line runs, so the
 * glyph is the only signal left.
 *
 * A chapter with no marks has **no** scenes, not one. Calling the whole
 * chapter a scene made the count equal the chapter count and told nobody
 * anything — empty is the honest answer, and it leaves room for a scene you
 * mark yourself.
 */
export function detectScenes(doc: NormalizedDocument, range: { start: number; end: number }): DetectedScene[] {
  const breaks: { start: number; end: number }[] = [];
  for (const block of doc.blocks) {
    if (block.start < range.start || block.end > range.end) continue;
    const line = doc.text.slice(block.start, block.end).trim();
    if (!isSeparator(line)) continue;
    breaks.push({ start: block.start, end: block.end });
  }
  if (!breaks.length) return [];

  const scenes: DetectedScene[] = [];
  let cursor = range.start;
  for (const mark of breaks) {
    if (mark.start > cursor) scenes.push({ start: cursor, end: mark.start });
    cursor = nextContent(doc.text, mark.end, range.end);
  }
  if (cursor < range.end) scenes.push({ start: cursor, end: range.end });
  return scenes;
}

/** Breaks are what a person edits; ranges are what the rest of the app reads. */
export function scenesFromBreaks(
  range: { start: number; end: number },
  breaks: number[]
): DetectedScene[] {
  const inside = [...new Set(breaks)]
    .filter((offset) => offset > range.start && offset < range.end)
    .sort((a, b) => a - b);
  if (!inside.length) return [];
  const scenes: DetectedScene[] = [];
  let cursor = range.start;
  for (const offset of inside) {
    scenes.push({ start: cursor, end: offset });
    cursor = offset;
  }
  scenes.push({ start: cursor, end: range.end });
  return scenes;
}

export function breaksOf(scenes: { start: number; end: number }[], start: number): number[] {
  return scenes.map((scene) => scene.start).filter((offset) => offset > start);
}

function isSeparator(line: string): boolean {
  const bare = line.replace(/\s/g, '');
  if (!bare || bare.length > MAX_SEPARATOR_LENGTH) return false;
  if (ORNAMENT.test(bare)) return true;
  return REPEATED.test(bare) && bare.length >= MIN_REPEATS;
}

/** A scene starts at its first word, not at the blank line before it. */
function nextContent(text: string, from: number, end: number): number {
  let at = from;
  while (at < end && /\s/.test(text[at])) at += 1;
  return at;
}
