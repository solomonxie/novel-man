import { Directory, File } from './fs';
import { ownPath } from './own';

const DAY = 24 * 60 * 60 * 1000;

/**
 * Source files no book points at any more. Deleting a book never deleted its
 * file, so every re-import left the last one behind. A file from the last day
 * is spared: an import adopts its file before the book row exists.
 */
export function removeUnusedSources(references: { hashes: Set<string>; paths: string }): number {
  const dir = new Directory(ownPath('sources'));
  if (!dir.exists) return 0;
  let removed = 0;
  for (const entry of dir.list()) {
    if (!(entry instanceof File)) continue;
    const hash = entry.name.replace(/\..*$/, '');
    if (references.hashes.has(hash) || references.paths.includes(entry.name)) continue;
    if (Date.now() - entry.modifiedAt < DAY) continue;
    entry.delete();
    removed += 1;
  }
  return removed;
}

/** What demo mode left, once it is off: it starts empty again next time. */
export function removeDemoFiles(): void {
  for (const name of ['demo-images', 'demo-sources']) {
    const dir = new Directory(ownPath(name));
    if (dir.exists) {
      dir.deleteContents();
      dir.delete();
    }
  }
  const sqlite = new Directory(ownPath('SQLite'));
  if (!sqlite.exists) return;
  for (const entry of sqlite.list()) {
    if (entry instanceof File && entry.name.startsWith('novelman-demo.db')) entry.delete();
  }
}
