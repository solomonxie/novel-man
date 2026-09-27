import { listBooks, writeBookRecord, type BookRecord } from '../db/repo';
import { isSkeleton, withoutManuscript } from '../books/record';
import { restoreSourceFile, writeImage } from '../storage/files';
import type { OpenedBundle } from './bundle';
import type { Snapshot } from './format';
import { writePrefs } from './prefs';
import { hold } from './pending';
import { backUpBefore } from './local';
import { noticeRestore } from './changes';
import { enqueueCatalogs, type CatalogSource } from '../import/queue';
import { indexState } from '../sources/catalog';
import { labelOfCatalog } from '../sources/registry';

export type RestoreReport = {
  restored: { title: string; id: string }[];
  /** Named honestly rather than hidden: a duplicate is still restored, twice. */
  duplicates: string[];
  /**
   * On the shelf as skeletons, from a backup written before bundles carried
   * manuscripts. Everything around the book is there and the words are not;
   * importing the file again fills them in.
   */
  waiting: number;
  unplaceable: { title: string; reason: 'missing-asset' }[];
};

/**
 * A book already on the shelf is matched on its natural key — the source file
 * hash and title — only so the report can say "this one is already here". It
 * never causes an overwrite, because the copy on the device may be the one
 * with the newer notes.
 */
export async function restoreBundle(
  opened: OpenedBundle,
  {
    // A restore the user asked for promises not to overwrite what is here, and
    // their appearance and reading settings are part of "what is here". Only
    // the automatic first-install restore has nothing to overwrite.
    settings = false,
    /** Only these books out of the bundle; everything in it when unset. */
    only,
    /**
     * The guard copy below. Off only where this restore is itself the undo of
     * something — taking a book back out of the trash adds one book and can
     * lose nothing, so a full library bundle first is a wait for no reason.
     */
    guard = true,
  }: { settings?: boolean; only?: Set<string>; guard?: boolean } = {}
): Promise<RestoreReport> {
  // The one copy that can undo this, written before it can be needed.
  if (guard) await backUpBefore('restore');
  const existing = await listBooks();
  const known = new Set(existing.map((book) => naturalKey(book.source_hash, book.title)));
  const report: RestoreReport = { restored: [], duplicates: [], waiting: 0, unplaceable: [] };

  if (settings && opened.snapshot.settings) await writePrefs(opened.snapshot.settings);

  for (const bundled of opened.snapshot.books) {
    if (only && !only.has(bundled.book.id)) continue;
    const record: BookRecord = { ...bundled };
    let missingAsset = false;

    // No manuscript in the bundle is no reason to hide the book. It goes on
    // the shelf as a skeleton — title, cover, notes, people, chapters, rating,
    // everything except the words — which is a thing this app already has and
    // can already show. Waiting invisibly in a file is how someone concludes
    // the restore did nothing.
    const missingText = !bundled.text?.trim();
    if (missingText) {
      record.text = '';
      record.book = withoutManuscript(record.book);
      // Only a stripped bundle promises the words exist elsewhere, and only
      // for a book that kept them here. One that was always a skeleton is
      // restored, not waiting; one that fetches its own is not missing any.
      if (opened.snapshot.contentOmitted && isSkeleton(record.book)) report.waiting += 1;
    }

    const sourcePath = bundled.assets?.source
      ? opened.assets[bundled.assets.source] &&
        restoreSourceFile(
          bundled.book.source_hash,
          bundled.book.source_ext,
          opened.assets[bundled.assets.source]
        )
      : null;
    if (sourcePath) record.book = { ...record.book, source_path: sourcePath };

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

    // The drawn pictures go back under the names their rows carry, so an
    // illustration restores as itself rather than as a row pointing at
    // nothing.
    for (const key of bundled.assets?.pictures ?? []) {
      const bytes = opened.assets[key];
      if (bytes) writeImage(key.replace('assets/', ''), bytes);
    }

    const id = await writeBookRecord(record);
    report.restored.push({ title: record.book.title, id });
    if (known.has(naturalKey(record.book.source_hash, record.book.title))) {
      report.duplicates.push(record.book.title);
    }
    if (missingAsset) {
      report.unplaceable.push({ title: record.book.title, reason: 'missing-asset' });
    }
  }
  // Held as well as restored: the skeletons on the shelf carry the work, and
  // this is what puts the words back into them when the file turns up.
  if (report.waiting > 0) hold(opened.bytes);
  await refetchCatalogs(opened.snapshot.catalogs);
  noticeRestore();
  return report;
}

/**
 * The lists this device used to hold, queued rather than carried. The rows are
 * somebody else's public catalog and go stale; what the backup remembered is
 * that they were wanted, and the queue fetches them in the background while
 * the reader looks at the books that just came back.
 */
async function refetchCatalogs(kept: Snapshot['catalogs']): Promise<void> {
  const wanted: CatalogSource[] = [];
  for (const entry of kept ?? []) {
    if (entry.source !== 'ebible' && entry.source !== 'gutenberg' && entry.source !== 'standardebooks') {
      continue;
    }
    // Already here — a restore onto a phone that has them is not a reason to
    // download eighty thousand rows again.
    if (await indexState(entry.source)) continue;
    wanted.push(entry.source);
  }
  if (wanted.length) enqueueCatalogs(wanted, labelOfCatalog);
}

function restoreAsset(opened: OpenedBundle, path: string): string | null {
  const bytes = opened.assets[path];
  if (!bytes) return null;
  return writeImage(path.replace('assets/', ''), bytes);
}

function naturalKey(hash: string, title: string): string {
  return `${hash}::${title.trim().toLowerCase()}`;
}
