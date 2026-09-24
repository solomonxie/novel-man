import { Directory, File, Paths } from '../storage/fs';
import { buildBundle } from './bundle';
import { isAuto, refreshDriveStatus } from './icloud';
import { drive } from '../../modules/icloud';
import { listConnections, bucketFor } from '../cloud/connections';
import { Bucket } from '../cloud/client';

export type RemovalBackup = { fileName: string };

/** Writes a unique pre-removal copy to local storage and configured cloud destinations. */
export async function backupBeforeRemoval(): Promise<RemovalBackup> {
  const stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const fileName = `novel-man-removal-${stamp}.zip`;
  const full = await buildBundle();
  const backupFolder = new Directory(Paths.document, 'Backups');
  if (!backupFolder.exists) backupFolder.create({ intermediates: true });
  const local = new File(backupFolder, fileName);
  local.write(full.body as Uint8Array);

  const connections = await listConnections();
  const uploads: Promise<void>[] = [];

  if (connections.length) {
    uploads.push((async () => {
      for (const connection of connections) {
        const bucket = await bucketFor(connection.id);
        if (!bucket) throw new Error(`Missing credentials for ${connection.name}`);
        await bucket.put(`before-removal/${fileName}`, full.body as Uint8Array, 'application/zip');
      }
    })());
  }

  if (await isAuto()) {
    uploads.push((async () => {
      if (!drive || (await refreshDriveStatus()) !== 'available') {
        throw new Error('iCloud Drive is enabled but unavailable.');
      }
      const metadata = await buildBundle(undefined, { includeText: false });
      const staged = new File(Paths.cache, fileName);
      staged.write(metadata.body as Uint8Array);
      try {
        const path = decodeURIComponent(staged.uri.replace('file://', ''));
        await drive.copyIn(path, `before-removal/${fileName}`);
      } finally {
        if (staged.exists) staged.delete();
      }
    })());
  }

  await Promise.all(uploads);
  return { fileName };
}
