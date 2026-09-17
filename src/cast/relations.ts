import { estimate, type Estimate } from '../ai/cost';
import { parseJson, runUnits } from '../ai/run';
import { listEntities, listMentions, replaceRelations, type Entity, type Mention } from '../db/repo';

/** Only pairs that share a chapter can have a relation worth asking about. */
export type Pair = { a: Entity; b: Entity; first: number; last: number };

const MAX_PAIRS = 120;
const PAIRS_PER_REQUEST = 20;

export function coOccurring(entities: Entity[], mentions: Mention[]): Pair[] {
  const chaptersOf = new Map<string, Set<number>>();
  for (const mention of mentions) {
    if (!chaptersOf.has(mention.entity_id)) chaptersOf.set(mention.entity_id, new Set());
    chaptersOf.get(mention.entity_id)!.add(mention.chapter_idx);
  }

  const pairs: Pair[] = [];
  for (let i = 0; i < entities.length; i++) {
    for (let j = i + 1; j < entities.length; j++) {
      const left = chaptersOf.get(entities[i].id);
      const right = chaptersOf.get(entities[j].id);
      if (!left || !right) continue;
      const shared = [...left].filter((chapter) => right.has(chapter)).sort((a, b) => a - b);
      if (!shared.length) continue;
      pairs.push({
        a: entities[i],
        b: entities[j],
        first: shared[0],
        last: shared[shared.length - 1],
      });
    }
  }
  // The pairs that share the most of the book are the ones worth a request.
  return pairs
    .sort((x, y) => y.last - y.first - (x.last - x.first))
    .slice(0, MAX_PAIRS);
}

export function estimateRelations(pairs: Pair[], language: string): Promise<Estimate | null> {
  return estimate({
    units: batches(pairs).map(render),
    language,
    outputRatio: 0.5,
    overheadTokens: 220,
  });
}

export async function extractRelations(
  bookId: string,
  hooks: { onProgress?: (done: number, total: number) => void; signal?: AbortSignal } = {}
): Promise<{ found: number; failed: number }> {
  const entities = await listEntities(bookId, 'character');
  const mentions = await listMentions(bookId);
  const pairs = coOccurring(entities, mentions);
  if (!pairs.length) return { found: 0, failed: 0 };

  type Answer = { pair: number; label: string }[];
  const groups = batches(pairs);

  const results = await runUnits<Pair[], Answer>(
    {
      kind: 'cast-relations',
      units: groups.map((group, index) => ({ id: `g${index}`, input: group })),
      prompt: (group) => [
        {
          role: 'system',
          content:
            'You label relationships between characters in a novel, using only what their ' +
            'profiles state. Reply with JSON only: [{"pair":<number>,"label":"<two or three words>"}]. ' +
            'Omit a pair entirely rather than guessing at one.',
        },
        { role: 'user', content: render(group) },
      ],
      parse: (answer) => parseJson<Answer>(answer),
      maxTokens: 700,
      onProgress: hooks.onProgress,
    },
    hooks.signal
  );

  const relations: { from_id: string; to_id: string; label: string; first_chapter: number; last_chapter: number }[] = [];
  results.forEach((result, groupIndex) => {
    for (const row of result.value ?? []) {
      const pair = groups[groupIndex][row.pair];
      if (!pair || !row.label?.trim()) continue;
      relations.push({
        from_id: pair.a.id,
        to_id: pair.b.id,
        label: row.label.trim(),
        first_chapter: pair.first,
        last_chapter: pair.last,
      });
    }
  });

  await replaceRelations(bookId, relations);
  return { found: relations.length, failed: results.filter((result) => result.error).length };
}

function batches(pairs: Pair[]): Pair[][] {
  const groups: Pair[][] = [];
  for (let from = 0; from < pairs.length; from += PAIRS_PER_REQUEST) {
    groups.push(pairs.slice(from, from + PAIRS_PER_REQUEST));
  }
  return groups;
}

function render(group: Pair[]): string {
  return group
    .map((pair, index) => {
      const describe = (entity: Entity) =>
        [entity.name, entity.role, entity.summary].filter(Boolean).join(' — ');
      return `${index}: ${describe(pair.a)}  ||  ${describe(pair.b)}`;
    })
    .join('\n');
}
