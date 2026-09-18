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
 * One file per day, named for the day, sorting chronologically because the
 * stamp leads. A dated file is the only way to answer "what did this look like
 * in March" — a name that is overwritten all month cannot, because by the time
 * you ask, March has written over itself thirty times.
 *
 * What bounds the count is retention, not the name: iCloud keeps the latest
 * few and prunes, a bucket keeps every one. See `backup-restore`.
 *
 * Local time, because the day someone means is the one on their calendar.
 */
export function dayStamp(at = new Date()): string {
  const month = String(at.getMonth() + 1).padStart(2, '0');
  const day = String(at.getDate()).padStart(2, '0');
  return `${at.getFullYear()}-${month}-${day}`;
}

export function bundleName(label: string, at = new Date()): string {
  return `${label}-${dayStamp(at)}.${BUNDLE_EXTENSION}`;
}

/**
 * The day a bundle is for, read back off its name. Bundles from the monthly
 * scheme before this one are still bundles, and still readable, so their names
 * are still understood — the first of that month.
 */
export function dateOf(name: string): Date | null {
  const day = /-(\d{4})-(\d{2})-(\d{2})(?:\D|$)/.exec(name);
  if (day) {
    const at = new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]));
    return Number.isNaN(at.getTime()) || Number(day[2]) > 12 || Number(day[3]) > 31 ? null : at;
  }
  const month = /(?:^|\/)(\d{4})(0[1-9]|1[0-2])-/.exec(name);
  return month ? new Date(Number(month[1]), Number(month[2]) - 1, 1) : null;
}
