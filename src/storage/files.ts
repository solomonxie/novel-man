import { Directory, File, Paths } from 'expo-file-system';
import * as Crypto from 'expo-crypto';

const SOURCES = 'sources';

function sourcesDir(): Directory {
  const dir = new Directory(Paths.document, SOURCES);
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

export function extensionOf(name: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(name.trim());
  return match ? match[1].toLowerCase() : '';
}

/**
 * Picker URIs are temporary and container UUIDs change on reinstall, so an
 * imported file is copied into app storage under a content hash before
 * anything else touches it.
 */
export async function adoptSourceFile(uri: string, originalName: string) {
  const picked = new File(uri);
  const bytes = await picked.bytes();
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    bytesFingerprint(bytes)
  );
  const ext = extensionOf(originalName);
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
