import type { Block } from './types';

export type PlacedBlock = {
  start: number;
  end: number;
  heading?: number;
  boundary?: boolean;
  /** Which block of the input this was — empty ones are dropped, so it shifts. */
  source?: number;
};
export type NormalizedDocument = { text: string; blocks: PlacedBlock[] };

/**
 * One text blob plus block offsets into it. Everything downstream — chapters,
 * annotations, export — addresses ranges here rather than copying text.
 */
export function normalize(blocks: Block[]): NormalizedDocument {
  const placed: PlacedBlock[] = [];
  let text = '';
  blocks.forEach((block, source) => {
    const clean = block.text.replace(/ /g, ' ').replace(/[ \t]+/g, ' ').trim();
    if (!clean) return;
    if (text) text += '\n\n';
    const start = text.length;
    text += clean;
    placed.push({
      start,
      end: text.length,
      heading: block.heading,
      boundary: block.boundary,
      source,
    });
  });
  return { text, blocks: placed };
}
