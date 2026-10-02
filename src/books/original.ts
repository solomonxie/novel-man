import { File } from '../storage/fs';
import { fingerprintOf } from '../storage/fingerprint';
import { adoptSourceFile } from '../storage/files';
import { setOrigin, setOriginFile, type Book } from '../db/repo';
import { originOfEpub } from '../import/formats/epub';

/**
 * Linking a book to the PDF it was converted from.
 *
 * The book already knows what it was made from — `tools/convert-pdf.mjs`
 * stamps the EPUB with the file's length, page count and fingerprint — so this
 * is a matter of checking that what has been picked is that file, and saying
 * plainly when it is not.
 *
 * It matters more than it sounds. A page number is only meaningful against one
 * printing: link the wrong edition and the reader will open page 84 with
 * complete confidence and show something else entirely. Refusing is the only
 * honest option, and the reason the stamp exists.
 */
export type Mismatch =
  | { kind: 'no-origin' }
  | { kind: 'pages'; expected: number; found: number }
  | { kind: 'bytes'; expected: number; found: number }
  | { kind: 'contents' };

export type Linked = { path: string };

/**
 * Copied into the app's own storage rather than referenced where it sits.
 *
 * iOS hands out a temporary grant on a picked file and nothing more; keeping
 * access across launches needs a security-scoped bookmark, which the picker
 * this app uses does not expose. So the alternative to copying is a link that
 * works until the app is next opened, which is not a link.
 *
 * The cost is the file's size again — 35 MB for a textbook — against 131 MB to
 * pre-render every page as an image, which was the other way of answering the
 * same question. It is also the same copy an import would have made.
 */
export async function linkOriginal(
  book: Book,
  picked: { uri: string; name: string }
): Promise<Linked | Mismatch> {
  if (!book.origin_fingerprint || !book.origin_pages) return { kind: 'no-origin' };

  const bytes = await new File(picked.uri).bytes();
  if (book.origin_bytes && bytes.length !== book.origin_bytes) {
    return { kind: 'bytes', expected: book.origin_bytes, found: bytes.length };
  }
  if (fingerprintOf(bytes) !== book.origin_fingerprint) return { kind: 'contents' };

  // Adopted the same way an imported manuscript is: under a name taken from
  // its own contents, so picking the same file twice costs nothing.
  const stored = await adoptSourceFile(picked.uri, picked.name);
  await setOriginFile(book.id, stored.path);
  return { path: stored.path };
}

export function unlinkOriginal(bookId: string): Promise<void> {
  return setOriginFile(bookId, null);
}

/** Whether a book has a page it could show, and somewhere to show it from. */
export function hasOriginal(book: Pick<Book, 'origin_path'>): boolean {
  return Boolean(book.origin_path);
}

/** Whether a book could be linked to one at all — only a converted book can. */
export function wantsOriginal(book: Pick<Book, 'origin_fingerprint'>): boolean {
  return Boolean(book.origin_fingerprint);
}

/**
 * The stamp a book should have had, read from the EPUB it was imported from.
 *
 * Books converted from a PDF before the app knew about stamps carry none, and
 * without one there is nothing to check a picked file against — so the option
 * to link the original is hidden, on a book that is exactly the kind that
 * wants it. Its EPUB is still in storage and still stamped, so the answer is
 * there to be read rather than asked for again.
 *
 * Returns whether anything was written, so a caller can reload only then.
 */
export async function recoverOrigin(book: Book): Promise<boolean> {
  if (book.origin_fingerprint || book.source_ext !== 'epub' || !book.source_path) return false;
  try {
    const file = new File(book.source_path);
    if (!file.exists) return false;
    const origin = originOfEpub(await file.bytes());
    if (!origin) return false;
    await setOrigin(book.id, origin);
    return true;
  } catch {
    return false;
  }
}
