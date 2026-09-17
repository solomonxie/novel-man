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
 * The first chapter has no previous one, so it joins the chapter *below* and
 * that chapter keeps its own title. Front matter detected as a chapter is
 * exactly the row people want gone, and it is always the first one.
 */
export function deleteChapter(drafts: ChapterDraft[], index: number): ChapterDraft[] {
  if (index > 0) return mergeWithNext(drafts, index - 1);
  const next = drafts[1];
  if (!next) return drafts;
  const merged = { ...next, start: drafts[0].start, userEdited: true, confident: true };
  return [merged, ...drafts.slice(2)];
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

/** Paragraph starts inside a chapter — the only places a split reads cleanly. */
export function splitPoints(text: string, chapter: { start: number; end: number }) {
  const points: { offset: number; preview: string }[] = [];
  let cursor = chapter.start;
  for (const chunk of text.slice(chapter.start, chapter.end).split('\n\n')) {
    const offset = cursor;
    cursor += chunk.length + 2;
    if (offset === chapter.start || !chunk.trim()) continue;
    points.push({ offset, preview: chunk.trim().slice(0, 80) });
  }
  return points;
}
