import { estimate, type Estimate } from '../ai/cost';
import { parseJson, runUnits } from '../ai/run';
import { addFlags, listEntities, listObservations, type Entity, type Observation } from '../db/repo';

/**
 * A continuity check is a comparison of what different chapters said about the
 * same person, which is exactly why the observations are kept unmerged. Only
 * characters seen in two or more chapters can contradict themselves.
 */
export type Subject = { entity: Entity; observations: Observation[] };

export async function subjectsFor(bookId: string): Promise<Subject[]> {
  const subjects: Subject[] = [];
  for (const entity of await listEntities(bookId, 'character')) {
    const observations = (await listObservations(entity.id)).filter(
      (row) => row.appearance?.trim() || row.voice?.trim()
    );
    if (observations.length >= 2) subjects.push({ entity, observations });
  }
  return subjects;
}

export function estimateContinuity(subjects: Subject[], language: string): Promise<Estimate | null> {
  return estimate({
    units: subjects.map(render),
    language,
    outputRatio: 0.3,
    overheadTokens: 220,
  });
}

export type Flag = { kind: string; detail: string };

/**
 * Flags are reviewable, never edits. The model is often right about a color
 * changing and often wrong about why — only the author knows which it is.
 */
export async function checkContinuity(
  bookId: string,
  subjects: Subject[],
  hooks: { onProgress?: (done: number, total: number) => void; signal?: AbortSignal } = {}
): Promise<{ flagged: number; failed: number }> {
  const results = await runUnits<Subject, Flag[]>(
    {
      kind: 'cast-continuity',
      units: subjects.map((subject) => ({ id: subject.entity.id, input: subject })),
      prompt: (subject) => [
        {
          role: 'system',
          content:
            'You look for contradictions in how one character is described across chapters ' +
            'of a novel. Reply with JSON only: [{"kind":"appearance|voice|other",' +
            '"detail":"<one sentence naming both chapters and what disagrees>"}]. ' +
            'A change the story explains is not a contradiction. Reply [] when nothing conflicts.',
        },
        { role: 'user', content: render(subject) },
      ],
      parse: (answer) => parseJson<Flag[]>(answer),
      maxTokens: 500,
      onProgress: hooks.onProgress,
    },
    hooks.signal
  );

  let flagged = 0;
  for (const result of results) {
    const flags = (result.value ?? []).filter((flag) => flag?.detail?.trim());
    if (!flags.length) continue;
    await addFlags(
      bookId,
      flags.map((flag) => ({
        entity_id: result.id,
        kind: flag.kind || 'other',
        detail: flag.detail.trim(),
      }))
    );
    flagged += flags.length;
  }
  return { flagged, failed: results.filter((result) => result.error !== undefined).length };
}

function render(subject: Subject): string {
  const lines = subject.observations.map(
    (row) =>
      `Chapter ${row.chapter_idx + 1}: ${[row.appearance, row.voice].filter(Boolean).join(' / ')}`
  );
  return `${subject.entity.name}\n${lines.join('\n')}`;
}
