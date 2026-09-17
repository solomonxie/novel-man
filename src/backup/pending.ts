import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Paths } from 'expo-file-system';
import { attachBookRecord, type BookRecord } from '../db/repo';
import { writeImage } from '../storage/files';
import { openBundle } from './bundle';
import type { BundledBook } from './format';

const HELD = 'pending-restore.zip';
const APPLIED = 'icloud.pendingApplied';

/**
 * A backup without manuscripts restores everything except the books, so the
 * reader's own work waits here until the file it belongs to is imported again.
 * The whole bundle is kept rather than a parsed copy of it, because the cover
 * and portraits are bytes and a JSON file is not where bytes belong.
 */
function heldFile(): File {
  return new File(Paths.document, HELD);
}

export function hold(bytes: Uint8Array) {
  const file = heldFile();
  if (file.exists) file.delete();
  file.create();
  file.write(bytes);
  // A newer bundle answers for every book in it, so what an older one had
  // already handed over is no longer a reason to skip anything.
  void AsyncStorage.removeItem(APPLIED);
}

async function appliedHashes(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(APPLIED);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function held(): { books: BundledBook[]; assets: Record<string, Uint8Array> } | null {
  const file = heldFile();
  if (!file.exists) return null;
  try {
    const opened = openBundle(file.bytesSync());
    return { books: opened.snapshot.books, assets: opened.assets };
  } catch {
    // A bundle this build can't read will never become readable. Drop it
    // rather than checking it again on every single import.
    file.delete();
    return null;
  }
}

/** How many books are still waiting for their file — the honest count to show. */
export async function waitingCount(): Promise<number> {
  const bundle = held();
  if (!bundle) return 0;
  const applied = new Set(await appliedHashes());
  return bundle.books.filter((book) => !applied.has(book.book.source_hash)).length;
}

export function forget() {
  const file = heldFile();
  if (file.exists) file.delete();
  void AsyncStorage.removeItem(APPLIED);
}

/**
 * Matched on the source hash, never on an id: ids are regenerated on every
 * install, the hash of the same file is not.
 */
export async function applyToImport(bookId: string, sourceHash: string): Promise<boolean> {
  const bundle = held();
  if (!bundle) return false;
  const applied = await appliedHashes();
  if (applied.includes(sourceHash)) return false;
  const bundled = bundle.books.find((book) => book.book.source_hash === sourceHash);
  if (!bundled) return false;

  await attachBookRecord(bookId, withRestoredAssets(bundled, bundle.assets));
  const next = [...applied, sourceHash];
  await AsyncStorage.setItem(APPLIED, JSON.stringify(next));
  if (next.length >= bundle.books.length) forget();
  return true;
}

function withRestoredAssets(
  bundled: BundledBook,
  assets: Record<string, Uint8Array>
): BookRecord {
  const record: BookRecord = { ...bundled };
  const cover = bundled.assets?.cover ? restore(assets, bundled.assets.cover) : null;
  record.book = { ...record.book, cover_path: cover };
  record.entities = record.entities.map((entity) => {
    const path = bundled.assets?.portraits?.[entity.id];
    return { ...entity, portrait_path: path ? restore(assets, path) : null };
  });
  return record;
}

function restore(assets: Record<string, Uint8Array>, path: string): string | null {
  const bytes = assets[path];
  return bytes ? writeImage(path.replace('assets/', ''), bytes) : null;
}
