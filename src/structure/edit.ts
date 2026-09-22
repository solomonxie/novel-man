import { segmentSentences } from '../text/segment';
import type { ChapterDraft } from '../db/repo';

/** Splitting makes the tail a new chapter; the point is a paragraph start. */
export function splitAt(drafts: ChapterDraft[], index: number, offset: number): ChapterDraft[] {
  const target = drafts[index];
  if (!target || offset <= target.start || offset >= target.end) return drafts;
  const head = { ...target, end: offset, userEdited: true, confident: true };
  const tail: ChapterDraft = {
    title: '',
    start: offset,
    end: target.end,
    confident: true,
    userEdited: true,
  };
  return [...drafts.slice(0, index), head, tail, ...drafts.slice(index + 1)];
}

/** Merging keeps the first chapter's title — it's the one the reader saw. */
export function mergeWithNext(drafts: ChapterDraft[], index: number): ChapterDraft[] {
  const target = drafts[index];
  const next = drafts[index + 1];
  if (!target || !next) return drafts;
  const merged = { ...target, end: next.end, userEdited: true, confident: true };
  return [...drafts.slice(0, index), merged, ...drafts.slice(index + 2)];
}

/**
 * Deleting a chapter deletes its *break*, not its words — the text joins a
 * neighbour. A structure editor that could destroy manuscript text would be a
 * different and much more frightening tool.
 *
 * Which neighbour is the caller's to decide, because only a reader knows: the
 * end of a chapter split in two belongs above, and a heading that swallowed
 * the opening of the next chapter belongs below. The ends of the book have no
 * choice to make — the first chapter can only join the one under it, and the
 * last one the chapter over it.
 */
export function deleteChapter(
  drafts: ChapterDraft[],
  index: number,
  into: 'above' | 'below' = 'above'
): ChapterDraft[] {
  const target = drafts[index];
  if (!target || drafts.length < 2) return drafts;
  if (into === 'above' && index > 0) return mergeWithNext(drafts, index - 1);
  const below = drafts[index + 1];
  if (!below) return index > 0 ? mergeWithNext(drafts, index - 1) : drafts;
  // The chapter below keeps its own title: what is being deleted is this row.
  const merged = { ...below, start: target.start, userEdited: true, confident: true };
  return [...drafts.slice(0, index), merged, ...drafts.slice(index + 2)];
}

export function rename(drafts: ChapterDraft[], index: number, title: string): ChapterDraft[] {
  return drafts.map((draft, at) =>
    at === index ? { ...draft, title: title.trim(), userEdited: true, confident: true } : draft
  );
}

/**
 * Reorder moves the row, not the text: offsets keep pointing at the same
 * words, so a highlight made before the move still lands on its sentence.
 */
export function move(drafts: ChapterDraft[], index: number, direction: -1 | 1): ChapterDraft[] {
  const to = index + direction;
  if (index < 0 || to < 0 || to >= drafts.length) return drafts;
  const next = [...drafts];
  [next[index], next[to]] = [next[to], next[index]];
  return next.map((draft) => ({ ...draft, userEdited: true }));
}

/**
 * Every place a chapter could be cut: each sentence, not each paragraph.
 *
 * A chapter rarely breaks where a paragraph does — a scene turns mid-page, and
 * a run-together file puts two chapters in one block of text — so offering
 * only paragraph starts means the cut lands in the wrong place or nowhere. The
 * ones that do begin a paragraph are marked, because that is still where most
 * cuts belong and they should be easy to find in the list.
 */
export function splitPoints(
  text: string,
  chapter: { start: number; end: number },
  language = 'en'
) {
  const points: { offset: number; preview: string; paragraph: boolean }[] = [];
  let cursor = chapter.start;
  for (const chunk of text.slice(chapter.start, chapter.end).split('\n\n')) {
    const paragraph = cursor;
    cursor += chunk.length + 2;
    if (!chunk.trim()) continue;
    for (const span of segmentSentences(chunk, language, paragraph)) {
      if (span.start <= chapter.start) continue;
      const preview = text.slice(span.start, span.end).trim();
      if (!preview) continue;
      points.push({ offset: span.start, preview: preview.slice(0, 120), paragraph: span.start === paragraph });
    }
  }
  return points;
}
