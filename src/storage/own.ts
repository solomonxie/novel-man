import RNFSTurbo from 'react-native-fs-turbo';

import { Paths } from './fs';

/**
 * The app's own files, out of the Files app.
 *
 * Everything once lived under Documents, and Documents is what Files shows —
 * so the folder somebody opens to drop in a book or take out a backup held a
 * thousand cover images, the database and the trash. These move once, by
 * rename, to Application Support. Backups and exports stay: they are there to
 * be taken away.
 */
const OWN = [
  'SQLite',
  'images',
  'sources',
  'Trash',
  'demo-images',
  'demo-sources',
  'ebible-catalog.json',
  'pending-restore.zip',
];

let moved = false;

function moveOut() {
  if (moved) return;
  moved = true;
  try {
    if (!RNFSTurbo.exists(Paths.support)) RNFSTurbo.mkdir(Paths.support);
  } catch {
    return;
  }
  for (const name of OWN) {
    const from = `${Paths.document}/${name}`;
    const to = `${Paths.support}/${name}`;
    try {
      if (RNFSTurbo.exists(from) && !RNFSTurbo.exists(to)) RNFSTurbo.moveFile(from, to);
    } catch {
      // Left where it was, and found there: see `ownPath`.
    }
  }
}

/**
 * Where one of the app's own files or folders is. The old place wins only
 * while it still exists and the new one does not — a move that failed must
 * not read as an empty library.
 */
export function ownPath(name: string): string {
  moveOut();
  const kept = `${Paths.support}/${name}`;
  const old = `${Paths.document}/${name}`;
  return !RNFSTurbo.exists(kept) && RNFSTurbo.exists(old) ? old : kept;
}
