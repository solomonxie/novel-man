import type { BookRecord } from '../db/repo';

export const BUNDLE_FORMAT = 'novel-man-bundle';
export const BUNDLE_VERSION = 2;
export const BUNDLE_EXTENSION = 'nmbak';

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

export function bundleName(label: string, at = new Date()): string {
  const stamp = at.toISOString().slice(0, 16).replace(/[:T]/g, '-');
  return `${label}-${stamp}.${BUNDLE_EXTENSION}`;
}
