import type { BookRecord } from '../db/repo';

export const BUNDLE_FORMAT = 'novel-man-bundle';
export const BUNDLE_VERSION = 3;
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
   * Written by builds that left the manuscripts out, and still read because
   * those bundles are still in people's iCloud folders: their books arrive
   * without text and wait for the file. Nothing writes it any more.
   */
  contentOmitted?: boolean;
};

export type BundledBook = BookRecord & {
  /** Paths inside the bundle, so a reader never touches a device path. */
  assets: { cover?: string; portraits: Record<string, string>; source?: string };
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
 * stamp leads — first when it was taken, then what it is for, then whose it
 * is: `2026-03-09-library-novel-man.zip`. A dated file is the only way to
 * answer "what did this look like in March" — a name that is overwritten all
 * month cannot, because by the time you ask, March has written over itself
 * thirty times.
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
  return `${dayStamp(at)}-${label}.${BUNDLE_EXTENSION}`;
}

/**
 * To the second, for the copies where a day is not enough to tell two apart:
 * emptying an already-empty library twice must not overwrite the first file.
 */
export function secondStamp(at = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}` +
    `${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`
  );
}

/**
 * The day a bundle is for, read back off its name. Bundles from the monthly
 * scheme before this one are still bundles, and still readable, so their names
 * are still understood — the first of that month.
 */
export function dateOf(name: string): Date | null {
  const second = /(?:^|[-/])(\d{4})(\d{2})(\d{2})\d{6}(?:\D|$)/.exec(name);
  if (second) {
    const at = new Date(Number(second[1]), Number(second[2]) - 1, Number(second[3]));
    return Number.isNaN(at.getTime()) || Number(second[2]) > 12 || Number(second[3]) > 31 ? null : at;
  }
  const day = /(?:^|[-/])(\d{4})-(\d{2})-(\d{2})(?:\D|$)/.exec(name);
  if (day) {
    const at = new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]));
    return Number.isNaN(at.getTime()) || Number(day[2]) > 12 || Number(day[3]) > 31 ? null : at;
  }
  const month = /(?:^|\/)(\d{4})(0[1-9]|1[0-2])-/.exec(name);
  return month ? new Date(Number(month[1]), Number(month[2]) - 1, 1) : null;
}
