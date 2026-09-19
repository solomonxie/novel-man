import { Directory, File, Paths } from './fs';
import { sha256Hex } from '../cloud/sha256';
import { extensionOf } from './paths';

export { extensionOf };

const SOURCES = 'sources';

function sourcesDir(): Directory {
  const dir = new Directory(Paths.document, SOURCES);
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/**
 * Picker URIs are temporary and container UUIDs change on reinstall, so an
 * imported file is copied into app storage under a content hash before
 * anything else touches it.
 */
export async function adoptSourceFile(uri: string, originalName: string) {
  const picked = new File(uri);
  const bytes = await picked.bytes();
  const hash = sha256Hex(bytesFingerprint(bytes));
  const ext = extensionOf(originalName);
  const stored = new File(sourcesDir(), ext ? `${hash}.${ext}` : hash);
  if (!stored.exists) stored.write(bytes);
  return { hash, path: stored.uri, size: stored.size, bytes };
}

/** The same shelf, for a file the app fetched rather than one someone picked. */
export async function storeSourceBytes(bytes: Uint8Array, name: string) {
  const hash = sha256Hex(bytesFingerprint(bytes));
  const ext = extensionOf(name);
  const stored = new File(sourcesDir(), ext ? `${hash}.${ext}` : hash);
  if (!stored.exists) stored.write(bytes);
  return { hash, path: stored.uri, size: stored.size, bytes };
}

export function openStored(path: string, hash: string, ext: string): File {
  const direct = new File(path);
  if (direct.exists) return direct;
  // Container UUIDs change on reinstall; re-find under the current app dir.
  return new File(sourcesDir(), ext ? `${hash}.${ext}` : hash);
}

export function deleteStored(path: string) {
  const file = new File(path);
  if (file.exists) file.delete();
}

/** Hashing megabytes of base64 is slow; sample the file instead. */
function bytesFingerprint(bytes: Uint8Array): string {
  const stride = Math.max(1, Math.floor(bytes.length / 4096));
  let out = `${bytes.length}:`;
  for (let i = 0; i < bytes.length; i += stride) out += bytes[i].toString(36);
  return out;
}

const IMAGES = 'images';

function imagesDir(): Directory {
  const dir = new Directory(Paths.document, IMAGES);
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/**
 * A picked image lives in a cache the OS may empty, so a cover or portrait is
 * copied into app storage before its path is written to the database — and
 * that copy is also what a backup bundle can carry.
 */
export function adoptImage(uri: string, hint = 'img'): string {
  const source = new File(uri);
  if (!source.exists) return uri;
  const ext = extensionOf(uri) || 'jpg';
  const target = new File(imagesDir(), `${hint}-${Date.now().toString(36)}.${ext}`);
  source.copy(target);
  return target.uri;
}

export function readImage(path: string): Uint8Array | null {
  const file = new File(path);
  return file.exists ? file.bytesSync() : null;
}

export function writeImage(name: string, bytes: Uint8Array): string {
  const target = new File(imagesDir(), name);
  if (target.exists) target.delete();
  target.create();
  target.write(bytes);
  return target.uri;
}
