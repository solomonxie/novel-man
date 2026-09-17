import type { Chapter, Entity, Mention } from '../db/repo';

/**
 * Counted on the device, not asked for. A name is a literal string and the
 * text is already here — paying a model to count occurrences would be slower,
 * more expensive and less exact than `indexOf`.
 */
export function countMentions(text: string, chapters: Chapter[], entities: Entity[]): Mention[] {
  const mentions: Mention[] = [];
  const needlesByEntity = entities.map((entity) => ({
    id: entity.id,
    needles: namesOf(entity),
  }));

  for (const chapter of chapters) {
    const body = text.slice(chapter.start, chapter.end);
    for (const { id, needles } of needlesByEntity) {
      let count = 0;
      for (const needle of needles) count += occurrences(body, needle);
      if (count > 0) mentions.push({ entity_id: id, chapter_idx: chapter.idx, count });
    }
  }
  return mentions;
}

export function namesOf(entity: Entity): string[] {
  return [entity.name, ...(entity.alias ?? '').split(/[,，、]/)]
    .map((value) => value.trim())
    .filter((value) => value.length > 1);
}

function occurrences(haystack: string, needle: string): number {
  let count = 0;
  let from = 0;
  while (true) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) return count;
    count += 1;
    from = at + needle.length;
  }
}

export type Timeline = { chapter_idx: number; count: number }[];

export function timelineFor(mentions: Mention[], entityId: string): Timeline {
  return mentions
    .filter((mention) => mention.entity_id === entityId)
    .map(({ chapter_idx, count }) => ({ chapter_idx, count }));
}

/**
 * The cast list reads as "who is this book about", so the people it is about
 * come first. Alphabetical put a walk-on above the protagonist; sort_index was
 * never set by anything. Ties keep the stable order underneath.
 */
export function byFrequency<T extends { id: string }>(entities: T[], mentions: Mention[]): T[] {
  const totals = new Map<string, number>();
  for (const mention of mentions) {
    totals.set(mention.entity_id, (totals.get(mention.entity_id) ?? 0) + mention.count);
  }
  return [...entities].sort((a, b) => (totals.get(b.id) ?? 0) - (totals.get(a.id) ?? 0));
}

export function appearances(timeline: Timeline): { first: number; last: number } | null {
  if (!timeline.length) return null;
  return {
    first: timeline[0].chapter_idx,
    last: timeline[timeline.length - 1].chapter_idx,
  };
}
