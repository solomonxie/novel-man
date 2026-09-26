import { strFromU8, strToU8, unzipSync, Zip, ZipDeflate, ZipPassThrough } from 'fflate';
import { listBookIds, readBookRecord, type BookRecord } from '../db/repo';
import { openStored, readImage } from '../storage/files';
import { readPrefs } from './prefs';
import { keptCatalogs } from '../sources/catalog';
import { yieldToUI } from '../async/yield';
import type { ExportFile } from '../export/types';
import {
  ABOUT,
  BUNDLE_FORMAT,
  BUNDLE_VERSION,
  BundleError,
  bundleName,
  validate,
  type BundleAbout,
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
    catalogs: await keptCatalogs(),
  };

  at = performance.now();
  const json = JSON.stringify(snapshot);
  trace(`stringify ${Math.round(performance.now() - at)}ms for ${json.length} chars`);
  at = performance.now();
  const entries: Entry[] = [
    { path: ABOUT, bytes: strToU8(JSON.stringify(aboutOf(books, snapshot.createdAt))) },
    { path: SNAPSHOT, bytes: strToU8(json) },
  ];
  trace(`strToU8 ${Math.round(performance.now() - at)}ms`);
  let assetBytes = 0;
  for (const [path, bytes] of Object.entries(assets)) {
    entries.push({ path, bytes });
    assetBytes += bytes.length;
  }
  trace(`assets ${entries.length - 1} files ${assetBytes} bytes`);

  const label =
    books.length === 1 ? `export-${books[0].book.title.slice(0, 40)}` : 'library-novel-man';
  at = performance.now();
  const body = await archive(entries);
  trace(`archive ${Math.round(performance.now() - at)}ms to ${body.length} bytes`);
  return {
    fileName: bundleName(label.replace(/[/\\?%*:|"<>]/g, '-') || 'library-novel-man'),
    mimeType: 'application/zip',
    body,
  };
}

type Entry = { path: string; bytes: Uint8Array };

/**
 * Enough bytes that the deflater is doing real work between turns, few enough
 * that a turn is a frame rather than a stutter. At 512 KB the beat between
 * chunks slipped by up to 130ms — no freeze, but eight frames nobody drew.
 */
const CHUNK = 128 * 1024;

/**
 * A `.docx` is a zip, a `.jpg` is already compressed: deflating either spends
 * seconds of a phone's CPU to save nothing. They are stored whole, and only
 * the snapshot — which is text, and is nearly all of the size — is compressed.
 */
const PACKED = /\.(zip|docx|epub|pdf|jpe?g|png|gif|webp|heic|mp3|m4a)$/i;

/**
 * The bundle, built a chunk at a time with the thread handed back between
 * chunks. `zipSync` did this in one call, and a library's worth of text took
 * ten seconds during which nothing on screen could move — not a touch, not a
 * frame. Deflate has no suspension point of its own, so the only way to stay
 * responsive is to feed it in pieces.
 *
 * Level 1, not the default 6: on a manuscript it costs a few percent of size
 * and saves most of the time, and this runs on a phone that is also being
 * read on.
 */
async function archive(entries: Entry[]): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  let failure: Error | null = null;
  const zip = new Zip((error, chunk) => {
    if (error) failure = error;
    else parts.push(chunk);
  });

  for (const entry of entries) {
    const stream = PACKED.test(entry.path)
      ? new ZipPassThrough(entry.path)
      : new ZipDeflate(entry.path, { level: 1 });
    zip.add(stream);
    const { bytes } = entry;
    for (let at = 0; at < bytes.length || at === 0; at += CHUNK) {
      const end = Math.min(at + CHUNK, bytes.length);
      stream.push(bytes.subarray(at, end), end >= bytes.length);
      if (failure) throw failure;
      await yieldToUI();
      if (end >= bytes.length) break;
    }
  }
  zip.end();
  if (failure) throw failure;

  const body = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let at = 0;
  for (const part of parts) {
    body.set(part, at);
    at += part.length;
  }
  return body;
}

/** Counted while the books are in hand, which is the only cheap moment. */
function aboutOf(books: BundledBook[], createdAt: number): BundleAbout {
  const about: BundleAbout = {
    createdAt,
    books: books.length,
    chapters: 0,
    notes: 0,
    people: 0,
    places: 0,
    terms: 0,
    words: 0,
  };
  for (const book of books) {
    about.chapters += book.chapters.length;
    about.notes += book.annotations.filter((note) => note.kind === 'note').length;
    about.words += book.book.word_count;
    for (const entity of book.entities) {
      if (entity.kind === 'character') about.people += 1;
      else if (entity.kind === 'place') about.places += 1;
      else if (entity.kind === 'term') about.terms += 1;
    }
  }
  return about;
}

/**
 * What is in a backup, without opening it. Only that one entry is
 * decompressed — the rest of the archive is skipped, so this answers in
 * milliseconds where reading the snapshot would take seconds.
 *
 * Null for a bundle written before this existed: those are still restorable,
 * they just cannot say how much is in them without being opened.
 */
export function readAbout(bytes: Uint8Array): BundleAbout | null {
  try {
    const entry = unzipSync(bytes, { filter: (file) => file.name === ABOUT })[ABOUT];
    return entry ? (JSON.parse(strFromU8(entry)) as BundleAbout) : null;
  } catch {
    return null;
  }
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
