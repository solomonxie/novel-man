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
export type BookFeature = 'cast' | 'terms' | 'scenes' | 'script' | 'visuals' | 'verses';

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
  /** No file at all: a title, and a shelf entry to hang notes and a rating on. */
  | 'record'
  | 'openlibrary'
  | 'goodreads'
  | 'ebible'
  | 'repo'
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
  | 'terms'
  | 'translations'
  | 'script'
  | 'visuals';

/**
 * The heading a kind sits under when they are all listed. Two levels, because
 * a flat five reads as five unrelated things — the first question anybody
 * actually answers is "is it made up or not".
 */
export type KindGroup = 'fiction' | 'nonfiction' | 'scripture';

export type BookKind = {
  id: string;
  group: KindGroup;
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
    group: 'fiction',
    subject: 'a novel',
    fiction: true,
    features: ['cast', 'terms', 'scenes', 'script', 'visuals'],
    part: 'volume',
    sources: ['gutenberg', 'standardebooks', 'files', 'link', 'record', 'openlibrary', 'goodreads'],
    sections: ['chapters', 'scenes', 'notes', 'cast', 'places', 'terms', 'translations', 'script', 'visuals'],
  },
  {
    id: 'nonfiction',
    group: 'nonfiction',
    subject: 'a work of nonfiction',
    fiction: false,
    features: ['cast', 'terms'],
    sources: ['gutenberg', 'standardebooks', 'files', 'link', 'record', 'openlibrary', 'goodreads'],
    sections: ['chapters', 'notes', 'cast', 'places', 'terms', 'translations'],
  },
  {
    // A tutorial and a textbook were two rows for one book: something you read
    // to learn from, with sections and notes and no cast. Gutenberg is not
    // offered for it — what it has of the genre is a century old.
    id: 'textbook',
    group: 'nonfiction',
    subject: 'an instructional book',
    fiction: false,
    features: ['terms'],
    sources: ['files', 'link', 'record', 'openlibrary', 'goodreads'],
    sections: ['chapters', 'notes', 'terms', 'translations'],
  },
  {
    id: 'paper',
    group: 'nonfiction',
    subject: 'an academic paper',
    fiction: false,
    reads: 'argument',
    unit: 'section',
    // No cast, no scenes: the people in a paper are its authors, and they are
    // on the cover rather than in the text.
    features: [],
    sources: ['arxiv', 'files', 'link', 'record'],
    sections: ['chapters', 'notes', 'translations'],
  },
  {
    id: 'scripture',
    group: 'scripture',
    subject: 'a work of scripture',
    fiction: false,
    // Scenes, because scripture has them: the ship, the storm, the lots, the
    // sea. What it does not have is paragraphs anyone can number — the words
    // are cited to a pass rather than sent — so a scene here starts at a verse.
    features: ['cast', 'terms', 'verses', 'scenes'],
    part: 'book',
    // The file picker still works for a bible someone already has; the preset
    // source leads because nobody has a USFM zip lying around. A link covers
    // every edition no catalog is allowed to carry: paste a repository of one
    // and it is recognised as what it is. Nobody keeps a bible they have not
    // got, so there is no skeleton here.
    sources: ['ebible', 'files', 'link'],
    // A bible is read in the edition it was downloaded as; retranslating one
    // is not what this app is for.
    sections: ['parts', 'chapters', 'scenes', 'notes', 'cast', 'places', 'terms'],
  },
];

/** A book that arrived through the share sheet was never asked, and novel is the app. */
export const DEFAULT_KIND = bookKinds[0].id;

/** The order the groups are offered in, and what is under each. */
export const kindGroups: KindGroup[] = ['fiction', 'nonfiction', 'scripture'];

export function kindsIn(group: KindGroup): BookKind[] {
  return bookKinds.filter((kind) => kind.group === group);
}

export function kindOf(kind: string | null | undefined): BookKind {
  return bookKinds.find((entry) => entry.id === kind) ?? bookKinds[0];
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
