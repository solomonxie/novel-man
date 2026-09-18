import { saveRemoteBook } from '../db/repo';
import { canonChapters, CHAPTERS } from '../scripture/canon';
import { cachePassage, cachedPassage } from './passages';
import { lookUpEsv, type Passage } from './esv';

/**
 * The ESV as a book on the shelf, with everything about it except its words.
 * All 1,189 chapters are known in advance — the shape of a bible is a fact,
 * not a text — so the book can be built in full and each chapter's words
 * fetched when that chapter is opened.
 *
 * It is the only book here whose text is not here. Crossway licenses the ESV
 * and permits nobody to redistribute it, so what this holds is a cache of what
 * has been read, bounded, and nothing else.
 */
export const ESV_SOURCE = 'esv';
export const ESV_TITLE = 'English Standard Version';

export async function addEsvBook(): Promise<string> {
  return saveRemoteBook({
    book: {
      title: ESV_TITLE,
      author: null,
      language: 'en',
      kind: 'scripture',
      text_source: ESV_SOURCE,
      source_name: 'api.esv.org',
      source_hash: ESV_SOURCE,
      source_path: '',
      source_ext: '',
      cover_hue: 214,
    },
    chapters: canonChapters(),
    partNames: Object.keys(CHAPTERS).map((book, part) => ({ part_idx: part, names: [book] })),
  });
}

/**
 * A chapter's words: from the device if they have been read before, from the
 * source if not. Kept either way, so the second reading needs no signal and
 * no second request.
 */
export async function esvChapterText(reference: string, token: string | null): Promise<Passage> {
  const kept = await cachedPassage(ESV_SOURCE, reference);
  if (kept) return { reference: kept.reference, text: kept.text };
  const found = await lookUpEsv(reference, token);
  await cachePassage(ESV_SOURCE, reference, found);
  return found;
}

/** Already here, and so readable with no signal at all. */
export async function esvChapterCached(reference: string): Promise<Passage | null> {
  const kept = await cachedPassage(ESV_SOURCE, reference);
  return kept ? { reference: kept.reference, text: kept.text } : null;
}
