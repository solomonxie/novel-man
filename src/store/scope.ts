import { isChinaStore } from './storefront';

/**
 * What this release offers beyond its core: turning a novel into a story
 * bible. App Review read the full set — bibles, preprints, a Goodreads
 * importer, flash cards — as a generic reader, so 1.0 ships focused. Books
 * already on the device keep whatever they have; only new doors close.
 */
export type Extra = 'scripture' | 'papers' | 'goodreads' | 'drills';

const HELD_BACK: Extra[] = ['scripture', 'papers', 'goodreads', 'drills'];

export function offers(extra: Extra): boolean {
  if (extra === 'scripture' && isChinaStore()) return false;
  return !HELD_BACK.includes(extra);
}
