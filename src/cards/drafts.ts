import { db } from '../db';

/** A card one chapter's pass proposed, before the merge. */
export type CardDraft = { chapterIdx: number; front: string; back: string; quote: string; tags: string[] };

/** Several chapters' drafts of the same thing, to become one card. */
export type DraftGroup = { key: string; drafts: CardDraft[] };

/**
 * What two fronts have to share to be the same card: case, width, punctuation,
 * a leading article and a plural don't make a different term.
 */
export function cardKey(front: string): string {
  return front
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/^\s*(the|a|an)\s+/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/([a-z]{2}[^s])s$/, '$1');
}

/**
 * The reduce step's local half. Drafts are grouped by key; a key the book
 * already has a card for is left out, so running a chapter twice adds nothing.
 * A group seen in one chapter is ready as it is; one seen in several needs its
 * backs joined into one, which is the part a model is asked for.
 */
export function groupDrafts(drafts: CardDraft[], existing: Iterable<string>) {
  const known = new Set([...existing].map(cardKey));
  const groups = new Map<string, CardDraft[]>();
  for (const draft of drafts) {
    const key = cardKey(draft.front);
    if (!key || known.has(key)) continue;
    groups.set(key, [...(groups.get(key) ?? []), draft]);
  }
  const all = [...groups].map(([key, list]) => ({
    key,
    drafts: list.sort((a, b) => a.chapterIdx - b.chapterIdx),
  }));
  return {
    single: all.filter((group) => new Set(group.drafts.map((draft) => draft.chapterIdx)).size === 1),
    repeated: all.filter((group) => new Set(group.drafts.map((draft) => draft.chapterIdx)).size > 1),
  };
}

export async function replaceChapterDrafts(bookId: string, chapterIdx: number, drafts: Omit<CardDraft, 'chapterIdx'>[]) {
  const database = await db();
  await database.runAsync('DELETE FROM card_drafts WHERE book_id = ? AND chapter_idx = ?', bookId, chapterIdx);
  for (const draft of drafts) {
    await database.runAsync(
      `INSERT OR IGNORE INTO card_drafts (book_id, chapter_idx, front, back, quote, tags) VALUES (?, ?, ?, ?, ?, ?)`,
      bookId,
      chapterIdx,
      draft.front,
      draft.back,
      draft.quote || null,
      JSON.stringify(draft.tags)
    );
  }
}

export async function listDrafts(bookId: string): Promise<CardDraft[]> {
  const database = await db();
  const rows = await database.getAllAsync<{ chapter_idx: number; front: string; back: string; quote: string | null; tags: string }>(
    'SELECT * FROM card_drafts WHERE book_id = ? ORDER BY chapter_idx',
    bookId
  );
  return rows.map((row) => ({
    chapterIdx: row.chapter_idx,
    front: row.front,
    back: row.back,
    quote: row.quote ?? '',
    tags: JSON.parse(row.tags) as string[],
  }));
}

export async function clearDrafts(bookId: string) {
  const database = await db();
  await database.runAsync('DELETE FROM card_drafts WHERE book_id = ?', bookId);
}

/** Fronts already proposed for this book, so a later chapter reuses the wording. */
export async function draftFronts(bookId: string): Promise<string[]> {
  const database = await db();
  const rows = await database.getAllAsync<{ front: string }>(
    'SELECT front FROM card_drafts WHERE book_id = ? GROUP BY front ORDER BY MIN(chapter_idx)',
    bookId
  );
  return rows.map((row) => row.front);
}
