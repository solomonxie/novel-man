import type {
  Annotation,
  Book,
  Chapter,
  Entity,
  Mention,
  Observation,
  RelationEdge,
  Relation,
  Scene,
} from '../db/repo';
import type { TranslationUnit } from '../db/translation';
import type { ScriptElement } from '../script/model';

export type ExportInput = {
  book: Book;
  text: string;
  chapters: Chapter[];
  annotations: Annotation[];
  /** Present only once the cast has been analyzed; the bible formats need it. */
  cast?: { entities: Entity[]; mentions: Mention[]; relations: Relation[] };
  /** Present only when a target language is being exported. */
  translation?: { target: string; units: TranslationUnit[] };
  /** Present only once the screenplay conversion has run. */
  script?: ScriptElement[];
  /** Present only when the book's analysis is being exported without its text. */
  scenes?: Scene[];
  /** Present only when exporting one character's own page. */
  profile?: { entity: Entity; observations: Observation[]; relations: RelationEdge[] };
};

export type ExportFile = {
  fileName: string;
  mimeType: string;
  /** Text formats stay strings so the common case never allocates a buffer. */
  body?: string | Uint8Array;
  /** Set instead of `body` by formats whose renderer already wrote a file. */
  uri?: string;
};

/**
 * What survives the trip. Every exporter has to answer this because the sheet
 * states it before the user picks — a silent loss found later is worse than a
 * format that says up front what it drops.
 */
export type Keeps = { chapters: boolean; annotations: boolean; styling: boolean };

export type Exporter = {
  id: string;
  extension: string;
  mimeType: string;
  keeps: Keeps;
  /** Can the result be imported back and land on the same structure? */
  roundTrip: boolean;
  build(input: ExportInput): Promise<ExportFile>;
};

export function chapterBodies(input: ExportInput): { title: string; paragraphs: string[] }[] {
  const ranges = input.chapters.length
    ? input.chapters
    : [{ title: input.book.title, start: 0, end: input.text.length } as Chapter];
  return ranges.map((chapter, index) => ({
    title: chapter.title.trim() || `${index + 1}`,
    paragraphs: input.text
      .slice(chapter.start, chapter.end)
      .split('\n\n')
      .map((paragraph) => paragraph.trim())
      .filter(Boolean),
  }));
}

/** A chapter's own title is usually its first line; printing it twice looks broken. */
export function bodyWithoutTitle(chapter: { title: string; paragraphs: string[] }): string[] {
  const [first, ...rest] = chapter.paragraphs;
  return first?.trim() === chapter.title.trim() ? rest : chapter.paragraphs;
}

export function safeFileName(title: string): string {
  return title.replace(/[/\\?%*:|"<>]/g, '-').trim().slice(0, 80) || 'book';
}
