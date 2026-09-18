import type { BookRecord } from '../db/repo';

export const BUNDLE_FORMAT = 'novel-man-bundle';
export const BUNDLE_VERSION = 2;
export const BUNDLE_EXTENSION = 'zip';
/** What the bundle was called before it was named for what it already was. */
export const LEGACY_EXTENSION = 'nmbak';

/** Either name opens: a backup taken by an older build is still a backup. */
export function isBundleName(name: string): boolean {
  return name.endsWith(`.${BUNDLE_EXTENSION}`) || name.endsWith(`.${LEGACY_EXTENSION}`);
}

/**
 * One versioned shape for every destination — a file you keep and a bucket you
 * own carry the same bytes, so a restore path never has to care where it came
 * from. No credential is ever a field here: keys live in the keychain and stay
 * on the device that made them.
 */
export type Snapshot = {
  format: typeof BUNDLE_FORMAT;
  version: number;
  createdAt: number;
  app: string;
  books: BundledBook[];
  /** App preferences. Never a credential: those live in the keychain. */
  settings?: Record<string, string>;
  /**
   * The manuscripts were left out. Everything the reader made — notes,
   * profiles, structure, progress — still travels, and re-importing the same
   * file puts it back on the book it belongs to.
   */
  contentOmitted?: boolean;
};

export type BundledBook = BookRecord & {
  /** Paths inside the bundle, so a reader never touches a device path. */
  assets: { cover?: string; portraits: Record<string, string> };
};

export class BundleError extends Error {
  constructor(public code: 'not-a-bundle' | 'too-new' | 'unreadable', public detail?: string) {
    super(code);
  }
}

export function validate(snapshot: unknown): Snapshot {
  const candidate = snapshot as Snapshot;
  if (!candidate || candidate.format !== BUNDLE_FORMAT) throw new BundleError('not-a-bundle');
  // A newer bundle may carry fields this build would silently drop on restore.
  if (candidate.version > BUNDLE_VERSION) throw new BundleError('too-new', String(candidate.version));
  if (!Array.isArray(candidate.books)) throw new BundleError('unreadable');
  return candidate;
}

/**
 * A month per file, and the month leads the name so a folder sorts itself.
 * Backups are written constantly — every note, every import, every chapter
 * that finishes analyzing — and a stamp to the minute turned any destination
 * into a wall of files nobody could pick from. A month is the unit someone
 * actually means by "the copy from before I broke it", and it caps a year at
 * twelve. The current month's file is overwritten in place; the months before
 * it stay as they were.
 *
 * Local time, because the month someone means is the one on their calendar.
 */
export function monthStamp(at = new Date()): string {
  return `${at.getFullYear()}${String(at.getMonth() + 1).padStart(2, '0')}`;
}

export function bundleName(label: string, at = new Date()): string {
  return `${monthStamp(at)}-${label}.${BUNDLE_EXTENSION}`;
}

/**
 * The month a bundle is for, read back off its name — the first of that month,
 * so it can be formatted in whatever language is on. Null for a bundle from
 * before backups were named this way, which is still a bundle.
 */
export function monthOf(name: string): Date | null {
  const match = /(?:^|\/)(\d{4})(0[1-9]|1[0-2])-/.exec(name);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, 1);
}
