import { Directory, File, Paths } from '../storage/fs';

import { dateOf } from './format';
import { isAuto, lastBackupAt } from './icloud';
import { isOverdue, lastAttempt } from './attempts';
import { trashCount } from './trash';
import { listConnections } from '../cloud/connections';
import { backedUpAt, libraryToken } from './changes';
import { hasBooks } from '../db/repo';

/**
 * Every copy of this library that exists at this moment, as a list somebody can
 * read.
 *
 * The app already took all of these — a snapshot before every migration, a
 * rolling daily bundle, a verified copy before a wipe or a restore, ten in
 * iCloud — and said so nowhere. Care nobody can see buys no trust at all: the
 * reader's question is not "is there a backup feature", it is "is my work
 * safe", and the only answer to that is the list of files, with their dates and
 * their sizes, and a way to open each one.
 */
export type CopyKind = 'daily' | 'database' | 'guard' | 'pre-deletion' | 'export' | 'other';

export type LocalCopy = {
  name: string;
  uri: string;
  bytes: number;
  /** Read off the name, which is where the promise was made. */
  at: number | null;
  kind: CopyKind;
};

const BACKUPS = 'Backups';
const EXPORTS = 'exports';

function kindOf(name: string): CopyKind {
  if (name.includes('-database-')) return 'database';
  if (name.includes('-daily-')) return 'daily';
  if (name.includes('-before-')) return 'guard';
  if (name.includes('-pre-deletion-')) return 'pre-deletion';
  return 'other';
}

function read(dir: Directory, kind?: CopyKind): LocalCopy[] {
  if (!dir.exists) return [];
  const found: LocalCopy[] = [];
  for (const entry of dir.list()) {
    if (!(entry instanceof File)) continue;
    const at = dateOf(entry.name);
    found.push({
      name: entry.name,
      uri: entry.uri,
      bytes: entry.size,
      at: at ? at.getTime() : null,
      kind: kind ?? kindOf(entry.name),
    });
  }
  // Newest first, and a file whose name carries no date is oldest by default
  // rather than first — it is the one nothing here promised anything about.
  return found.sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
}

/** The copies the app takes for itself, in the folder Files can open. */
export function localCopies(): LocalCopy[] {
  return read(new Directory(Paths.document, BACKUPS));
}

/** And the ones the reader asked for and kept, which are theirs, not ours. */
export function keptExports(): LocalCopy[] {
  return read(new Directory(Paths.document, EXPORTS), 'export');
}

export function totalBytes(copies: LocalCopy[]): number {
  return copies.reduce((sum, copy) => sum + copy.bytes, 0);
}

/**
 * The one line the shelf shows without opening anything. Deliberately cheap —
 * the database and a preference, never the ubiquity container, which takes
 * seconds and would make the settings list wait on iCloud to draw a row.
 */
export type CopiesState = {
  onPhone: number;
  icloudOn: boolean;
  icloudAt: number | null;
  /** Written since the last copy went up, and not tried again in an hour. */
  behind: boolean;
  /** What went wrong last time, where anything did. */
  failing: string | null;
  buckets: number;
  deleted: number;
  books: boolean;
};

export async function copiesState(): Promise<CopiesState> {
  const [icloudOn, icloudAt, icloud, local, buckets, deleted, books, token, mark] =
    await Promise.all([
      isAuto(),
      lastBackupAt(),
      lastAttempt('icloud'),
      lastAttempt('local'),
      listConnections(),
      trashCount(),
      hasBooks(),
      libraryToken(),
      backedUpAt('icloud'),
    ]);
  const failed = [icloud, local].find((attempt) => attempt && !attempt.ok);
  return {
    onPhone: localCopies().length,
    icloudOn,
    icloudAt,
    behind: books && icloudOn && mark !== token && isOverdue(icloud?.at ?? null),
    failing: failed?.error ?? null,
    buckets: buckets.length,
    deleted,
    books,
  };
}
