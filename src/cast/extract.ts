import { estimate, type Estimate } from '../ai/cost';
import type { Chapter } from '../db/repo';

/**
 * A chapter is the unit because it is the unit a reader thinks in, and because
 * a failed one can be retried alone. Long chapters are read from the front:
 * who appears in a chapter is established early, and sending 40,000 characters
 * to learn that costs forty times what it needs to.
 *
 * The run itself lives in the work queue — see `src/work/handlers.ts`. What is
 * left here is the shape of a chapter unit and what it is expected to cost,
 * which is what the sheet needs before anything is queued.
 */
const CHAPTER_BUDGET = 6000;

export function excerptOf(text: string, chapter: Chapter): string {
  return text.slice(chapter.start, Math.min(chapter.end, chapter.start + CHAPTER_BUDGET));
}

export function estimateCast(
  text: string,
  chapters: Chapter[],
  language: string
): Promise<Estimate | null> {
  return estimate({
    units: chapters.map((chapter) => excerptOf(text, chapter)),
    language,
    outputRatio: 0.06,
    overheadTokens: 260,
  });
}
