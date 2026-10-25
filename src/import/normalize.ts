import type { Block } from './types';

export type PlacedBlock = {
  start: number;
  end: number;
  heading?: number;
  boundary?: boolean;
  /** The page of the original this block begins on, where the source said. */
  page?: number;
  /** Which block of the input this was — empty ones are dropped, so it shifts. */
  source?: number;
};
export type PlacedLink = { start: number; end: number; href: string };
export type PlacedAnchor = { at: number; id: string };
export type NormalizedDocument = {
  text: string;
  blocks: PlacedBlock[];
  links?: PlacedLink[];
  anchors?: PlacedAnchor[];
};

/**
 * How an importer marks a link: open, the words, the address, close — in
 * private-use characters, which no book contains.
 */
export const LINK_OPEN = '\uE001';
export const LINK_TO = '\uE003';
export const LINK_CLOSE = '\uE002';

export function marked(words: string, href: string): string {
  return `${LINK_OPEN}${words}${LINK_TO}${href}${LINK_CLOSE}`;
}

const SENTINELS = /[\uE001\uE002\uE003]/;
const MARKED = /\uE001([^\uE001\uE002\uE003]*)\uE003([^\uE001\uE002\uE003]*)\uE002/g;

/**
 * Code and display maths are set as written: their spaces are indentation, and
 * a blank line inside is kept as one space so the paragraph holds together.
 */
function verbatim(text: string): string {
  return text
    .replace(/\r/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/\t/g, '    ')
    .split('\n')
    .map((line) => line.trimEnd() || ' ')
    .join('\n')
    .replace(/^[ \n]+|[ \n]+$/g, '');
}

const isVerbatim = (text: string) => /^\s*(```|\$\$)/.test(text);

/** The words without the marks, and where each marked stretch ended up. */
function unmark(text: string, base: number, into: PlacedLink[]): string {
  if (!SENTINELS.test(text)) return text;
  let out = '';
  let cursor = 0;
  for (const match of text.matchAll(MARKED)) {
    const at = match.index ?? 0;
    out += text.slice(cursor, at);
    const start = out.length;
    out += match[1];
    const href = match[2].trim();
    if (href && out.length > start) into.push({ start: base + start, end: base + out.length, href });
    cursor = at + match[0].length;
  }
  // Whatever is left unpaired is dropped rather than read.
  return (out + text.slice(cursor)).replace(/[\uE001\uE002\uE003]/g, '');
}

/**
 * One text blob plus block offsets into it. Everything downstream — chapters,
 * annotations, export — addresses ranges here rather than copying text.
 */
export function normalize(blocks: Block[]): NormalizedDocument {
  const placed: PlacedBlock[] = [];
  const links: PlacedLink[] = [];
  const anchors: PlacedAnchor[] = [];
  let text = '';
  blocks.forEach((block, source) => {
    const cleaned = isVerbatim(block.text)
      ? verbatim(block.text)
      : block.text.replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim();
    const base = text ? text.length + 2 : 0;
    const before = links.length;
    const clean = unmark(cleaned, base, links);
    if (!clean.trim()) {
      links.length = before;
      return;
    }
    if (text) text += '\n\n';
    const start = text.length;
    text += clean;
    for (const id of block.anchors ?? []) anchors.push({ at: start, id });
    placed.push({
      start,
      end: text.length,
      heading: block.heading,
      boundary: block.boundary,
      page: block.page,
      source,
    });
  });
  return { text, blocks: placed, links, anchors };
}
