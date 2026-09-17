import { listBooks, writeBookRecord, type BookRecord } from '../db/repo';
import { writeImage } from '../storage/files';
import type { OpenedBundle } from './bundle';

export type RestoreReport = {
  restored: { title: string; id: string }[];
  /** Named honestly rather than hidden: a duplicate is still restored, twice. */
  duplicates: string[];
  unplaceable: { title: string; reason: 'no-text' | 'missing-asset' }[];
};

/**
 * A book already on the shelf is matched on its natural key — the source file
 * hash and title — only so the report can say "this one is already here". It
 * never causes an overwrite, because the copy on the device may be the one
 * with the newer notes.
 */
export async function restoreBundle(opened: OpenedBundle): Promise<RestoreReport> {
  const existing = await listBooks();
  const known = new Set(existing.map((book) => naturalKey(book.source_hash, book.title)));
  const report: RestoreReport = { restored: [], duplicates: [], unplaceable: [] };

  for (const bundled of opened.snapshot.books) {
    if (!bundled.text?.trim()) {
      report.unplaceable.push({ title: bundled.book.title, reason: 'no-text' });
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
