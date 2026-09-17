import { db, newId, transaction } from '../db';

export const elementTypes = [
  'scene_heading',
  'action',
  'character',
  'parenthetical',
  'dialogue',
  'transition',
] as const;

export type ElementType = (typeof elementTypes)[number];

export type ScriptElement = {
  id: string;
  book_id: string;
  chapter_idx: number;
  scene_idx: number;
  position: number;
  type: ElementType;
  text: string;
};

export function isElementType(value: string): value is ElementType {
  return (elementTypes as readonly string[]).includes(value);
}

export async function listScript(bookId: string): Promise<ScriptElement[]> {
  const database = await db();
  return database.getAllAsync<ScriptElement>(
    'SELECT * FROM script_elements WHERE book_id = ? ORDER BY chapter_idx, scene_idx, position',
    bookId
  );
}

export async function countScript(bookId: string): Promise<number> {
  const database = await db();
  const row = await database.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM script_elements WHERE book_id = ?',
    bookId
  );
  return row?.n ?? 0;
}

/** A scene is rewritten whole: a half-converted scene is not a scene. */
export async function replaceScene(
  bookId: string,
  chapterIdx: number,
  sceneIdx: number,
  elements: { type: ElementType; text: string }[]
) {
  const database = await db();
  await transaction(async () => {
    await database.runAsync(
      'DELETE FROM script_elements WHERE book_id = ? AND chapter_idx = ? AND scene_idx = ?',
      bookId,
      chapterIdx,
      sceneIdx
    );
    for (const [position, element] of elements.entries()) {
      await database.runAsync(
        `INSERT INTO script_elements (id, book_id, chapter_idx, scene_idx, position, type, text)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        newId(), bookId, chapterIdx, sceneIdx, position, element.type, element.text
      );
    }
  });
}

export async function clearScript(bookId: string) {
  const database = await db();
  await database.runAsync('DELETE FROM script_elements WHERE book_id = ?', bookId);
}
