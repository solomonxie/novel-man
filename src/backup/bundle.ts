import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { listBookIds, readBookRecord, type BookRecord } from '../db/repo';
import { readImage } from '../storage/files';
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

const SNAPSHOT = 'snapshot.json';

/** Per book or whole library — the same payload, so one restore path serves both. */
export async function buildBundle(bookIds?: string[]): Promise<ExportFile> {
  const ids = bookIds ?? (await listBookIds());
  const assets: Record<string, Uint8Array> = {};
  const books: BundledBook[] = [];

  for (const id of ids) {
    const record = await readBookRecord(id);
    if (!record) continue;
    books.push(withAssets(record, assets));
  }

  const snapshot: Snapshot = {
    format: BUNDLE_FORMAT,
    version: BUNDLE_VERSION,
    createdAt: Date.now(),
    app: 'novel-man',
    books,
  };

  const files: Record<string, Uint8Array> = { [SNAPSHOT]: strToU8(JSON.stringify(snapshot)) };
  for (const [path, bytes] of Object.entries(assets)) files[path] = bytes;

  const label = books.length === 1 ? books[0].book.title.slice(0, 40) : 'library';
  return {
    fileName: bundleName(label.replace(/[/\\?%*:|"<>]/g, '-') || 'library'),
    mimeType: 'application/zip',
    body: zipSync(files),
  };
}

function withAssets(record: BookRecord, assets: Record<string, Uint8Array>): BundledBook {
  const bundled: BundledBook = { ...record, assets: { portraits: {} } };
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

function stash(uri: string, assets: Record<string, Uint8Array>, name: string) {
  const bytes = readImage(uri);
  if (!bytes) return null;
  const extension = /\.([a-z0-9]+)$/i.exec(uri)?.[1] ?? 'jpg';
  const path = `assets/${name}.${extension}`;
  assets[path] = bytes;
  return path;
}

export type OpenedBundle = { snapshot: Snapshot; assets: Record<string, Uint8Array> };

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
  return { snapshot: validate(parsed), assets };
}
