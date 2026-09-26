import { Directory, File, Paths } from '../storage/fs';
import { buildBundle, openBundle } from './bundle';
import { secondStamp } from './format';
import { isAuto, refreshDriveStatus } from './icloud';
import { drive } from '../../modules/icloud';
import { listConnections, bucketFor } from '../cloud/connections';
import { listBooks } from '../db/repo';
import { Bucket } from '../cloud/client';

export type RemovalBackup = { fileName: string };

/**
 * Read back from disk rather than trusted: this file is the only way back from
 * what runs next, and a short write, a full disk or an empty build would all
 * produce a plausible-looking zip. Throwing here leaves everything in place.
 *
 * Two questions, and they used to be one. "Is every book in here" is the count.
 * "Did the words come with them" is asked only of the books that have words: a
 * skeleton is a book with none by definition, and a shelf imported from
 * Goodreads is nothing but skeletons — so counting texts and comparing that to
 * the number of books said "holds 1 of 22" about a backup that held all 22,
 * and refused to delete anything.
 */
function verify(file: File, expected: { id: string; word_count: number }[]): void {
  const opened = openBundle(file.bytesSync());
  if (opened.snapshot.books.length !== expected.length) {
    throw new Error(
      `Backup holds ${opened.snapshot.books.length} of ${expected.length} books; nothing was deleted.`
    );
  }
  const withWords = new Set(
    opened.snapshot.books.filter((book) => book.text?.trim()).map((book) => book.book.id)
  );
  const lost = expected.filter((book) => book.word_count > 0 && !withWords.has(book.id));
  if (lost.length) {
    throw new Error(
      `Backup is missing the text of ${lost.length} book(s); nothing was deleted.`
    );
  }
}

/** Writes a unique pre-removal copy to local storage and configured cloud destinations. */
export async function backupBeforeRemoval(): Promise<RemovalBackup> {
  const fileName = `${secondStamp()}-pre-deletion-novel-man.zip`;
  const expected = await listBooks();
  const full = await buildBundle();
  const backupFolder = new Directory(Paths.document, 'Backups');
  if (!backupFolder.exists) backupFolder.create({ intermediates: true });
  const local = new File(backupFolder, fileName);
  local.write(full.body as Uint8Array);
  verify(local, expected);

  const connections = await listConnections();
  const uploads: Promise<void>[] = [];

  if (connections.length) {
    uploads.push((async () => {
      for (const connection of connections) {
        const bucket = await bucketFor(connection.id);
        if (!bucket) throw new Error(`Missing credentials for ${connection.name}`);
        await bucket.put(`pre-deletion/${fileName}`, full.body as Uint8Array, 'application/zip');
      }
    })());
  }

  if (await isAuto()) {
    uploads.push((async () => {
      if (!drive || (await refreshDriveStatus()) !== 'available') {
        throw new Error('iCloud Drive is enabled but unavailable.');
      }
      // The one upload that carries the manuscripts. Every other iCloud copy
      // leaves them out because the reader still has the file they came from —
      // and the wipe about to run is what takes those files away.
      const staged = new File(Paths.cache, fileName);
      staged.write(full.body as Uint8Array);
      try {
        const path = decodeURIComponent(staged.uri.replace('file://', ''));
        await drive.copyIn(path, `pre-deletion/${fileName}`);
      } finally {
        if (staged.exists) staged.delete();
      }
    })());
  }

  await Promise.all(uploads);
  return { fileName };
}
