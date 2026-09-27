import AsyncStorage from '@react-native-async-storage/async-storage';

import { listCovered, updateBook } from '../db/repo';
import { imageSize, readImage, removeImage } from '../storage/files';
import { isPlaceholderCover, PLACEHOLDER_SIZE } from '../sources/identify';
import { yieldToUI } from '../async/yield';
import { trace } from '../dev/trace';

/**
 * The covers that are not covers.
 *
 * Until the fix in `googleCover`, a lookup kept the large size off Google's
 * cover address — and that is the size most books do not have, which Google
 * answers with a picture of the words "image not available" rather than a 404.
 * It is a real PNG of a plausible size, so every guard let it through, and the
 * book ended up wearing it. The lookup is fixed; these are the files it already
 * wrote, and they are only removable by recognising them.
 *
 * Once ever, and it repairs rather than deletes: a book whose picture goes back
 * to being nothing shows the tile it would have had, and can be looked up again
 * for a real one.
 */
const SWEPT = 'covers.placeholderSwept';

export type SweptCover = { id: string; title: string };

export async function clearPlaceholderCovers(): Promise<SweptCover[]> {
  if (await AsyncStorage.getItem(SWEPT)) return [];
  const cleared: SweptCover[] = [];
  try {
    for (const book of await listCovered()) {
      // One stat each. The panel is one asset and so one length, so every cover
      // that is a real cover is ruled out without reading a byte of it.
      if (imageSize(book.cover_path) !== PLACEHOLDER_SIZE) continue;
      const bytes = readImage(book.cover_path);
      if (!bytes || !isPlaceholderCover(bytes)) continue;
      await updateBook(book.id, { cover_path: null });
      removeImage(book.cover_path);
      cleared.push({ id: book.id, title: book.title });
      await yieldToUI();
    }
    await AsyncStorage.setItem(SWEPT, String(Date.now()));
  } catch (problem) {
    // A sweep that cannot finish is not a reason to fail a launch, and leaving
    // the marker unset means the next one picks up what is left.
    trace(`cover sweep: ${String(problem)}`);
  }
  return cleared;
}
