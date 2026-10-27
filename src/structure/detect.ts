import type { NormalizedDocument, PlacedBlock } from '../import/normalize';
import { chapterPatterns, MAX_HEADING_LENGTH } from './patterns';
import { baseLanguage } from '../text/language';

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

/** Fewer headings than this at the top level are acts or parts, not chapters. */
const MAX_PARTS = 3;

function fromHeadings(doc: NormalizedDocument): Start[] {
  const headed = doc.blocks.filter((block) => block.heading);
  if (!headed.length) return [];
  const count = new Map<number, number>();
  for (const block of headed) count.set(block.heading!, (count.get(block.heading!) ?? 0) + 1);
  const levels = [...count.keys()].sort((a, b) => a - b);
  // The shallowest level is the chapter level, unless it is a few acts with
  // the chapters under them: 序幕 and 第一幕 over nine chapters.
  let depth = 0;
  while (
    depth + 1 < levels.length &&
    count.get(levels[depth])! <= MAX_PARTS &&
    count.get(levels[depth + 1])! > count.get(levels[depth])!
  ) {
    depth++;
  }
  const chapterLevel = levels[depth];
  // An act heading with a chapter straight under it is a label, not a chapter:
  // the chapter starts there, so the label is not left at the end of the last.
  const starts: Start[] = [];
  let label: PlacedBlock | undefined;
  headed.forEach((block, index) => {
    if (block.heading! > chapterLevel) return;
    const next = headed[index + 1];
    const isLabel = block.heading! < chapterLevel && next && next.heading! > block.heading! && !hasBody(doc, block, next);
    if (isLabel) {
      label ??= block;
      return;
    }
    const title = withoutCaption(titleOf(doc, block));
    starts.push({ block: label ? { ...block, start: label.start } : block, title });
    label = undefined;
  });
  return starts;
}

function hasBody(doc: NormalizedDocument, block: PlacedBlock, next: PlacedBlock): boolean {
  return doc.text.slice(block.end, next.start).trim().length > 0;
}

/** An illustrated edition puts the plate's caption in the heading: "He rode a black horse. CHAPTER III." */
const TRAILING_LABEL = /[.!?”"’]\s+((?:chapter|book|part)\s+(?:[0-9]+|[ivxlcdm]+)\.?)$/i;

export function withoutCaption(title: string): string {
  return TRAILING_LABEL.exec(title)?.[1] ?? title;
}

function fromPatterns(doc: NormalizedDocument, language: string): Start[] {
  // By base language: the patterns are written for Chinese, and the book is
  // marked zh-Hans or zh-Hant.
  const base = baseLanguage(language);
  const patterns = chapterPatterns
    .filter((entry) => entry.language === base || entry.language === 'any')
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
