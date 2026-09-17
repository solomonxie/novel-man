import type { Book, Chapter, Entity, Scene } from '../db/repo';
import { formatCount } from '../text/counts';
import { namesOf } from '../cast/mentions';

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
  summary: 900,
  recentScenes: 4,
};

export type ChapterContext = {
  book: Book;
  chapter: Chapter;
  chapters: Chapter[];
  characters: Entity[];
  places: Entity[];
  text: string;
  /** The scenes of the chapter just before, so this one continues rather than restarts. */
  previousScenes?: Scene[];
  /** Present when the pass asks for scenes: the chapter goes out numbered. */
  paragraphs?: ChapterParagraph[];
};

export function chapterBody(text: string, chapter: Chapter): string {
  return text.slice(chapter.start, Math.min(chapter.end, chapter.start + CAPS.chapter));
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
    `Length: ${formatCount(book.word_count, book.language)} across ${chapters.length} chapters`,
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
  return scenes
    .slice(-CAPS.recentScenes)
    .map((scene, index) => {
      const label = scene.title?.trim() || `Scene ${index + 1}`;
      return `- ${label}${scene.summary?.trim() ? ` — ${scene.summary.trim()}` : ''}`;
    })
    .join('\n');
}

/** The whole briefing, assembled once and reused by every chapter pass. */
export function assemble(context: ChapterContext): string {
  const sections: [string, string][] = [
    ['THE BOOK', bookHeader(context.book, context.chapters)],
    ['CHARACTERS ALREADY KNOWN', castList(context.characters)],
    ['PLACES ALREADY KNOWN', placeList(context.places)],
    ['THE CHAPTERS JUST BEFORE THIS ONE', recentBriefs(context.chapters, context.chapter)],
    ['SCENES AT THE END OF THE PREVIOUS CHAPTER', sceneTail(context.previousScenes ?? [])],
    [
      `THIS CHAPTER (${context.chapter.idx + 1}${
        context.chapter.title.trim() ? `, "${context.chapter.title.trim()}"` : ''
      })`,
      context.paragraphs
        ? numberedBody(context.paragraphs)
        : chapterBody(context.text, context.chapter),
    ],
  ];
  return sections
    .filter(([, body]) => body.trim())
    .map(([heading, body]) => `## ${heading}\n${body}`)
    .join('\n\n');
}
