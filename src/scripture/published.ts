import { attr, decodeEntities, stripTags } from '../import/xml';
import { bookNamed, CHAPTERS, codeOf } from './canon';
import type { UsfmBook, UsfmChapter } from './usfm';

/**
 * A bible published as data rather than as USFM. Repositories carry these by
 * the hundred, in a handful of layouts that all state the same three things:
 * which book, which chapter, which verse.
 *
 * Nothing here knows any repository. A file is offered to each reader in turn
 * and the first whose result is *a bible* wins — so a layout this does not
 * know is a file it declines, never a file it mangles into sixty-six books
 * named after the canon it was counting through.
 */
export type BibleShape = 'one-book' | 'book-list' | 'verse-rows' | 'keyed-books' | 'xml';

export type Reading =
  | { ok: true; shape: BibleShape; title?: string; books: UsfmBook[] }
  /** `shape`: no reader recognised it. `canon`: one did, and it is not a bible. */
  | { ok: false; why: 'shape' | 'canon' };

/** What a reader gets to: the text, and whatever the file said about the book. */
type RawBook = { stated?: string; index: number; chapters: UsfmChapter[] };
type Attempt = { shape: BibleShape; title?: string; raw: RawBook[] };

const CANON = Object.keys(CHAPTERS);

/**
 * The extension says which family to try first and nothing more: a `.json`
 * that is really XML is still read, it is just read second.
 */
export function readBible(source: string, path = ''): Reading {
  const body = source.replace(/^﻿/, '');
  const xmlFirst = /\.xml$/i.test(path) || body.trimStart().startsWith('<');
  const order = xmlFirst ? [fromXml, fromJson] : [fromJson, fromXml];

  let understood = false;
  for (const family of order) {
    for (const attempt of family(body)) {
      if (!attempt.raw.length) continue;
      understood = true;
      const books = assemble(attempt.raw, path);
      if (books) return { ok: true, shape: attempt.shape, title: attempt.title, books };
    }
  }
  return { ok: false, why: understood ? 'canon' : 'shape' };
}

/*
 * The JSON layouts, most specific first:
 *
 *   { translation, books: [ { name, chapters: […] } ] }     book-list
 *   { book, chapters: [{ chapter, verses: [{ verse, text }] }] }  one-book
 *   [ { book_name, chapter, verse, text }, … ]              verse-rows
 *   { "Genesis": { "1": { "1": "…" } } }                    keyed-books
 *
 * A layout is tried when it could fit, not when it must: two of these overlap
 * on some files, and which one was right is decided by what came out.
 */
function* fromJson(source: string): Generator<Attempt> {
  let root: unknown;
  try {
    root = JSON.parse(source);
  } catch {
    return;
  }
  const title = isPlainObject(root) ? text(root.translation ?? root.version)?.trim() : undefined;
  const list = Array.isArray(root) ? root : isPlainObject(root) && Array.isArray(root.books) ? root.books : null;

  if (list) {
    yield { shape: 'book-list', title, raw: booksFromList(list) };
    yield { shape: 'verse-rows', title, raw: booksFromRows(list) };
    return;
  }
  if (!isPlainObject(root)) return;
  if (root.chapters !== undefined) {
    yield { shape: 'one-book', title, raw: [rawBook(root, 0)] };
    return;
  }
  yield { shape: 'keyed-books', title, raw: booksFromKeys(root) };
}

function booksFromList(rows: unknown[]): RawBook[] {
  return rows.flatMap((row, at) => (isPlainObject(row) && row.chapters !== undefined ? [rawBook(row, at)] : []));
}

function rawBook(value: Record<string, unknown>, at: number): RawBook {
  const stated = text(value.book ?? value.name ?? value.book_name ?? value.bookName ?? value.abbrev);
  const stamped = numberOf(value.book_number ?? value.number);
  return { stated, index: stamped ? stamped - 1 : at, chapters: chaptersIn(value.chapters) };
}

/** One row per verse: what a database export of a bible looks like. */
function booksFromRows(rows: unknown[]): RawBook[] {
  const books: RawBook[] = [];
  const byKey = new Map<string, RawBook>();
  const byChapter = new Map<string, UsfmChapter>();
  for (const row of rows) {
    if (!isPlainObject(row) || row.chapters !== undefined) continue;
    const line = clean(text(row.text ?? row.verse_text ?? row.content) ?? '');
    if (!line) continue;
    const stated = text(row.book_name ?? row.book ?? row.name ?? row.bookName);
    const stamped = numberOf(row.book_number ?? row.book_id);
    if (!stated && !stamped) continue;
    const key = stated ?? `#${stamped}`;
    let book = byKey.get(key);
    if (!book) {
      book = { stated, index: stamped ? stamped - 1 : books.length, chapters: [] };
      byKey.set(key, book);
      books.push(book);
    }
    const number = numberOf(row.chapter ?? row.chapter_number) ?? 1;
    const at = `${key}:${number}`;
    let chapter = byChapter.get(at);
    if (!chapter) {
      chapter = { number, verses: [] };
      byChapter.set(at, chapter);
      book.chapters.push(chapter);
    }
    chapter.verses.push({
      number: numberOf(row.verse ?? row.verse_number) ?? chapter.verses.length + 1,
      text: line,
    });
  }
  return books;
}

/** The book is the key: `{ "Genesis": … }`. Only where every key is one. */
function booksFromKeys(root: Record<string, unknown>): RawBook[] {
  const entries = Object.entries(root).filter(([, value]) => isPlainObject(value) || Array.isArray(value));
  if (entries.length < 2) return [];
  return entries.map(([name, value], at) => ({
    stated: name,
    index: at,
    chapters: chaptersIn(value),
  }));
}

function chaptersIn(value: unknown): UsfmChapter[] {
  if (Array.isArray(value)) return value.flatMap((entry, at) => keep(chapterFrom(entry, at + 1)));
  if (isPlainObject(value)) {
    return Object.entries(value)
      .flatMap(([key, entry]) => keep(chapterFrom(entry, Number.parseInt(key, 10))))
      .sort((a, b) => a.number - b.number);
  }
  return [];
}

function chapterFrom(entry: unknown, fallback: number): UsfmChapter | null {
  if (!Number.isFinite(fallback) || fallback < 1) return null;
  if (Array.isArray(entry)) {
    const verses = versesIn(entry);
    return verses.length ? { number: fallback, verses } : null;
  }
  if (!isPlainObject(entry)) return null;
  const number = numberOf(entry.chapter ?? entry.number ?? entry.num) ?? fallback;
  // A chapter that lists its verses under no key of its own *is* the list.
  const verses = versesIn(entry.verses ?? entry.verse ?? entry);
  return verses.length ? { number, verses } : null;
}

function versesIn(value: unknown): { number: number; text: string }[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, at) => {
      if (typeof entry === 'string') {
        const line = clean(entry);
        return line ? [{ number: at + 1, text: line }] : [];
      }
      if (!isPlainObject(entry)) return [];
      const line = clean(text(entry.text ?? entry.content ?? entry.value) ?? '');
      if (!line) return [];
      return [{ number: numberOf(entry.verse ?? entry.number ?? entry.num) ?? at + 1, text: line }];
    });
  }
  if (isPlainObject(value)) {
    return Object.entries(value)
      .flatMap(([key, entry]) => {
        const at = Number.parseInt(key, 10);
        const line = typeof entry === 'string' ? clean(entry) : '';
        return at >= 1 && line ? [{ number: at, text: line }] : [];
      })
      .sort((a, b) => a.number - b.number);
  }
  return [];
}

/*
 * XML. Some layouts nest their books, chapters and verses; others mark where
 * each begins and close nothing. Reading either as *boundaries* rather than as
 * containers covers both with one pass: a verse's text runs from its own tag
 * to whatever tag comes next, and the closing tags a nested layout leaves in
 * between are stripped like any other markup.
 */
const LEVEL: Record<string, number> = {
  book: 0, biblebook: 0, div: 0,
  chapter: 1, chap: 1, c: 1,
  verse: 2, vers: 2, v: 2,
};

type Mark = {
  level: number;
  start: number;
  from: number;
  /** An end milestone opens nothing — it says only where the last one stopped. */
  closing?: boolean;
  number?: number;
  name?: string;
};

function* fromXml(source: string): Generator<Attempt> {
  const marks = marksIn(source);
  if (!marks.length) return;
  const raw: RawBook[] = [];
  let open: RawBook | null = null;
  let chapter: UsfmChapter | null = null;

  for (let at = 0; at < marks.length; at++) {
    const mark = marks[at];
    if (mark.closing) continue;
    if (mark.level === 0) {
      open = { stated: mark.name, index: (mark.number ?? raw.length + 1) - 1, chapters: [] };
      raw.push(open);
      chapter = null;
    } else if (mark.level === 1) {
      if (!open) {
        open = { index: raw.length, chapters: [] };
        raw.push(open);
      }
      chapter = { number: mark.number ?? open.chapters.length + 1, verses: [] };
      open.chapters.push(chapter);
    } else if (chapter) {
      const end = at + 1 < marks.length ? marks[at + 1].start : source.length;
      const line = verseText(source.slice(mark.from, end));
      if (line) chapter.verses.push({ number: mark.number ?? chapter.verses.length + 1, text: line });
    }
  }
  yield { shape: 'xml', title: editionTitle(source), raw };
}

/** One scan, by hand: a regex over five million characters is not free in Hermes. */
function marksIn(source: string): Mark[] {
  const marks: Mark[] = [];
  let cursor = 0;
  while (true) {
    const open = source.indexOf('<', cursor);
    if (open < 0) return marks;
    cursor = open + 1;
    const next = source.charCodeAt(open + 1);
    // `</x`, `<!--` and `<?xml` open nothing.
    if (next === 47 || next === 33 || next === 63) continue;
    let end = open + 1;
    while (end < source.length) {
      const code = source.charCodeAt(end);
      if (code === 32 || code === 9 || code === 10 || code === 13 || code === 62 || code === 47) break;
      end += 1;
    }
    const level = LEVEL[source.slice(open + 1, end).toLowerCase()];
    if (level === undefined) continue;
    const close = source.indexOf('>', end);
    if (close < 0) return marks;
    cursor = close + 1;
    const tag = source.slice(open, close + 1);
    // OSIS says `div`, and most of its divs are sections rather than books.
    if (tag.startsWith('<div') && attr(tag, 'type') !== 'book') continue;
    const closing = Boolean(attr(tag, 'eID') ?? attr(tag, 'eid'));
    marks.push({
      level,
      start: open,
      from: close + 1,
      closing,
      number: closing ? undefined : numberIn(tag),
      name: !closing && level === 0 ? nameIn(tag) : undefined,
    });
  }
}

/** Footnotes, cross-references and section titles are about the text, not it. */
const ASIDE = /<(note|title|f|x|rem)\b[^>]*>[\s\S]*?<\/\1>/gi;

function verseText(chunk: string): string {
  return clean(decodeEntities(stripTags(chunk.replace(ASIDE, ''))));
}

function numberIn(tag: string): number | undefined {
  for (const name of ['number', 'bnumber', 'cnumber', 'vnumber', 'num', 'n', 'id']) {
    const found = numberOf(attr(tag, name));
    if (found) return found;
  }
  // `osisID="Gen.1.1"` states the book, the chapter and the verse at once.
  const osis = attr(tag, 'osisID') ?? attr(tag, 'osisid');
  return osis ? numberOf(osis.split('.').pop()) : undefined;
}

function nameIn(tag: string): string | undefined {
  for (const name of ['bname', 'bsname', 'name', 'title']) {
    const found = attr(tag, name)?.trim();
    if (found) return found;
  }
  const osis = (attr(tag, 'osisID') ?? attr(tag, 'osisid'))?.split('.')[0];
  if (osis) return osis;
  const id = attr(tag, 'id')?.trim();
  return id && /[A-Za-z]/.test(id) ? id : undefined;
}

function editionTitle(source: string): string | undefined {
  const head = source.slice(0, 1500);
  return (attr(head, 'translation') ?? attr(head, 'biblename'))?.trim() || undefined;
}

/*
 * Naming, and the check that decides whether any of it was a bible.
 *
 * A book states its name, or its code, or nothing but its place. The place is
 * the dangerous one: taken on trust it turns any list of sixty-six things into
 * the canon. So a place is accepted only where the book at it has exactly the
 * number of chapters that book has — Genesis has fifty, and a first entry with
 * forty is not Genesis — and only where two or more agree, because one list of
 * fifty anythings is not evidence of a bible.
 */
function assemble(raw: RawBook[], path?: string): UsfmBook[] | null {
  const named = raw.map((book) => bookNamed(book.stated ?? '') ?? fromFile(raw, path));
  const placed = raw.map((book, at) => {
    if (named[at]) return null;
    const expected = CANON[book.index];
    return expected && book.chapters.length === CHAPTERS[expected] ? expected : null;
  });

  /*
   * Is this collection the canon, in order? An entry agrees when the book at
   * its place is the one it says it is, or — saying nothing — has exactly that
   * book's number of chapters. A few coincidences are not agreement: four
   * books of the canon have three chapters, so any list of sixty-six
   * three-chapter things lines up with four of them. It has to be most of it.
   */
  const agreeing = raw.filter((book, at) =>
    named[at] ? named[at] === CANON[book.index] : Boolean(placed[at])
  ).length;
  const ordered = agreeing >= 2 && agreeing >= raw.length * 0.75;
  if (!named.some(Boolean) && !ordered) return null;

  const books = raw.flatMap((book, at) => {
    const chapters = book.chapters.filter((chapter) => chapter.verses.length && chapter.number >= 1);
    if (!chapters.length) return [];
    // Position names a book only where that book's own chapters were there to
    // confirm it; anything else keeps whatever the file called it.
    const name =
      named[at] ??
      (ordered ? placed[at] : null) ??
      book.stated?.trim() ??
      stemOf(path ?? '') ??
      `${book.index + 1}`;
    return [{ code: codeOf(name), name, names: namesFor(name, book.stated), chapters }];
  });
  return isScripture(books) ? books : null;
}

/** A file named after a book is naming the book inside it — but only itself. */
function fromFile(raw: RawBook[], path?: string): string | null {
  return raw.length === 1 && path ? bookNamed(stemOf(path)) : null;
}

/**
 * The last gate, and the one that keeps a JSON file of something else off the
 * shelf. None of it is a guess about content: a book has chapters, a chapter
 * has verses, no book has more chapters than that book has, and at least one
 * of them is a book of the canon by name.
 */
function isScripture(books: UsfmBook[]): boolean {
  if (!books.length) return false;
  let chapters = 0;
  let verses = 0;
  let canonical = 0;
  for (const book of books) {
    if (!book.chapters.length) return false;
    const limit = CHAPTERS[book.name];
    if (limit) {
      canonical += 1;
      if (book.chapters.length > limit) return false;
      if (book.chapters.some((chapter) => chapter.number > limit)) return false;
    }
    for (const chapter of book.chapters) {
      chapters += 1;
      verses += chapter.verses.length;
    }
  }
  if (!canonical) return false;
  // A chapter of two verses exists; an edition averaging that does not.
  return verses / chapters >= 3;
}

function namesFor(name: string, stated: string | undefined): string[] {
  const trimmed = stated?.trim();
  return trimmed && trimmed !== name ? [name, trimmed] : [name];
}

function keep<T>(value: T | null): T[] {
  return value ? [value] : [];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  return typeof value === 'number' ? String(value) : undefined;
}

function numberOf(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function clean(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function stemOf(path: string): string {
  return decodeURIComponent(path.split('/').pop() ?? '').replace(/\.[a-z0-9]+$/i, '');
}
