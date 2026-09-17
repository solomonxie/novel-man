import type { NormalizedDocument } from '../import/normalize';
import { parseJson, runUnits, type UnitResult } from '../ai/run';
import { estimate, type Estimate } from '../ai/cost';
import type { DetectedChapter } from './detect';
import { MAX_HEADING_LENGTH } from './patterns';

/** Candidates per request: enough context to see a pattern, small enough to be cheap. */
const BATCH = 120;
const MAX_CANDIDATES = 1200;

export type Candidate = { index: number; start: number; end: number; line: string };

/**
 * Only lines that could be a heading are ever sent — never the manuscript. A
 * table of contents is what the model needs to see, and it is also all a user
 * would want leaving the device.
 */
export function candidates(doc: NormalizedDocument): Candidate[] {
  const found: Candidate[] = [];
  for (const block of doc.blocks) {
    const line = doc.text.slice(block.start, block.end).trim();
    if (!line || line.length > MAX_HEADING_LENGTH) continue;
    found.push({ index: found.length, start: block.start, end: block.end, line });
    if (found.length >= MAX_CANDIDATES) break;
  }
  return found;
}

export function estimateDetection(doc: NormalizedDocument, language: string): Promise<Estimate | null> {
  const batches = chunk(candidates(doc));
  return estimate({
    units: batches.map(render),
    language,
    // The answer is a list of numbers: tiny next to what it reads.
    outputRatio: 0.05,
    overheadTokens: 160,
  });
}

export type AssistedDetection = {
  chapters: DetectedChapter[];
  failed: number;
  fromCache: number;
};

export async function detectChaptersWithAi(
  doc: NormalizedDocument,
  hooks: { onProgress?: (done: number, total: number) => void; signal?: AbortSignal } = {}
): Promise<AssistedDetection> {
  const all = candidates(doc);
  const batches = chunk(all);

  const results = await runUnits<Candidate[], number[]>(
    {
      kind: 'chapter-detect',
      units: batches.map((batch, index) => ({ id: `b${index}`, input: batch })),
      prompt: (batch) => [
        {
          role: 'system',
          content:
            'You identify chapter headings in a novel. You are given numbered short lines ' +
            'taken from the manuscript, in order. Reply with only a JSON array of the ' +
            'numbers that are chapter headings — no prose, no other keys. A heading names ' +
            'or numbers a chapter (for example "Chapter 4", "第十二章", "Prologue", "楔子"). ' +
            'Dialogue, section breaks and short paragraphs are not headings. ' +
            'If none are headings, reply [].',
        },
        { role: 'user', content: render(batch) },
      ],
      parse: (answer) => parseJson<number[]>(answer).filter((value) => Number.isInteger(value)),
      maxTokens: 600,
      onProgress: hooks.onProgress,
    },
    hooks.signal
  );

  const chosen = new Set<number>();
  for (const result of results) for (const index of result.value ?? []) chosen.add(index);

  return {
    chapters: close(doc, all.filter((candidate) => chosen.has(candidate.index))),
    failed: results.filter((result) => result.error !== undefined).length,
    fromCache: results.filter((result: UnitResult<number[]>) => result.cached).length,
  };
}

function chunk(all: Candidate[]): Candidate[][] {
  const batches: Candidate[][] = [];
  for (let from = 0; from < all.length; from += BATCH) batches.push(all.slice(from, from + BATCH));
  return batches;
}

function render(batch: Candidate[]): string {
  return batch.map((candidate) => `${candidate.index}: ${candidate.line}`).join('\n');
}

/** Same closing rule as the heuristic path, so both produce the same shape. */
function close(doc: NormalizedDocument, starts: Candidate[]): DetectedChapter[] {
  if (!starts.length) return [];
  const chapters: DetectedChapter[] = [];
  if (starts[0].start > 200) {
    chapters.push({ title: '', start: 0, end: starts[0].start, confident: false });
  }
  starts.forEach((start, index) => {
    const end = index + 1 < starts.length ? starts[index + 1].start : doc.text.length;
    if (end <= start.start) return;
    chapters.push({ title: start.line, start: start.start, end, confident: true });
  });
  return chapters;
}

/** A scene can only start where a paragraph does. */
export type Paragraph = { index: number; offset: number; preview: string };

const SCENE_PARAGRAPH_CAP = 120;
const SCENE_PREVIEW = 90;

export function paragraphsOf(text: string, chapter: { start: number; end: number }): Paragraph[] {
  const found: Paragraph[] = [];
  let cursor = chapter.start;
  for (const chunk of text.slice(chapter.start, chapter.end).split('\n\n')) {
    const offset = cursor;
    cursor += chunk.length + 2;
    if (!chunk.trim()) continue;
    found.push({ index: found.length, offset, preview: chunk.trim().slice(0, SCENE_PREVIEW) });
    if (found.length >= SCENE_PARAGRAPH_CAP) break;
  }
  return found;
}

function renderScenes(paragraphs: Paragraph[]): string {
  return paragraphs.map((paragraph) => `${paragraph.index}: ${paragraph.preview}`).join('\n');
}

export function estimateScenes(
  text: string,
  chapters: { start: number; end: number }[],
  language: string
): Promise<Estimate | null> {
  return estimate({
    units: chapters.map((chapter) => renderScenes(paragraphsOf(text, chapter))),
    language,
    outputRatio: 0.05,
    overheadTokens: 180,
  });
}

export type SceneSuggestion = { chapterIndex: number; breaks: number[] };

/**
 * Openings only — never the prose. The model sees the first line of each
 * paragraph and answers where the time, place or point of view changes, which
 * is what a scene break is and all it needs to see to find one.
 */
export async function suggestScenes(
  text: string,
  chapters: { idx: number; start: number; end: number }[],
  hooks: { onProgress?: (done: number, total: number) => void; signal?: AbortSignal } = {}
): Promise<{ suggestions: SceneSuggestion[]; failed: number }> {
  const units = chapters.map((chapter) => ({
    chapter,
    paragraphs: paragraphsOf(text, chapter),
  }));

  const results = await runUnits<(typeof units)[number], number[]>(
    {
      kind: 'scene-detect',
      units: units.map((unit) => ({ id: String(unit.chapter.idx), input: unit })),
      prompt: (unit) => [
        {
          role: 'system',
          content:
            'You find scene breaks in a chapter of a novel. You are given the numbered ' +
            'openings of its paragraphs, in order. Reply with only a JSON array of the ' +
            'numbers where a new scene begins — a change of time, place or viewpoint. ' +
            'Never include 0: a chapter does not begin with a break. Most chapters have ' +
            'none or one or two. If there are none, reply [].',
        },
        { role: 'user', content: renderScenes(unit.paragraphs) },
      ],
      parse: (answer) => parseJson<number[]>(answer).filter((value) => Number.isInteger(value)),
      maxTokens: 300,
      onProgress: hooks.onProgress,
    },
    hooks.signal
  );

  const suggestions: SceneSuggestion[] = [];
  results.forEach((result, at) => {
    const { chapter, paragraphs } = units[at];
    const breaks = (result.value ?? [])
      .map((index) => paragraphs[index]?.offset)
      .filter((offset): offset is number => offset !== undefined && offset > chapter.start);
    if (breaks.length) suggestions.push({ chapterIndex: chapter.idx, breaks });
  });

  return { suggestions, failed: results.filter((result) => result.error !== undefined).length };
}
