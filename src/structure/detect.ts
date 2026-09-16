import type { NormalizedDocument, PlacedBlock } from '../import/normalize';
import { chapterPatterns, MAX_HEADING_LENGTH } from './patterns';

export type DetectedChapter = { title: string; start: number; end: number; confident: boolean };
export type Detection = { chapters: DetectedChapter[]; method: 'headings' | 'patterns' | 'spine' | 'none' };

const MIN_PATTERN_HITS = 3;

/**
 * Structure the format already carries beats anything we can infer, and both
 * beat asking an AI — which is why detection runs in this order.
 */
export function detectChapters(doc: NormalizedDocument, language: string): Detection {
  const byHeading = fromHeadings(doc);
  if (byHeading.length >= 2) return { chapters: close(doc, byHeading, true), method: 'headings' };

  const byPattern = fromPatterns(doc, language);
  if (byPattern.length >= MIN_PATTERN_HITS) {
    return { chapters: close(doc, byPattern, true), method: 'patterns' };
  }

  const bySpine = doc.blocks.filter((block) => block.boundary);
  if (bySpine.length >= 2) {
    const starts = bySpine.map((block) => ({ block, title: titleOf(doc, block) }));
    return { chapters: close(doc, starts, true), method: 'spine' };
  }

  if (!doc.text) return { chapters: [], method: 'none' };
  return {
    chapters: [{ title: '', start: 0, end: doc.text.length, confident: false }],
    method: 'none',
  };
}

type Start = { block: PlacedBlock; title: string };

function fromHeadings(doc: NormalizedDocument): Start[] {
  const levels = doc.blocks.filter((block) => block.heading).map((block) => block.heading!);
  if (!levels.length) return [];
  // The shallowest level present is the chapter level; deeper ones are sections.
  const chapterLevel = Math.min(...levels);
  return doc.blocks
    .filter((block) => block.heading === chapterLevel)
    .map((block) => ({ block, title: titleOf(doc, block) }));
}

function fromPatterns(doc: NormalizedDocument, language: string): Start[] {
  const patterns = chapterPatterns
    .filter((entry) => entry.language === language || entry.language === 'any')
    .map((entry) => entry.pattern);
  const starts: Start[] = [];
  for (const block of doc.blocks) {
    const title = titleOf(doc, block);
    if (title.length > MAX_HEADING_LENGTH) continue;
    if (patterns.some((pattern) => pattern.test(title))) starts.push({ block, title });
  }
  return starts;
}

function titleOf(doc: NormalizedDocument, block: PlacedBlock): string {
  return doc.text.slice(block.start, block.end).trim();
}

/** Each chapter runs to the next one's start; leading text becomes its own chapter. */
function close(doc: NormalizedDocument, starts: Start[], confident: boolean): DetectedChapter[] {
  const chapters: DetectedChapter[] = [];
  const first = starts[0].block.start;
  if (first > 200) {
    chapters.push({ title: '', start: 0, end: first, confident: false });
  }
  starts.forEach((start, index) => {
    const end = index + 1 < starts.length ? starts[index + 1].block.start : doc.text.length;
    if (end <= start.block.start) return;
    chapters.push({ title: start.title, start: start.block.start, end, confident });
  });
  return chapters;
}
