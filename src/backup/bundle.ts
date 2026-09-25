import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { listBookIds, readBookRecord, type BookRecord } from '../db/repo';
import { openStored, readImage } from '../storage/files';
import { readPrefs } from './prefs';
import type { ExportFile } from '../export/types';
import {
  BUNDLE_FORMAT,
  BUNDLE_VERSION,
  BundleError,
  bundleName,
  validate,
  type BundledBook,
  type Snapshot,
} from './format';

import { trace } from '../dev/trace';

const SNAPSHOT = 'snapshot.json';

/**
 * Everything but the credentials. A backup used to leave the manuscripts out
 * of the cheap destinations, on the premise that the book came from a file the
 * reader still has — and the day that premise failed was the day it mattered:
 * a wipe takes the files with it, and what came back was a shelf of titles
 * with nothing to read. So every bundle now carries the text, the work around
 * it, the images and the source file itself. Keys stay in the keychain and
 * travel nowhere.
 */
export async function buildBundle(bookIds?: string[]): Promise<ExportFile> {
  let at = performance.now();
  const ids = bookIds ?? (await listBookIds());
  const assets: Record<string, Uint8Array> = {};
  const books: BundledBook[] = [];

  for (const id of ids) {
    const each = performance.now();
    const record = await readBookRecord(id);
    if (!record) continue;
    const read = performance.now();
    books.push(withAssets(record, assets));
    trace(
      `book ${id} read ${Math.round(read - each)}ms assets ${Math.round(performance.now() - read)}ms`
    );
  }
  trace(`records ${Math.round(performance.now() - at)}ms for ${books.length} books`);

  const snapshot: Snapshot = {
    format: BUNDLE_FORMAT,
    version: BUNDLE_VERSION,
    createdAt: Date.now(),
    app: 'novel-man',
    books,
    settings: await readPrefs(),
  };

  at = performance.now();
  const json = JSON.stringify(snapshot);
  trace(`stringify ${Math.round(performance.now() - at)}ms for ${json.length} chars`);
  at = performance.now();
  const files: Record<string, Uint8Array> = { [SNAPSHOT]: strToU8(json) };
  trace(`strToU8 ${Math.round(performance.now() - at)}ms`);
  let assetBytes = 0;
  for (const [path, bytes] of Object.entries(assets)) {
    files[path] = bytes;
    assetBytes += bytes.length;
  }
  trace(`assets ${Object.keys(assets).length} files ${assetBytes} bytes`);

  const label =
    books.length === 1 ? `export-${books[0].book.title.slice(0, 40)}` : 'library-novel-man';
  at = performance.now();
  const body = zipSync(files);
  trace(`zipSync ${Math.round(performance.now() - at)}ms to ${body.length} bytes`);
  return {
    fileName: bundleName(label.replace(/[/\\?%*:|"<>]/g, '-') || 'library-novel-man'),
    mimeType: 'application/zip',
    body,
  };
}

function withAssets(record: BookRecord, assets: Record<string, Uint8Array>): BundledBook {
  const bundled: BundledBook = { ...record, assets: { portraits: {} } };
  // The file the book was made from, so a restore can put it back rather than
  // ask for it. Without this a restored book reads fine and still counts as
  // "missing its file" to everything that wants the original bytes.
  const source = sourceBytes(record);
  if (source) {
    const path = `sources/${record.book.source_hash}.${record.book.source_ext || 'bin'}`;
    assets[path] = source;
    bundled.assets.source = path;
  }
  if (record.book.cover_path) {
    const path = stash(record.book.cover_path, assets, `cover-${record.book.id}`);
    if (path) bundled.assets.cover = path;
  }
  for (const entity of record.entities) {
    if (!entity.portrait_path) continue;
    const path = stash(entity.portrait_path, assets, `portrait-${entity.id}`);
    if (path) bundled.assets.portraits[entity.id] = path;
  }
  return bundled;
}

function sourceBytes(record: BookRecord): Uint8Array | null {
  try {
    const file = openStored(record.book.source_path, record.book.source_hash, record.book.source_ext);
    return file.exists ? file.bytesSync() : null;
  } catch {
    return null;
  }
}

function stash(uri: string, assets: Record<string, Uint8Array>, name: string) {
  const bytes = readImage(uri);
  if (!bytes) return null;
  const extension = /\.([a-z0-9]+)$/i.exec(uri)?.[1] ?? 'jpg';
  const path = `assets/${name}.${extension}`;
  assets[path] = bytes;
  return path;
}

/**
 * Sampling the zip is enough to notice a change; hashing all of it is not
 * free, and the question being asked is only "is this the same backup again".
 */
export function fingerprint(bytes: Uint8Array): string {
  const stride = Math.max(1, Math.floor(bytes.length / 2048));
  let out = '';
  for (let i = 0; i < bytes.length; i += stride) out += bytes[i].toString(36);
  return `${bytes.length}:${out}`;
}

export type OpenedBundle = {
  snapshot: Snapshot;
  assets: Record<string, Uint8Array>;
  /** Kept so a restore that can't place everything can hold the bundle itself. */
  bytes: Uint8Array;
};

export function openBundle(bytes: Uint8Array): OpenedBundle {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch (error) {
    throw new BundleError('not-a-bundle', String(error));
  }
  const raw = entries[SNAPSHOT];
  if (!raw) throw new BundleError('not-a-bundle');
  let parsed: unknown;
  try {
    parsed = JSON.parse(strFromU8(raw));
  } catch (error) {
    throw new BundleError('unreadable', String(error));
  }
  const assets: Record<string, Uint8Array> = {};
  for (const [path, content] of Object.entries(entries)) {
    if (path.startsWith('assets/')) assets[path] = content;
  }
  return { snapshot: validate(parsed), assets, bytes };
}
