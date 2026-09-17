/**
 * What a book *is* decides what the app offers for it. A tutorial has no cast,
 * scripture has no scenes to storyboard, and offering either is worse than not
 * having the feature: it invites a paid pass that comes back with nonsense.
 *
 * Kinds are data, not branches — same shape as the vendor list. A new kind is
 * a row plus two catalog strings.
 */
export type BookFeature = 'cast' | 'scenes' | 'script' | 'visuals';

export type BookKind = {
  id: string;
  /** How a pass is told to think of what it is reading. */
  subject: string;
  /** Invented people or real ones — the difference a profile must not blur. */
  fiction: boolean;
  features: BookFeature[];
};

/**
 * Scripture and nonfiction keep people and places — real figures are exactly
 * what gets looked up while reading — but lose the fiction machinery: a scene
 * you could film, a screenplay, generated art. Instruction books keep none of
 * it; what they have instead is structure, terms and notes, which every kind
 * gets regardless.
 */
export const bookKinds: BookKind[] = [
  { id: 'novel', subject: 'a novel', fiction: true, features: ['cast', 'scenes', 'script', 'visuals'] },
  { id: 'scripture', subject: 'a work of scripture', fiction: false, features: ['cast'] },
  { id: 'nonfiction', subject: 'a work of nonfiction', fiction: false, features: ['cast'] },
  { id: 'tutorial', subject: 'an instructional book', fiction: false, features: [] },
  { id: 'textbook', subject: 'a textbook', fiction: false, features: [] },
];

/** A book that arrived through the share sheet was never asked, and novel is the app. */
export const DEFAULT_KIND = bookKinds[0].id;

export function kindOf(kind: string | null | undefined): BookKind {
  return bookKinds.find((entry) => entry.id === kind) ?? bookKinds[0];
}

export function supports(kind: string | null | undefined, feature: BookFeature): boolean {
  return kindOf(kind).features.includes(feature);
}
