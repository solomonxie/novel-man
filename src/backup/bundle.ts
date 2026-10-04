import { strFromU8, strToU8, unzipSync, Zip, ZipDeflate, ZipPassThrough } from 'fflate';
import { listBookIds, readBookRecord, type BookRecord } from '../db/repo';
import { libraryCsv, type LibraryRow } from '../export/formats/library';
import { annotationsMarkdownExporter } from '../export/formats/annotations';
import { safeFileName } from '../export/types';
import { imageName, openStored, readImage } from '../storage/files';
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
export async function buildBundle(
  bookIds?: string[]
): Promise<ExportFile & { about: BundleAbout }> {
  let at = performance.now();
  const ids = bookIds ?? (await listBookIds());
  const assets: Record<string, Uint8Array> = {};
  const books: BundledBook[] = [];

  for (const id of ids) {
    const each = performance.now();
    const record = await readBookRecord(id);
    if (!record) continue;
    const read = performance.now();
    books.push(await withAssets(record, assets));
    trace(
      `book ${id} read ${Math.round(read - each)}ms assets ${Math.round(performance.now() - read)}ms`
    );
    // Every book here is a synchronous file read — `await readBookRecord` is a
    // microtask, not a yield, so without this the whole loop runs as one
    // block: 139 books, most of them free, one of them 2.5s for its images,
    // and nothing in between gets a turn to answer a tap.
    await yieldToUI();
  }
  trace(`records ${Math.round(performance.now() - at)}ms for ${books.length} books`);

  const snapshot: Snapshot = {
    format: BUNDLE_FORMAT,
    version: BUNDLE_VERSION,
    createdAt: Date.now(),
    app: 'novel-man',
    books,
    settings: await readPrefs(),
    // A property of the whole library, not of one book: which of somebody
    // else's catalogs this device had kept. On a one-book bundle it would mean
    // that restoring a single export — or taking a book back out of the trash —
    // queued a download of eighty thousand Gutenberg rows.
    catalogs: bookIds ? undefined : await keptCatalogs(),
  };

  at = performance.now();
  const json = JSON.stringify(snapshot);
  trace(`stringify ${Math.round(performance.now() - at)}ms for ${json.length} chars`);
  at = performance.now();
  const about = aboutOf(books, snapshot.createdAt);
  const entries: Entry[] = [
    { path: ABOUT, bytes: strToU8(JSON.stringify(about)) },
    { path: SNAPSHOT, bytes: strToU8(json) },
    ...(await readableEntries(books)),
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
    about,
  };
}

type Entry = { path: string; bytes: Uint8Array };

/**
 * What a person can read, in the same zip as what the app can restore.
 *
 * `snapshot.json` is one line of JSON a megabyte long: perfect for coming back
 * from, useless for looking at. These two are the answer to the deepest version
 * of the trust question — "will I still be able to read this in ten years" —
 * and they cost a few kilobytes on a bundle whose text is measured in
 * megabytes, so they are in every copy rather than behind a button nobody
 * knows to press.
 */
type Readable = Pick<BookRecord, 'book' | 'text' | 'chapters' | 'annotations'> & {
  tags?: string[];
};

export const LIBRARY_CSV = 'library.csv';

async function readableEntries(books: Readable[]): Promise<Entry[]> {
  const entries: Entry[] = [
    { path: LIBRARY_CSV, bytes: strToU8(libraryCsv(books.map(rowOf))) },
  ];
  // Two books can be called the same thing, and the second must not land on
  // the first: a notes file silently overwritten is the exact failure these
  // files exist to rule out.
  const taken = new Set<string>();
  for (const held of books) {
    if (!held.annotations.length) continue;
    const written = await annotationsMarkdownExporter.build({
      book: held.book,
      text: held.text,
      chapters: held.chapters,
      annotations: held.annotations,
    });
    const stem = safeFileName(held.book.title);
    let path = `notes/${stem}.md`;
    for (let copy = 2; taken.has(path); copy++) path = `notes/${stem} (${copy}).md`;
    taken.add(path);
    entries.push({ path, bytes: strToU8(String(written.body ?? '')) });
  }
  return entries;
}

function rowOf(held: Readable): LibraryRow {
  return {
    title: held.book.title,
    author: held.book.author,
    year: held.book.year,
    isbn: held.book.isbn,
    kind: held.book.kind,
    language: held.book.language,
    status: held.book.status,
    stars: held.book.stars,
    review: held.book.review,
    summary: held.book.summary,
    words: held.book.word_count,
    chapters: held.chapters.length,
    notes: held.annotations.filter((note) => note.kind === 'note').length,
    tags: held.tags,
    source_name: held.book.source_name,
    source_hash: held.book.source_hash,
    created_at: held.book.created_at,
    rated_at: held.book.rated_at,
  };
}

/**
 * The readable half on its own, for a reader who wants their library somewhere
 * that has never heard of this app. No manuscripts, no images, no JSON: the
 * table and the notes, which is what nothing else can give them back.
 */
export async function buildPlainCopy(): Promise<ExportFile> {
  const books: Readable[] = [];
  for (const id of await listBookIds()) {
    // Without the manuscript: a library's text is tens of megabytes and none of
    // it is in these files. The notes carry their own quotes.
    const record = await readBookRecord(id, { text: false });
    if (record) books.push(record);
    await yieldToUI();
  }
  return {
    fileName: bundleName('plain-novel-man'),
    mimeType: 'application/zip',
    body: await archive(await readableEntries(books)),
  };
}

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

async function withAssets(
  record: BookRecord,
  assets: Record<string, Uint8Array>
): Promise<BundledBook> {
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
  // Everything else that was drawn. Their rows travel with the book and point
  // at a file by name, so the bytes go under that same name and the rows
  // resolve on the other side without being rewritten.
  const pictures: string[] = [];
  const rows = (record.carried?.images ?? []) as { path?: unknown }[];
  for (let i = 0; i < rows.length; i++) {
    const name = imageName(typeof rows[i].path === 'string' ? (rows[i].path as string) : '');
    if (!name || assets[`assets/${name}`]) continue;
    const bytes = readImage(name);
    if (!bytes) continue;
    assets[`assets/${name}`] = bytes;
    pictures.push(`assets/${name}`);
    // A book with dozens of drawn illustrations is the whole loop below by
    // itself — one of 139 on a real shelf took 2.5s of this, alone, with the
    // per-book yield outside doing nothing to help it.
    if (i % 4 === 3) await yieldToUI();
  }
  if (pictures.length) bundled.assets.pictures = pictures;
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
