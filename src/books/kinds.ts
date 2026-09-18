/**
 * What a book *is* decides what the app offers for it. A tutorial has no cast,
 * scripture has no scenes to storyboard, and offering either is worse than not
 * having the feature: it invites a paid pass that comes back with nonsense.
 *
 * Kinds are data, not branches — same shape as the vendor list. A kind carries
 * what it is, where it can come from, what to ask before adding one, and which
 * sections its page has. A new kind is a row plus its catalog strings, not an
 * edit to every screen.
 */
export type BookFeature = 'cast' | 'scenes' | 'script' | 'visuals' | 'verses';

/** A door on the Add page. `scripture` is a preset source, not a file picker. */
export type BookSource = 'files' | 'link' | 'scripture';

/** A section of the book page, in the order the kind lists them. */
export type BookSection =
  | 'parts'
  | 'chapters'
  | 'scenes'
  | 'notes'
  | 'cast'
  | 'places'
  | 'translations'
  | 'script'
  | 'visuals';

export type BookKind = {
  id: string;
  /** How a pass is told to think of what it is reading. */
  subject: string;
  /** Invented people or real ones — the difference a profile must not blur. */
  fiction: boolean;
  features: BookFeature[];
  /** What sits above a chapter, when this kind has such a thing. */
  part?: 'book' | 'volume';
  sources: BookSource[];
  sections: BookSection[];
};

/**
 * Scripture and nonfiction keep people and places — real figures are exactly
 * what gets looked up while reading — but lose the fiction machinery: a scene
 * you could film, a screenplay, generated art. Instruction books keep none of
 * it; what they have instead is structure, terms and notes, which every kind
 * gets regardless.
 */
export const bookKinds: BookKind[] = [
  {
    id: 'novel',
    subject: 'a novel',
    fiction: true,
    features: ['cast', 'scenes', 'script', 'visuals'],
    part: 'volume',
    sources: ['files', 'link'],
    sections: ['chapters', 'scenes', 'notes', 'cast', 'places', 'translations', 'script', 'visuals'],
  },
  {
    id: 'nonfiction',
    subject: 'a work of nonfiction',
    fiction: false,
    features: ['cast'],
    sources: ['files', 'link'],
    sections: ['chapters', 'notes', 'cast', 'places', 'translations'],
  },
  {
    id: 'tutorial',
    subject: 'an instructional book',
    fiction: false,
    features: [],
    sources: ['files', 'link'],
    sections: ['chapters', 'notes', 'translations'],
  },
  {
    id: 'textbook',
    subject: 'a textbook',
    fiction: false,
    features: [],
    sources: ['files', 'link'],
    sections: ['chapters', 'notes', 'translations'],
  },
  {
    id: 'scripture',
    subject: 'a work of scripture',
    fiction: false,
    features: ['cast', 'verses'],
    part: 'book',
    // The file picker still works for a bible someone already has; the preset
    // source leads because nobody has a USFM zip lying around.
    sources: ['scripture', 'files', 'link'],
    // A bible is read in the edition it was installed as; retranslating one
    // is not what this app is for.
    sections: ['parts', 'chapters', 'notes', 'cast', 'places'],
  },
];

/** A book that arrived through the share sheet was never asked, and novel is the app. */
export const DEFAULT_KIND = bookKinds[0].id;

export function kindOf(kind: string | null | undefined): BookKind {
  return bookKinds.find((entry) => entry.id === kind) ?? bookKinds[0];
}

/**
 * Invented people are characters; real ones are people. Same section either
 * way — the word is what must not blur, on a bible least of all.
 */
export function castNoun(kind: string | null | undefined): 'characters' | 'people' {
  return kindOf(kind).fiction ? 'characters' : 'people';
}

export function supports(kind: string | null | undefined, feature: BookFeature): boolean {
  return kindOf(kind).features.includes(feature);
}

export function shows(kind: string | null | undefined, section: BookSection): boolean {
  return kindOf(kind).sections.includes(section);
}
