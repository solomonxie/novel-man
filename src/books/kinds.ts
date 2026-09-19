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

/**
 * A door on the Add page. Beside the two the reader brings something to —
 * a file, a link — a kind lists the public sources that carry books of that
 * kind: a bible from eBible, a novel from Gutenberg, a paper from arXiv. A
 * technical book written in a repository needs no source of its own: its url
 * is the book.
 */
export type BookSource =
  | 'files'
  | 'link'
  | 'ebible'
  | 'gutenberg'
  | 'standardebooks'
  | 'arxiv';

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
  /**
   * What reading it is for. A story is followed; an argument is weighed — so a
   * pass over a paper asks what is claimed and on what evidence, where a pass
   * over a novel asks who was there and what changed.
   */
  reads?: 'story' | 'argument';
  /** What this kind calls the level the reader turns. A paper has sections. */
  unit?: 'chapter' | 'section';
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
    sources: ['gutenberg', 'standardebooks', 'files', 'link'],
    sections: ['chapters', 'scenes', 'notes', 'cast', 'places', 'translations', 'script', 'visuals'],
  },
  {
    id: 'nonfiction',
    subject: 'a work of nonfiction',
    fiction: false,
    features: ['cast'],
    sources: ['gutenberg', 'standardebooks', 'files', 'link'],
    sections: ['chapters', 'notes', 'cast', 'places', 'translations'],
  },
  {
    // A tutorial and a textbook were two rows for one book: something you read
    // to learn from, with sections and notes and no cast. Gutenberg is not
    // offered for it — what it has of the genre is a century old.
    id: 'textbook',
    subject: 'an instructional book',
    fiction: false,
    features: [],
    sources: ['files', 'link'],
    sections: ['chapters', 'notes', 'translations'],
  },
  {
    id: 'paper',
    subject: 'an academic paper',
    fiction: false,
    reads: 'argument',
    unit: 'section',
    // No cast, no scenes: the people in a paper are its authors, and they are
    // on the cover rather than in the text.
    features: [],
    sources: ['arxiv', 'files', 'link'],
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
    sources: ['ebible', 'files', 'link'],
    // A bible is read in the edition it was downloaded as; retranslating one
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

/** `chapter` unless the kind says otherwise — a paper turns sections. */
export function unitOf(kind: string | null | undefined): 'chapter' | 'section' {
  return kindOf(kind).unit ?? 'chapter';
}

export function shows(kind: string | null | undefined, section: BookSection): boolean {
  return kindOf(kind).sections.includes(section);
}
