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
  return matched ?? null;
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
