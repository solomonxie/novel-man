import type { ChapterInsert } from '../db/repo';

/**
 * How many chapters each book has, and what the books are called. Facts about
 * the shape of a bible rather than any edition of its text, which is what lets
 * this work for an edition the app is not allowed to hold: knowing that John
 * has 21 chapters is what makes "the chapter after this one" answerable
 * without asking anybody.
 */
export const CHAPTERS: Record<string, number> = {
  Genesis: 50, Exodus: 40, Leviticus: 27, Numbers: 36, Deuteronomy: 34,
  Joshua: 24, Judges: 21, Ruth: 4, '1 Samuel': 31, '2 Samuel': 24,
  '1 Kings': 22, '2 Kings': 25, '1 Chronicles': 29, '2 Chronicles': 36,
  Ezra: 10, Nehemiah: 13, Esther: 10, Job: 42, Psalms: 150, Proverbs: 31,
  Ecclesiastes: 12, 'Song of Solomon': 8, Isaiah: 66, Jeremiah: 52,
  Lamentations: 5, Ezekiel: 48, Daniel: 12, Hosea: 14, Joel: 3, Amos: 9,
  Obadiah: 1, Jonah: 4, Micah: 7, Nahum: 3, Habakkuk: 3, Zephaniah: 3,
  Haggai: 2, Zechariah: 14, Malachi: 4, Matthew: 28, Mark: 16, Luke: 24,
  John: 21, Acts: 28, Romans: 16, '1 Corinthians': 16, '2 Corinthians': 13,
  Galatians: 6, Ephesians: 6, Philippians: 4, Colossians: 4,
  '1 Thessalonians': 5, '2 Thessalonians': 3, '1 Timothy': 6, '2 Timothy': 4,
  Titus: 3, Philemon: 1, Hebrews: 13, James: 5, '1 Peter': 5, '2 Peter': 3,
  '1 John': 5, '2 John': 1, '3 John': 1, Jude: 1, Revelation: 22,
};

/** Some editions say Psalm 23 and some say Psalms 23; both mean the same book. */
const ALIASES: Record<string, string> = {
  psalm: 'Psalms',
  psalms: 'Psalms',
  'song of songs': 'Song of Solomon',
  canticles: 'Song of Solomon',
};

/**
 * The three-letter codes USFM, OSIS and USFX name their books by. An edition
 * published as data says `JHN` or `Gen` as often as it says John or Genesis,
 * and both are the same fact about the same book.
 */
const CODES: Record<string, string> = {
  GEN: 'Genesis', EXO: 'Exodus', LEV: 'Leviticus', NUM: 'Numbers', DEU: 'Deuteronomy',
  JOS: 'Joshua', JDG: 'Judges', RUT: 'Ruth', '1SA': '1 Samuel', '2SA': '2 Samuel',
  '1KI': '1 Kings', '2KI': '2 Kings', '1CH': '1 Chronicles', '2CH': '2 Chronicles',
  EZR: 'Ezra', NEH: 'Nehemiah', EST: 'Esther', JOB: 'Job', PSA: 'Psalms', PRO: 'Proverbs',
  ECC: 'Ecclesiastes', SNG: 'Song of Solomon', ISA: 'Isaiah', JER: 'Jeremiah',
  LAM: 'Lamentations', EZK: 'Ezekiel', DAN: 'Daniel', HOS: 'Hosea', JOL: 'Joel', AMO: 'Amos',
  OBA: 'Obadiah', JON: 'Jonah', MIC: 'Micah', NAM: 'Nahum', HAB: 'Habakkuk', ZEP: 'Zephaniah',
  HAG: 'Haggai', ZEC: 'Zechariah', MAL: 'Malachi', MAT: 'Matthew', MRK: 'Mark', LUK: 'Luke',
  JHN: 'John', ACT: 'Acts', ROM: 'Romans', '1CO': '1 Corinthians', '2CO': '2 Corinthians',
  GAL: 'Galatians', EPH: 'Ephesians', PHP: 'Philippians', COL: 'Colossians',
  '1TH': '1 Thessalonians', '2TH': '2 Thessalonians', '1TI': '1 Timothy', '2TI': '2 Timothy',
  TIT: 'Titus', PHM: 'Philemon', HEB: 'Hebrews', JAS: 'James', '1PE': '1 Peter',
  '2PE': '2 Peter', '1JN': '1 John', '2JN': '2 John', '3JN': '3 John', JUD: 'Jude',
  REV: 'Revelation',
};

const CODE_OF = new Map(Object.entries(CODES).map(([code, book]) => [book, code] as const));

export function codeOf(book: string): string {
  return CODE_OF.get(book) ?? book.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase();
}

/**
 * Whether the canon above is the right answer for a book with this title.
 *
 * The shape of a bible is a fact the app already holds, down to how many
 * chapters each book has, so a record of one has its contents from here rather
 * than from a model, which would charge for a less certain answer to a
 * question with a known one.
 *
 * The title has to carry this on its own: what the reader filed the book as
 * cannot be asked, because somebody who types "NIV Bible" on the Add page
 * leaves the kind at whatever it opened on. So a bible is a title naming a
 * translation, or the book itself and nothing else — which is what keeps The
 * Poisonwood Bible out, where a test for the word "bible" would not.
 *
 * The 66 are the Protestant canon, so an edition carrying the deuterocanon is
 * not one of these, and is left to be asked about instead.
 */
const EDITION = /\b(?:kjv|nkjv|niv|tniv|nasb|esv|nlt|nrsv|rsv|asv|csb|hcsb|web|ylt|net|erv|cev|gnt|amp)\b|\b(?:king james|new international|english standard|new living|new revised standard|revised standard|american standard|christian standard|good news|world english|young'?s literal)\b/i;
const WHOLE = /^(?:the\s+)?(?:holy\s+)?bible$|^(?:the\s+)?(?:old|new)\s+testament$/i;
const WIDER_CANON = /\b(?:catholic|douay|rheims|nabre|jerusalem|orthodox|apocrypha|deuterocanon\w*|vulgate|septuagint)\b/i;

export function isBible(title: string): boolean {
  const name = title.trim();
  if (WIDER_CANON.test(name)) return false;
  return WHOLE.test(name) || EDITION.test(name);
}

export type ChapterRef = { book: string; chapter: number };

/**
 * `John 3` is a chapter; `John 3:16` is not. The difference matters because
 * this only decides what to fetch *around* what is being read, and somebody
 * who asked for one verse did not ask for the two chapters either side of it.
 */
export function parseChapterRef(reference: string): ChapterRef | null {
  const found = /^\s*(.+?)\s+(\d+)\s*$/.exec(reference);
  if (!found) return null;
  const book = bookNamed(found[1]);
  if (!book) return null;
  const chapter = Number(found[2]);
  return chapter >= 1 && chapter <= CHAPTERS[book] ? { book, chapter } : null;
}

export function bookNamed(name: string): string | null {
  const cleaned = name.trim().replace(/\s+/g, ' ');
  if (CHAPTERS[cleaned]) return cleaned;
  const lowered = cleaned.toLowerCase();
  if (ALIASES[lowered]) return ALIASES[lowered];
  const matched = Object.keys(CHAPTERS).find((book) => book.toLowerCase() === lowered);
  if (matched) return matched;
  if (CODES[cleaned.toUpperCase()]) return CODES[cleaned.toUpperCase()];
  // `Gen`, `Exod`, `1Sam`, `Matt` — an abbreviation is an answer only while it
  // names one book. `Phil` is Philippians and Philemon, so it names neither.
  const squashed = lowered.replace(/[^a-z0-9]/g, '');
  if (squashed.length < 2) return null;
  const starting = Object.keys(CHAPTERS).filter((book) =>
    book.toLowerCase().replace(/[^a-z0-9]/g, '').startsWith(squashed)
  );
  return starting.length === 1 ? starting[0] : null;
}

/**
 * The chapter before and the chapter after, inside the same book. A reader who
 * reaches the end of John is not usually about to start Acts by accident, and
 * a guess that fetches across a boundary is a request nobody wanted.
 */
export function neighbouringChapters(reference: string): string[] {
  const found = parseChapterRef(reference);
  if (!found) return [];
  const last = CHAPTERS[found.book];
  return [found.chapter - 1, found.chapter + 1]
    .filter((chapter) => chapter >= 1 && chapter <= last)
    .map((chapter) => `${found.book} ${chapter}`);
}

/**
 * Every chapter of the canon as a row, in order, each under the book it
 * belongs to. This is what lets a bible exist on the shelf before a word of it
 * has been fetched: the structure is a fact, and only the text is licensed.
 */
export function canonChapters(): ChapterInsert[] {
  const chapters: ChapterInsert[] = [];
  Object.entries(CHAPTERS).forEach(([book, count], part) => {
    for (let chapter = 1; chapter <= count; chapter++) {
      // The reference is the title, and the title is how it is asked for.
      chapters.push({
        title: `${book} ${chapter}`,
        start: 0,
        end: 0,
        confident: true,
        part_idx: part,
        part_title: book,
      });
    }
  });
  return chapters;
}
