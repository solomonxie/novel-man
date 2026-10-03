import { isChinaStore } from '../store/storefront';
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
export type BookFeature =
  | 'cast'
  | 'terms'
  /**
   * A word, a phrase or a turn of speech the reader wants to keep. Every kind
   * has it, which is the one feature that is true of all of them: a name in
   * Judges, `Conway's law` in a design book, an idiom in a 武侠 novel. The
   * thing being collected is the language, and every book is made of it.
   */
  | 'words'
  | 'cards'
  | 'scenes'
  | 'script'
  | 'visuals'
  | 'verses';

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
  /** A library kept anywhere else, as long as its CSV carries our columns. */
  | 'csv'
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
  /** The reader's own vocabulary out of this book. */
  | 'words'
  /** Made rather than found: what the reader is trying to remember. */
  | 'cards'
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
    features: ['cast', 'terms', 'words', 'cards', 'scenes', 'script', 'visuals'],
    part: 'volume',
    sources: ['gutenberg', 'standardebooks', 'files', 'link', 'record', 'openlibrary', 'goodreads', 'csv'],
    sections: ['chapters', 'scenes', 'notes', 'cast', 'places', 'terms', 'words', 'cards', 'translations', 'script', 'visuals'],
  },
  {
    id: 'nonfiction',
    group: 'nonfiction',
    subject: 'a work of nonfiction',
    fiction: false,
    features: ['cast', 'terms', 'words', 'cards'],
    sources: ['gutenberg', 'standardebooks', 'files', 'link', 'record', 'openlibrary', 'goodreads', 'csv'],
    sections: ['chapters', 'notes', 'cast', 'places', 'terms', 'words', 'cards', 'translations'],
  },
  {
    // A tutorial and a textbook were two rows for one book: something you read
    // to learn from, with sections and notes and no cast. Gutenberg is not
    // offered for it — what it has of the genre is a century old.
    id: 'textbook',
    group: 'nonfiction',
    subject: 'an instructional book',
    fiction: false,
    // Cards began here, as the one kind read in order to be able to do
    // something afterwards. They are everywhere now: what a reader drills is
    // the vocabulary, and a 武侠 novel has more of it than a tutorial does.
    features: ['terms', 'words', 'cards'],
    sources: ['files', 'link', 'record', 'openlibrary', 'goodreads', 'csv'],
    sections: ['chapters', 'notes', 'terms', 'words', 'cards', 'translations'],
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
    features: ['words'],
    sources: ['arxiv', 'files', 'link', 'record'],
    sections: ['chapters', 'notes', 'words', 'translations'],
  },
  {
    id: 'scripture',
    group: 'scripture',
    subject: 'a work of scripture',
    fiction: false,
    // Scenes, because scripture has them: the ship, the storm, the lots, the
    // sea. What it does not have is paragraphs anyone can number — the words
    // are cited to a pass rather than sent — so a scene here starts at a verse.
    features: ['cast', 'terms', 'words', 'cards', 'verses', 'scenes'],
    part: 'book',
    // The file picker still works for a bible someone already has; the preset
    // source leads because nobody has a USFM zip lying around. A link covers
    // every edition no catalog is allowed to carry: paste a repository of one
    // and it is recognised as what it is. Nobody keeps a bible they have not
    // got, so there is no skeleton here.
    sources: ['ebible', 'files', 'link'],
    // A bible is read in the edition it was downloaded as; retranslating one
    // is not what this app is for.
    sections: ['parts', 'chapters', 'scenes', 'notes', 'cast', 'places', 'terms', 'words', 'cards'],
  },
];

/** A book that arrived through the share sheet was never asked, and novel is the app. */
export const DEFAULT_KIND = bookKinds[0].id;

/** The order the groups are offered in, and what is under each. Read fresh each call: the storefront resolves asynchronously, after this module has already loaded. */
export function kindGroups(): KindGroup[] {
  return isChinaStore() ? ['fiction', 'nonfiction'] : ['fiction', 'nonfiction', 'scripture'];
}

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

/**
 * What a catalog record says this is.
 *
 * An ISBN does not carry a kind — it names a printing, not a genre — so what
 * answers is the record the number fetches. Catalogs file books under
 * subjects, and the one distinction they carry reliably is made up or not: a
 * story gets a cast, scenes and a screenplay, an argument gets none of them,
 * and that is most of what the kind decides.
 *
 * Anything finer is guesswork these subjects cannot support. "Study and
 * teaching" is the exception worth taking, because a book somebody drills
 * themselves on is the one kind that wants flash cards. Everything else that
 * is not plainly fiction is answered `nonfiction`, and a reader who disagrees
 * changes it in one tap on the book's own page — which is the only reason
 * guessing at all is safe.
 */
export function kindFromSubjects(subjects: string[]): string | null {
  if (!subjects.length) return null;
  const said = subjects.join(' · ').toLowerCase();
  if (/\b(textbooks?|study and teaching|problems, exercises)\b/.test(said)) return 'textbook';
  if (/\bfiction\b|\bnovels?\b|\bstories\b/.test(said)) return 'novel';
  return 'nonfiction';
}
