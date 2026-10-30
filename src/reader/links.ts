import type { StructureHint } from '../structure/document';
import { runsIn } from './rich';

export type Link = { from: number; to: number; href: string };

/** Sorted by where they start, which is the order the page meets them. */
export function linksOf(hints: StructureHint[]): Link[] {
  return hints
    .filter((hint) => hint.href)
    .map((hint) => ({ from: hint.start, to: hint.end, href: hint.href! }))
    .sort((a, b) => a.from - b.from);
}

export function anchorsOf(hints: StructureHint[]): Map<string, number> {
  const anchors = new Map<string, number>();
  for (const hint of hints) if (hint.anchor && !anchors.has(hint.anchor)) anchors.set(hint.anchor, hint.start);
  return anchors;
}

/** The links that touch a range, found by bisection: a long book has thousands. */
export function linksWithin(links: Link[], from: number, to: number): Link[] {
  let low = 0;
  let high = links.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (links[middle].to <= from) low = middle + 1;
    else high = middle;
  }
  const found: Link[] = [];
  for (let at = low; at < links.length && links[at].from < to; at++) {
    if (links[at].to > from) found.push(links[at]);
  }
  return found;
}

export type Destination = { kind: 'inside'; at: number } | { kind: 'web'; url: string } | null;

export function destinationOf(href: string, anchors: Map<string, number>): Destination {
  if (href.startsWith('#')) {
    const at = anchorAt(href.slice(1), anchors);
    return at === undefined ? null : { kind: 'inside', at };
  }
  return /^(https?:|mailto:)/i.test(href) ? { kind: 'web', url: href } : null;
}

/** As written first; then as a browser would forgive it: escaped, or in another case. */
function anchorAt(id: string, anchors: Map<string, number>): number | undefined {
  const exact = anchors.get(id);
  if (exact !== undefined) return exact;
  let decoded = id;
  try {
    decoded = decodeURIComponent(id);
  } catch {}
  const wanted = decoded.toLowerCase();
  for (const [anchor, at] of anchors) if (anchor.toLowerCase() === wanted) return at;
  return undefined;
}

export type Section = { level: number; title: string; start: number; chapter: number };

/**
 * Every heading in the book, chapters and the sections inside them, with the
 * chapter each falls in. Levels count from the book's shallowest, so a book
 * whose chapters are `##` still starts at one.
 */
export function outlineOf(text: string, hints: StructureHint[], chapters: { start: number; end: number }[]): Section[] {
  const headings = hints.filter((hint) => hint.heading !== undefined).sort((a, b) => a.start - b.start);
  if (!headings.length) return [];
  const top = Math.min(...headings.map((hint) => hint.heading!));
  const sections: Section[] = [];
  let chapter = 0;
  for (const hint of headings) {
    while (chapter < chapters.length - 1 && hint.start >= chapters[chapter].end) chapter++;
    const title = runsIn(text.slice(hint.start, hint.end).trim()).map((run) => run.text).join('');
    if (title) sections.push({ level: hint.heading! - top + 1, title, start: hint.start, chapter });
  }
  return sections;
}
