import RNFSTurbo from 'react-native-fs-turbo';

import { base64, fromBase64 } from '../import/base64';

/**
 * `File` / `Directory` / `Paths`, the shape the app already writes against,
 * over a filesystem module that is not Expo's.
 *
 * The whole reason this is a shim and not a rewrite is that the API it stands
 * in for is synchronous — `if (f.exists) f.delete(); f.create(); f.write(x)`,
 * and helpers that hand back a `Directory` from a plain function. The module
 * underneath is JSI-backed and synchronous too, so the call sites are
 * untouched; anything async here would have spread through backup, iCloud,
 * export and import instead.
 *
 * Paths are POSIX inside and `file://` at the edges, because that is what the
 * database holds and what the pickers hand over.
 */

export const Paths = {
  get document(): string {
    return RNFSTurbo.DocumentDirectoryPath;
  },
  get cache(): string {
    return RNFSTurbo.CachesDirectoryPath;
  },
};

function pathOf(part: string | Entry): string {
  if (typeof part !== 'string') return part.path;
  if (!part.startsWith('file://')) return part;
  return decodeURI(part.slice('file://'.length));
}

function join(parts: (string | Entry)[]): string {
  return parts
    .map(pathOf)
    .join('/')
    .replace(/(?!^)\/{2,}/g, '/')
    .replace(/\/$/, '');
}

abstract class Entry {
  readonly path: string;

  constructor(...parts: (string | Entry)[]) {
    this.path = join(parts);
  }

  /** What the database and the pickers speak. */
  get uri(): string {
    return `file://${encodeURI(this.path)}`;
  }

  get name(): string {
    return this.path.slice(this.path.lastIndexOf('/') + 1);
  }

  get exists(): boolean {
    return RNFSTurbo.exists(this.path);
  }

  delete(): void {
    RNFSTurbo.unlink(this.path);
  }
}

export class File extends Entry {
  get size(): number {
    return this.exists ? RNFSTurbo.stat(this.path).size : 0;
  }

  /** An empty file, so a later `write` has somewhere to land. */
  create(): void {
    if (!this.exists) RNFSTurbo.writeFile(this.path, '', 'utf8');
  }

  write(contents: string | Uint8Array): void {
    if (typeof contents === 'string') RNFSTurbo.writeFile(this.path, contents, 'utf8');
    else RNFSTurbo.writeFile(this.path, base64(contents), 'base64');
  }

  textSync(): string {
    return RNFSTurbo.readFile(this.path, 'utf8');
  }

  text(): Promise<string> {
    return Promise.resolve(this.textSync());
  }

  // Base64 rather than the module's `uint8`, which hands back a plain number[]
  // — a manuscript is megabytes, and that is millions of boxed JS numbers.
  bytesSync(): Uint8Array {
    return fromBase64(RNFSTurbo.readFile(this.path, 'base64'));
  }

  bytes(): Promise<Uint8Array> {
    return Promise.resolve(this.bytesSync());
  }

  copy(target: File | Directory): void {
    const to = target instanceof Directory ? join([target, this.name]) : target.path;
    RNFSTurbo.copyFile(this.path, to);
  }
}

export class Directory extends Entry {
  // `mkdir` makes intermediates regardless, which is the only way it was
  // ever called here.
  create(_options?: { intermediates?: boolean }): void {
    if (!this.exists) RNFSTurbo.mkdir(this.path);
  }

  list(): (File | Directory)[] {
    // `true` asks for the shape whose `isDirectory` is a boolean rather
    // than a method.
    return RNFSTurbo.readDir(this.path, true).map((entry) =>
      entry.isDirectory ? new Directory(entry.path) : new File(entry.path)
    );
  }
}
