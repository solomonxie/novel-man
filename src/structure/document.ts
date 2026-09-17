import type { NormalizedDocument, PlacedBlock } from '../import/normalize';

/** Only blocks carrying structure are worth storing; the rest are recoverable. */
export type StructureHint = { start: number; end: number; heading?: number; boundary?: boolean };

export function hintsOf(doc: NormalizedDocument): StructureHint[] {
  return doc.blocks
    .filter((block) => block.heading !== undefined || block.boundary)
    .map(({ start, end, heading, boundary }) => ({ start, end, heading, boundary }));
}

export function parseHints(raw: string): StructureHint[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Rebuilds the document detection ran on. `normalize` joins blocks with
 * exactly one blank line, so paragraph bounds come back out of the text and
 * only the hints have to be stored.
 */
export function reconstruct(text: string, hints: StructureHint[]): NormalizedDocument {
  const byStart = new Map(hints.map((hint) => [hint.start, hint]));
  const blocks: PlacedBlock[] = [];
  let cursor = 0;
  for (const chunk of text.split('\n\n')) {
    const start = cursor;
    cursor += chunk.length + 2;
    if (!chunk.trim()) continue;
    const hint = byStart.get(start);
    blocks.push({ start, end: start + chunk.length, heading: hint?.heading, boundary: hint?.boundary });
  }
  return { text, blocks };
}
