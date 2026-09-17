import { estimate, type Estimate } from '../ai/cost';
import { parseJson, runUnits } from '../ai/run';
import { listChapters, listScenes, type Chapter, type Scene } from '../db/repo';
import { isElementType, replaceScene, type ElementType } from './model';

/** A scene is the screenplay's own unit, which is why Phase 3 had to exist first. */
const SCENE_BUDGET = 5000;

export type SceneUnit = { chapter: Chapter; scene: Scene; index: number; text: string };

export async function scenesFor(bookId: string, documentText: string): Promise<SceneUnit[]> {
  const chapters = await listChapters(bookId);
  const byId = new Map(chapters.map((chapter) => [chapter.id, chapter]));
  return (await listScenes(bookId)).flatMap((scene) => {
    const chapter = byId.get(scene.chapter_id);
    if (!chapter) return [];
    return [
      {
        chapter,
        scene,
        index: scene.idx,
        text: documentText.slice(scene.start, Math.min(scene.end, scene.start + SCENE_BUDGET)),
      },
    ];
  });
}

export function estimateScript(units: SceneUnit[], language: string): Promise<Estimate | null> {
  return estimate({
    units: units.map((unit) => unit.text),
    language,
    // A screenplay is shorter than the prose it comes from, but not by much.
    outputRatio: 0.8,
    overheadTokens: 320,
  });
}

type Converted = { type: string; text: string }[];

export async function convertToScript(
  bookId: string,
  units: SceneUnit[],
  hooks: { onProgress?: (done: number, total: number) => void; signal?: AbortSignal } = {}
): Promise<{ scenes: number; failed: number }> {
  const results = await runUnits<SceneUnit, Converted>(
    {
      kind: 'script-convert',
      units: units.map((unit) => ({ id: `${unit.chapter.idx}:${unit.index}`, input: unit })),
      prompt: (unit) => [
        {
          role: 'system',
          content:
            'You adapt a novel scene into screenplay elements. Reply with JSON only: ' +
            '[{"type":"scene_heading|action|character|parenthetical|dialogue|transition","text":"…"}]. ' +
            'Open with one scene_heading in the form "INT./EXT. PLACE - TIME". ' +
            'Action is present tense and only what a camera sees — never a thought. ' +
            'A "character" element is a name in caps, immediately followed by its dialogue. ' +
            'Keep the dialogue the novel actually uses wherever there is any.',
        },
        {
          role: 'user',
          content: `Chapter: ${unit.chapter.title || unit.chapter.idx + 1}\n\n${unit.text}`,
        },
      ],
      parse: (answer) => parseJson<Converted>(answer),
      maxTokens: 1600,
      onProgress: hooks.onProgress,
    },
    hooks.signal
  );

  let scenes = 0;
  for (const [index, result] of results.entries()) {
    const elements = (result.value ?? [])
      .filter((element) => element?.text?.trim() && isElementType(element.type))
      .map((element) => ({ type: element.type as ElementType, text: element.text.trim() }));
    if (!elements.length) continue;
    const unit = units[index];
    await replaceScene(bookId, unit.chapter.idx, unit.index, elements);
    scenes += 1;
  }
  return { scenes, failed: results.filter((result) => result.error !== undefined).length };
}
