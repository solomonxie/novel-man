import { listBooks, writeBookRecord, type BookRecord } from '../db/repo';
import { writeImage } from '../storage/files';
import type { OpenedBundle } from './bundle';
import { writePrefs } from './prefs';
import { hold } from './pending';
import { backUpBefore } from './local';

export type RestoreReport = {
  restored: { title: string; id: string }[];
  /** Named honestly rather than hidden: a duplicate is still restored, twice. */
  duplicates: string[];
  /** From a backup without manuscripts: the notes land when the file does. */
  waiting: number;
  unplaceable: { title: string; reason: 'no-text' | 'missing-asset' }[];
};

/**
 * A book already on the shelf is matched on its natural key — the source file
 * hash and title — only so the report can say "this one is already here". It
 * never causes an overwrite, because the copy on the device may be the one
 * with the newer notes.
 */
export async function restoreBundle(
  opened: OpenedBundle,
  // A restore the user asked for promises not to overwrite what is here, and
  // their appearance and reading settings are part of "what is here". Only
  // the automatic first-install restore has nothing to overwrite.
  { settings = false }: { settings?: boolean } = {}
): Promise<RestoreReport> {
  // The one copy that can undo this, written before it can be needed.
  await backUpBefore('restore');
  const existing = await listBooks();
  const known = new Set(existing.map((book) => naturalKey(book.source_hash, book.title)));
  const report: RestoreReport = { restored: [], duplicates: [], waiting: 0, unplaceable: [] };

  if (settings && opened.snapshot.settings) await writePrefs(opened.snapshot.settings);

  for (const bundled of opened.snapshot.books) {
    if (!bundled.text?.trim()) {
      // A book with no manuscript can't go on the shelf, but its notes are
      // not lost — they wait for the file, held by whoever called this.
      if (opened.snapshot.contentOmitted) report.waiting += 1;
      else report.unplaceable.push({ title: bundled.book.title, reason: 'no-text' });
      continue;
    }
    const record: BookRecord = { ...bundled };
    let missingAsset = false;

    if (bundled.assets?.cover) {
      const restoredPath = restoreAsset(opened, bundled.assets.cover);
      if (restoredPath) record.book = { ...record.book, cover_path: restoredPath };
      else missingAsset = true;
    } else {
      record.book = { ...record.book, cover_path: null };
    }

    record.entities = record.entities.map((entity) => {
      const path = bundled.assets?.portraits?.[entity.id];
      if (!path) return { ...entity, portrait_path: null };
      const restoredPath = restoreAsset(opened, path);
      if (!restoredPath) missingAsset = true;
      return { ...entity, portrait_path: restoredPath };
    });

    const id = await writeBookRecord(record);
    report.restored.push({ title: record.book.title, id });
    if (known.has(naturalKey(record.book.source_hash, record.book.title))) {
      report.duplicates.push(record.book.title);
    }
    if (missingAsset) {
      report.unplaceable.push({ title: record.book.title, reason: 'missing-asset' });
    }
  }
  // Held rather than dropped: the manuscripts are missing, but every note,
  // profile and chapter fix in there belongs to a file the reader still has.
  if (report.waiting > 0) hold(opened.bytes);
  return report;
}

function restoreAsset(opened: OpenedBundle, path: string): string | null {
  const bytes = opened.assets[path];
  if (!bytes) return null;
  return writeImage(path.replace('assets/', ''), bytes);
}

function naturalKey(hash: string, title: string): string {
  return `${hash}::${title.trim().toLowerCase()}`;
}
