import { listBooks, updateBook } from '../db/repo';
import { imageName, imageSize, writeImage } from '../storage/files';
import type { OpenedBundle } from './bundle';

export type RepairedCover = { id: string; title: string };

/**
 * Pictures put back on the books that are already here.
 *
 * A restore adds books and overwrites none of them, which is right when the
 * question is whose notes are newer — and no use at all when the files are
 * simply gone. That happened: the `images` folder was emptied from outside the
 * app under a shelf whose rows still named every cover, so every tile went
 * blank, and the backup holding those covers could only offer a second copy of
 * each book that was already on the shelf.
 *
 * So this is the other half, and it decides nothing. A cover file that is
 * missing is written back under the name its own row already carries; a row
 * blanked by `clearMissingCovers` is pointed at the name the bundle remembers.
 * No file is overwritten, no book is added, and a book whose cover is still
 * there is not touched — which makes running it on every restore free of
 * consequence.
 *
 * Covers only. A portrait's row is identified by an id a restore reissues, so
 * there is no name on this device to match a bundled one against.
 */
export async function repairMissingCovers(
  opened: OpenedBundle,
  only?: Set<string>
): Promise<RepairedCover[]> {
  const here = new Map<string, { id: string; title: string; cover_path: string | null }>();
  for (const book of await listBooks()) {
    const key = naturalKey(book.source_hash, book.title);
    if (!here.has(key)) here.set(key, book);
  }

  const repaired: RepairedCover[] = [];
  for (const bundled of opened.snapshot.books) {
    if (only && !only.has(bundled.book.id)) continue;
    const asset = bundled.assets?.cover;
    if (!asset) continue;
    const bytes = opened.assets[asset];
    if (!bytes) continue;
    const book = here.get(naturalKey(bundled.book.source_hash, bundled.book.title));
    if (!book) continue;
    // Whatever this book calls its cover — its own name where it still has
    // one, so a row that is fine stays untouched, and the bundle's name where
    // the row was blanked.
    const named = book.cover_path?.trim() ? imageName(book.cover_path) : '';
    const target = named || imageName(bundled.book.cover_path);
    if (!target || imageSize(target) > 0) continue;
    writeImage(target, bytes);
    if (!named) await updateBook(book.id, { cover_path: target });
    repaired.push({ id: book.id, title: book.title });
  }
  return repaired;
}

/**
 * How a bundled book is recognised as one already on the shelf. The source
 * file's hash and the title, because an id is not shared: a restore reissues
 * every one, so two copies of the same book never agree on theirs.
 */
export function naturalKey(hash: string, title: string): string {
  return `${hash}::${title.trim().toLowerCase()}`;
}
