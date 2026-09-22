import type { Book, Chapter, Entity, Scene } from '../db/repo';
import { formatCount } from '../text/counts';
import { namesOf } from '../cast/mentions';
import { supports } from '../books/kinds';
import { isRecord } from '../books/record';
import { isBible } from '../scripture/canon';

/**
 * What a chapter pass is allowed to know. Everything here is cheap next to the
 * chapter itself, and each piece earns its tokens: without the cast list the
 * model invents a new spelling of a name it has already met; without the
 * earlier briefs it re-explains the plot to itself every chapter.
 *
 * The caps are the point. Context that grows with the book would make chapter
 * 400 cost five times chapter 4 for no extra accuracy.
 */
export const CAPS = {
  chapter: 12000,
  recentBriefs: 6,
  briefLength: 220,
  cast: 40,
  places: 25,
  terms: 40,
  summary: 900,
  recentScenes: 4,
};

export type ChapterContext = {
  book: Book;
  chapter: Chapter;
  chapters: Chapter[];
  characters: Entity[];
  places: Entity[];
  /** What the book has already named, so chapter forty spells it as chapter three did. */
  terms?: Entity[];
  text: string;
  /** The scenes of the chapter just before, so this one continues rather than restarts. */
  previousScenes?: Scene[];
  /** Present when the pass asks for scenes: the chapter goes out numbered. */
  paragraphs?: ChapterParagraph[];
  /** Present for scripture: what is cited in place of the text. */
  passage?: Passage;
};

export function chapterBody(text: string, chapter: Chapter): string {
  return text.slice(chapter.start, Math.min(chapter.end, chapter.start + CAPS.chapter));
}

/** The verses a scripture chapter covers, for citing it instead of sending it. */
export type Passage = { first: number; last: number };

/** Enough of a book to know whether there are words here to send. */
export type Citable = Pick<Book, 'kind' | 'word_count' | 'text_source'>;

/**
 * A book named rather than sent. Two of them qualify, for opposite reasons.
 * Scripture, because a kind that addresses itself by verse is a canonical text
 * every model has already read in every edition, not a manuscript this app has
 * to teach anyone. And a record — a book on the shelf with no words behind it —
 * because naming it is the only thing that *can* be sent.
 *
 * The difference is what the pass is allowed to do with it: scripture is
 * quoted back with the edition named, where a record is a published work the
 * model either knows or must refuse. See `passageBody`.
 */
export function citedNotSent(book: Citable): boolean {
  return supports(book.kind, 'verses') || isRecord(book);
}

/**
 * A book the model can already recite, word for word. Scripture is the only
 * one — every edition of it has been read by everything — and it counts here
 * whether it was filed as scripture or merely titled as an edition, because
 * somebody who types "KJV" on the Add page leaves the kind wherever it opened.
 *
 * It matters because a bible kept as a record has no words here either, and
 * being asked about Genesis 5 as though it were chapter five of a book nobody
 * can look up is how a model ends up saying it cannot place the chapter.
 */
export function quotable(book: Pick<Book, 'kind' | 'title'>): boolean {
  return supports(book.kind, 'verses') || isBible(book.title);
}

/**
 * The passage, named rather than sent. Genesis 5 is ~4,000 tokens of text this
 * app would otherwise pay to hand a model that can already recite it. The
 * edition is named because the wording is not the same in all of them, and the
 * model is told to say so rather than quietly answer about a different one.
 */
export function passageBody(book: Book, chapter: Chapter, passage?: Passage): string {
  if (!quotable(book)) return knownWorkBody(book, chapter);
  const reference = chapter.title.trim() || `${chapter.idx + 1}`;
  const verses = passage ? `${reference}:${passage.first}-${passage.last}` : reference;
  return [
    `Edition: ${book.title}`,
    `Passage: ${verses}`,
    passage ? `Verses: ${passage.last - passage.first + 1}` : '',
    'The text of this passage is not included. Read it from your own knowledge of this ' +
      'edition. Where your memory of the wording differs from this edition, say so ' +
      'rather than smoothing it over, and never supply a verse you are unsure of.',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * A book the app has no copy of, named for a model that may have read it. Every
 * word of this is about refusal: a model asked what happens in chapter twelve
 * of a book it has never heard of will write a chapter twelve, and an invented
 * plot filed under a real title is worse than an empty page — the reader cannot
 * tell which one they are looking at a month later. So it is told what it is
 * being asked about, told the app has nothing to check it against, and told to
 * stop rather than guess.
 */
export function knownWorkBody(book: Book, chapter: Chapter): string {
  const named = chapter.title.trim();
  const part = chapter.part_title?.trim();
  // Everything the shelf knows that says *which* chapter this is. Its own
  // line from the contents page is the one that does the work: "Chapter 7" of
  // a novel is a number a model cannot place, and "Chapter 7 — the crossing
  // of the Bug" is a chapter it either knows or honestly does not.
  const brief = chapter.brief?.trim();
  return [
    `Work: ${book.title}${book.author ? ` by ${book.author}` : ''}`,
    book.year ? `Published: ${book.year}` : '',
    `Language: ${book.language}`,
    `Chapter ${chapter.idx + 1}${named ? `: ${named}` : ''}${part ? ` (in ${part})` : ''}`,
    brief ? `What the contents say it covers: ${brief.slice(0, CAPS.briefLength)}` : '',
    'This app holds no copy of this book: none of its text is included here and ' +
      'none can be fetched, so do not ask for it and do not decline for want of ' +
      'it. Answer from your own knowledge of this published work, as far as that ' +
      'knowledge reaches and no further. If you do not know this book, or know it ' +
      'but cannot place this chapter within it, reply with exactly {"unknown":true} ' +
      'and nothing else. Never invent a plot, a name, an event or a chapter, and ' +
      'never answer about a different book with a similar title.',
  ]
    .filter(Boolean)
    .join('\n');
}

/** What the pass is given to read: the chapter itself, or the reference to it. */
export function chapterMaterial(
  book: Book,
  chapter: Chapter,
  text: string,
  passage?: Passage
): string {
  return citedNotSent(book) ? passageBody(book, chapter, passage) : chapterBody(text, chapter);
}

export type ChapterParagraph = { index: number; offset: number; text: string };

/**
 * A model cannot count characters, and asking it to quote the first words of a
 * scene fails the other way: it re-wraps and re-punctuates what it copies, so
 * the quote has to be found again by guesswork and most scenes are lost to it.
 * Numbering the paragraphs makes the answer an integer — nothing to match, and
 * a break can only land where a paragraph does, which is where they really are.
 */
export function chapterParagraphs(text: string, chapter: Chapter): ChapterParagraph[] {
  const body = chapterBody(text, chapter);
  const found: ChapterParagraph[] = [];
  let cursor = 0;
  for (const block of body.split('\n\n')) {
    const offset = cursor;
    cursor += block.length + 2;
    if (block.trim()) found.push({ index: found.length, offset: chapter.start + offset, text: block });
  }
  return found;
}

export function numberedBody(paragraphs: ChapterParagraph[]): string {
  return paragraphs.map((paragraph) => `[${paragraph.index}] ${paragraph.text}`).join('\n\n');
}

/** The book, in the few lines a reader would give someone before lending it. */
export function bookHeader(book: Book, chapters: Chapter[]): string {
  const facts = [
    `Title: ${book.title}`,
    book.author ? `Author: ${book.author}` : '',
    book.year ? `Year: ${book.year}` : '',
    `Language: ${book.language}`,
    // A record has no manuscript to measure, and "0 words" is a fact about
    // this app rather than about the book.
    book.word_count
      ? `Length: ${formatCount(book.word_count, book.language)} across ${chapters.length} chapters`
      : chapters.length
        ? `Chapters: ${chapters.length}`
        : '',
  ].filter(Boolean);
  if (book.summary?.trim()) {
    facts.push(`What it is about: ${book.summary.trim().slice(0, CAPS.summary)}`);
  }
  return facts.join('\n');
}

/** Only the chapters just before this one: the plot the reader is holding. */
export function recentBriefs(chapters: Chapter[], chapter: Chapter): string {
  const before = chapters
    .filter((entry) => entry.idx < chapter.idx && entry.brief?.trim())
    .slice(-CAPS.recentBriefs);
  if (!before.length) return '';
  return before
    .map(
      (entry) =>
        `${entry.idx + 1}. ${entry.title.trim() || ''} — ${entry.brief!.trim().slice(0, CAPS.briefLength)}`
    )
    .join('\n');
}

/** Names the model must reuse rather than reinvent, with just enough to place them. */
export function castList(characters: Entity[]): string {
  return characters
    .slice(0, CAPS.cast)
    .map((entity) => {
      const aliases = namesOf(entity).slice(1);
      const about = [entity.role, entity.summary].filter(Boolean).join('; ');
      return `- ${entity.name}${aliases.length ? ` (${aliases.join(', ')})` : ''}${about ? ` — ${about}` : ''}`;
    })
    .join('\n');
}

/**
 * The terminology this book has already established.
 *
 * Characters and places were sent and terms were not, which is why a rite
 * named in one chapter came back re-spelled in the next and became a second
 * entry for the same thing. Names only: a term's note belongs to the chapter
 * it was written for, and forty of them would cost more than the chapter.
 */
export function termList(terms: Entity[]): string {
  return terms
    .slice(0, CAPS.terms)
    .map((term) => `- ${term.name}`)
    .join('\n');
}

export function placeList(places: Entity[]): string {
  return places
    .slice(0, CAPS.places)
    .map((place) => `- ${place.name}${place.summary ? ` — ${place.summary}` : ''}`)
    .join('\n');
}

/**
 * Where the last chapter left off. Without it each chapter is read cold and
 * splits itself from scratch, so a scene running across a chapter break comes
 * back as two unrelated openings.
 */
export function sceneTail(scenes: Scene[]): string {
  // A scene nobody named is listed by its summary alone: "Scene 2" is a name the
  // model is then told to reuse, and it reuses it.
  return scenes
    .slice(-CAPS.recentScenes)
    .map((scene) => [scene.title?.trim(), scene.summary?.trim()].filter(Boolean).join(' — '))
    .filter(Boolean)
    .map((line) => `- ${line}`)
    .join('\n');
}

/** The whole briefing, assembled once and reused by every chapter pass. */
export function assemble(context: ChapterContext): string {
  const sections: [string, string][] = [
    ['THE BOOK', bookHeader(context.book, context.chapters)],
    ['CHARACTERS ALREADY KNOWN', castList(context.characters)],
    ['PLACES ALREADY KNOWN', placeList(context.places)],
    ['TERMS ALREADY KNOWN', termList(context.terms ?? [])],
    ['THE CHAPTERS JUST BEFORE THIS ONE', recentBriefs(context.chapters, context.chapter)],
    ['SCENES AT THE END OF THE PREVIOUS CHAPTER', sceneTail(context.previousScenes ?? [])],
    [
      `THIS CHAPTER (${context.chapter.idx + 1}${
        context.chapter.title.trim() ? `, "${context.chapter.title.trim()}"` : ''
      })`,
      context.paragraphs
        ? numberedBody(context.paragraphs)
        : chapterMaterial(context.book, context.chapter, context.text, context.passage),
    ],
  ];
  return sections
    .filter(([, body]) => body.trim())
    .map(([heading, body]) => `## ${heading}\n${body}`)
    .join('\n\n');
}
