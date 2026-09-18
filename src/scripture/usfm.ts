import type { Block } from '../import/types';

/**
 * USFM is what a bible is published as: one file per book, `\c` for a chapter,
 * `\v` for a verse, and the book's own names in `\toc1`/`\toc2`/`\toc3`. All of
 * it is stated, so nothing here detects anything — the structure arrived with
 * the text, which is the whole reason this format is the one we fetch.
 */
export type UsfmBook = {
  /** The three-letter code in `\id`: JHN, GEN. */
  code: string;
  /** What this edition calls it: 约翰福音, John. */
  name: string;
  /** Long, short and abbreviated forms — every way a reference might spell it. */
  names: string[];
  chapters: UsfmChapter[];
};

export type UsfmChapter = { number: number; verses: { number: number; text: string }[] };

/** One verse is one block: the offsets a verse needs are then the block's own. */
export type PlacedVerse = { part: number; chapter: number; number: number; block: number };

export type UsfmStructure = {
  blocks: Block[];
  /** Chapter marks, in reading order, pointing at the block each starts on. */
  chapters: { part: number; partName: string; number: number; block: number }[];
  verses: PlacedVerse[];
  parts: { idx: number; name: string; names: string[] }[];
};

/**
 * Markers whose content is not the text: a footnote, a cross-reference and the
 * study apparatus around them. Dropped rather than rendered, because a bible
 * read with its footnotes inline is not a bible anyone reads.
 */
const DROPPED = /\\(f|fe|x)\s.*?\\\1\*/g;
/** `\w word|strong="G1722"\w*` is a word with a dictionary key stapled to it. */
const ATTRIBUTED = /\\\+?(\w+)\s([^\\|]*?)(\|[^\\]*?)?\\\+?\1\*/g;
const REMAINING = /\\[a-z]+\d*\*?\s?/gi;
/**
 * The KJV prints a pilcrow where a paragraph begins, and eBible's edition
 * carries 2,970 of them as literal text rather than markup. The `\p` that
 * precedes them says the same thing in the markup, and a reader that already
 * puts each verse on its own line says it in the layout — so on the page it is
 * a character with nothing left to mean.
 */
const PILCROW = /¶\s*/g;

export function cleanLine(line: string): string {
  let text = line;
  for (let pass = 0; pass < 3 && DROPPED.test(text); pass++) text = text.replace(DROPPED, '');
  for (let pass = 0; pass < 3; pass++) {
    const next = text.replace(ATTRIBUTED, '$2');
    if (next === text) break;
    text = next;
  }
  return text.replace(REMAINING, '').replace(PILCROW, '').replace(/\s+/g, ' ').trim();
}

/**
 * Markers whose content is a heading about the text rather than the text: a
 * section title, its cross-reference line, a speaker, Psalm 119's `ב BETH.`.
 * They are not verse text and they are not the next verse's either, so they
 * are dropped — appending them put the next section's title on the end of the
 * verse before it.
 */
const HEADINGS = new Set([
  's', 's1', 's2', 's3', 's4', 'ms', 'ms1', 'ms2', 'ms3',
  'mr', 'sr', 'r', 'sp', 'qa', 'd', 'cl', 'cp', 'ca', 'va', 'vp', 'rem',
]);

/** One file. Returns null for front matter, glossaries and anything chapterless. */
export function parseUsfm(source: string): UsfmBook | null {
  const book: UsfmBook = { code: '', name: '', names: [], chapters: [] };
  let chapter: UsfmChapter | null = null;
  let verse: { number: number; text: string } | null = null;

  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const marker = /^\\(\w+\d*)\s?([\s\S]*)$/.exec(line);
    if (!marker) {
      // A wrapped line belongs to the verse it continues.
      if (verse) verse.text += ` ${cleanLine(line)}`;
      continue;
    }
    const [, tag, rest] = marker;

    if (tag === 'id') {
      book.code = rest.trim().slice(0, 3).toUpperCase();
    } else if (tag === 'h' || tag === 'toc1' || tag === 'toc2' || tag === 'toc3') {
      const name = cleanLine(rest);
      if (!name) continue;
      if (tag === 'toc2' || (tag === 'h' && !book.name)) book.name = name;
      if (!book.names.includes(name)) book.names.push(name);
    } else if (tag === 'c') {
      const number = Number.parseInt(rest, 10);
      if (!Number.isInteger(number)) continue;
      chapter = { number, verses: [] };
      verse = null;
      book.chapters.push(chapter);
    } else if (tag === 'v') {
      const split = /^(\d+)(?:-\d+)?\s?([\s\S]*)$/.exec(rest.trim());
      if (!split || !chapter) continue;
      verse = { number: Number.parseInt(split[1], 10), text: cleanLine(split[2]) };
      chapter.verses.push(verse);
    } else if (HEADINGS.has(tag)) {
      continue;
    } else if (verse) {
      // A poetry line or a paragraph break inside a verse is still that verse.
      const text = cleanLine(rest);
      if (text) verse.text += ` ${text}`;
    }
  }

  if (!book.chapters.length) return null;
  if (!book.name) book.name = book.code;
  if (!book.names.includes(book.name)) book.names.unshift(book.name);
  return book;
}

/**
 * Every book of the edition, in the order its files were published, flattened
 * into the shape the import pipeline already speaks: blocks of text, plus the
 * marks that say which block is where. A verse is a block of its own — the
 * layout a bible is usually printed in, and the one that makes a verse's
 * offsets its block's offsets rather than a search inside a paragraph.
 */
export function layoutBible(books: UsfmBook[]): UsfmStructure {
  const structure: UsfmStructure = { blocks: [], chapters: [], verses: [], parts: [] };

  books.forEach((book, part) => {
    structure.parts.push({ idx: part, name: book.name, names: book.names });
    for (const chapter of book.chapters) {
      if (!chapter.verses.length) continue;
      structure.chapters.push({
        part,
        partName: book.name,
        number: chapter.number,
        block: structure.blocks.length,
      });
      for (const verse of chapter.verses) {
        if (!verse.text) continue;
        structure.verses.push({
          part,
          chapter: chapter.number,
          number: verse.number,
          block: structure.blocks.length,
        });
        structure.blocks.push({ text: verse.text });
      }
    }
  });

  return structure;
}

/** `02-GENengwebp.usfm` sorts before `03-EXO…`: the canon's own order. */
export function inCanonOrder(names: string[]): string[] {
  return [...names].sort((a, b) => a.localeCompare(b, 'en'));
}
