import { applyToImport } from '../backup/pending';
import { yieldToUI } from '../async/yield';
import { saveImportedBook } from '../db/repo';
import { normalize } from '../import/normalize';
import { hintsOf } from '../structure/document';
import { countUnits } from '../text/counts';
import { detectLanguage } from '../text/language';
import { layoutBible, type UsfmBook } from './usfm';

/** Where the edition came from, for a backup to match it up again later. */
export type BibleSource = { name: string; hash: string; path: string; ext: string };

/**
 * An edition onto the shelf, once its books have been read. This never detects
 * anything — a bible states its own chapters and verses, whatever format it
 * was published in — so it is the ordinary import with the detection step
 * removed: flatten to one text with offsets, then save.
 */
export async function saveBible(input: {
  title: string;
  books: UsfmBook[];
  source: BibleSource;
  hue: number;
}): Promise<{ bookId: string; chapters: number }> {
  const structure = layoutBible(input.books);
  const doc = normalize(structure.blocks);
  const offsetOf = new Map(doc.blocks.map((block) => [block.source, block] as const));
  await yieldToUI();

  const chapters = structure.chapters.map((chapter, index) => {
    const start = offsetOf.get(chapter.block)?.start ?? 0;
    const next = structure.chapters[index + 1];
    const end = next ? offsetOf.get(next.block)?.start ?? doc.text.length : doc.text.length;
    return {
      // The reference is the title: "John 3" is what the reader is looking at.
      title: `${chapter.partName} ${chapter.number}`,
      start,
      end,
      confident: true,
      part_idx: chapter.part,
      part_title: chapter.partName,
    };
  });

  const chapterAt = new Map(
    structure.chapters.map((chapter, index) => [`${chapter.part}:${chapter.number}`, index] as const)
  );
  const verses = structure.verses.flatMap((verse) => {
    const placed = offsetOf.get(verse.block);
    const chapterIndex = chapterAt.get(`${verse.part}:${verse.chapter}`);
    if (!placed || chapterIndex === undefined) return [];
    return [{ chapterIndex, number: verse.number, start: placed.start, end: placed.end }];
  });

  const { language } = detectLanguage(doc.text);
  const counts = countUnits(doc.text, language);
  const bookId = await saveImportedBook({
    book: {
      title: input.title,
      author: null,
      language,
      kind: 'scripture',
      source_name: input.source.name,
      source_hash: input.source.hash,
      source_path: input.source.path,
      source_ext: input.source.ext,
      word_count: counts.words,
      char_count: doc.text.length,
      cover_hue: input.hue,
    },
    text: doc.text,
    hints: hintsOf(doc),
    chapters,
    scenes: [],
    verses,
    partNames: structure.parts.map((part) => ({ part_idx: part.idx, names: part.names })),
  });
  await applyToImport(bookId, input.source.hash);
  return { bookId, chapters: chapters.length };
}

export function hueOf(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) % 360;
  return hash;
}
