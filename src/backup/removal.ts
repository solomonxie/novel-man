import { Directory, File, Paths } from '../storage/fs';
import { buildBundle, openBundle } from './bundle';
import { secondStamp } from './format';
import { isAuto, refreshDriveStatus } from './icloud';
import { drive } from '../../modules/icloud';
import { listConnections, bucketFor } from '../cloud/connections';
import { listBookIds } from '../db/repo';
import { Bucket } from '../cloud/client';

export type RemovalBackup = { fileName: string };

/**
 * Read back from disk rather than trusted: this file is the only way back from
 * what runs next, and a short write, a full disk or an empty build would all
 * produce a plausible-looking zip. Throwing here leaves everything in place.
 */
function verify(file: File, expected: number): void {
  const opened = openBundle(file.bytesSync());
  const restorable = opened.snapshot.books.filter((book) => book.text?.trim()).length;
  if (restorable !== expected) {
    throw new Error(`Backup holds ${restorable} of ${expected} books; nothing was deleted.`);
  }
}

/** Writes a unique pre-removal copy to local storage and configured cloud destinations. */
export async function backupBeforeRemoval(): Promise<RemovalBackup> {
  const fileName = `${secondStamp()}-pre-deletion-novel-man.zip`;
  const expected = (await listBookIds()).length;
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
