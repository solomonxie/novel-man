import { listEntities } from '../db/repo';
import { listTerms, upsertTerm } from '../db/translation';

/**
 * Seeding links a mapping to the entity it came from, so renaming one is
 * traceable to the other. People, places and terms alike: a translation that
 * calls the ark three things is the failure this exists to prevent.
 */
export async function seedFromCast(bookId: string, target: string): Promise<number> {
  const existing = await listTerms(bookId, target);
  const known = new Set(existing.map((term) => term.source));
  let added = 0;
  for (const kind of ['character', 'place', 'term'] as const) {
    for (const entity of await listEntities(bookId, kind)) {
      if (known.has(entity.name)) continue;
      await upsertTerm({
        bookId,
        target,
        source: entity.name,
        // Empty until the author decides: a guessed name is worse than a blank.
        translation: '',
        entityId: entity.id,
      });
      added += 1;
    }
  }
  return added;
}
