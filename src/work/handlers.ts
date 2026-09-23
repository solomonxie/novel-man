import { parseJson } from '../ai/run';
import { contentHash, readCache, writeCache } from '../ai/cache';
import { runChat } from '../ai/keys';
import type { ChatMessage } from '../ai/client';
import {
  addObservation,
  findOrCreateEntity,
  getBook,
  getDocumentText,
  addImage,
  getEntity,
  listChapters,
  listVerses,
  listEntities,
  listChapterScenes,
  listObservations,
  listUnlocatedPlaces,
  mergeFields,
  parseFields,
  recordRelation,
  replaceChapters,
  replaceMentions,
  replaceScenes,
  setChapterBrief,
  setChapterRecap,
  setPinIfUnset,
  setWikiIfUnset,
  updateBook,
  updateCast,
  updateEntity,
  type Book,
  type Chapter,
  type Verse,
} from '../db/repo';
import { countMentions, namesOf } from '../cast/mentions';
import { parsePin } from '../cast/location';
import { hasWiki, parseWikiLink } from '../cast/lookup';
import { parseTie, TIES } from '../cast/ties';
import { translate } from '../translate/run';
import { drawImage } from '../ai/image';
import type { ImageKind } from '../db/repo';
import { writeImage } from '../storage/files';
import { kindOf } from '../books/kinds';
import { isRecord } from '../books/record';
import { canonChapters, isBible } from '../scripture/canon';
import type { WorkJob, WorkKind } from '../db/work';
import {
  assemble,
  bookHeader,
  castList,
  chapterMaterial,
  chapterParagraphs,
  citedNotSent,
  knownWorkBody,
  recentBriefs,
  type ChapterParagraph,
  type Passage,
} from '../analysis/context';

export type Handler = (job: WorkJob, signal: AbortSignal) => Promise<void>;

/**
 * Every handler is one unit of work on one thing. They are deliberately
 * small: the queue owns retrying, canceling and reporting, so a handler only
 * has to do its job once and write the result down.
 */
export const handlers: Record<WorkKind, Handler> = {
  'book-summary': summarizeBook,
  'book-lookup': lookUpBook,
  'book-outline': outlineBook,
  'book-correct': correctBook,
  'chapter-brief': briefChapter,
  'chapter-recap': recapChapter,
  'deep-analyze': deepAnalyze,
  'cast-chapter': castChapter,
  'cast-wrapup': wrapUpCast,
  'character-polish': polishCharacter,
  'place-polish': polishPlace,
  'place-locate': locatePlaces,
  'person-link': linkPeople,
  'image-draw': drawSomething,
  'scene-suggest': notHere,
  'translate-span': translateChapter,
  'script-scene': notHere,
};

async function notHere(): Promise<void> {
  throw new Error('no handler registered');
}

/**
 * Shared by every handler: ask once, keep the answer, never pay twice.
 *
 * A refusal is the one answer not worth keeping. It is a successful reply, so
 * it used to be cached like any other — and then Retry read it back and failed
 * in the same instant without asking anybody, which looks exactly like a
 * button that does nothing. It is also the answer most likely to change: the
 * reader adds the author, or the pass stops asking for the impossible.
 */
async function ask(kind: string, messages: ChatMessage[], maxTokens: number, signal: AbortSignal) {
  const hash = contentHash(kind, ...messages.map((message) => message.content));
  const cached = await readCache(hash);
  if (cached !== null && !refused(cached)) return cached;
  const answer = await runChat(messages, { maxTokens, signal });
  if (!refused(answer)) await writeCache(hash, kind, answer);
  return answer;
}

async function loadChapter(job: WorkJob): Promise<{
  book: Book;
  chapters: Chapter[];
  chapter: Chapter;
  text: string;
  passage?: Passage;
  /** Only for a book that has them, and only because a scene starts at one. */
  verses: Verse[];
}> {
  const book = await getBook(job.book_id);
  if (!book) throw new Error('book is gone');
  const chapters = await listChapters(job.book_id);
  const chapter = chapters.find((entry) => entry.idx === job.chapter_idx);
  if (!chapter) throw new Error('chapter is gone');
  const text = await getDocumentText(job.book_id);
  // A chapter that is cited rather than sent needs its verse range, and only
  // that: the query is one row, against a book whose text never goes out.
  if (!citedNotSent(book)) return { book, chapters, chapter, text, verses: [] };
  const verses = await listVerses(chapter.id);
  const passage = verses.length
    ? { first: verses[0].number, last: verses[verses.length - 1].number }
    : undefined;
  return { book, chapters, chapter, text, passage, verses };
}

/**
 * A book with no words behind it, asked about rather than read. The reader
 * typed a title, or picked one out of a catalog that hands over records and
 * nothing else — so the only thing this pass has to work with is the name, and
 * the only honest answers are "here is what that book is" and "I don't know it".
 *
 * Nothing already filled in is touched. A lookup fills the gaps the shelf has;
 * it is not a second opinion on what the reader wrote.
 */
type KnownBook = {
  unknown?: boolean;
  author?: string;
  year?: string | number;
  summary?: string;
  chapters?: number;
};

/**
 * What counts as a book here is wider than "a novel with an author", and the
 * first version of this got that wrong: a reader typed "NIV bible" and was told
 * the model did not know it. A translation, an edition, a scripture, a manual,
 * a series, an anthology or a reference work is a book for this purpose, and
 * refusing is only for a title nobody could place at all.
 */
const KNOWN_BOOK_RULES =
  'You are a reference desk. You are given the name of a published work and you ' +
  'answer what is documented about it: who wrote or produced it, the year it was ' +
  'first published, and three to five sentences on what it is — its subject, its ' +
  'shape, and what reading it is like. No review, no ranking, no sales copy, and ' +
  'no spoiler past the opening. A translation, an edition, a scripture, a ' +
  'textbook, a manual, a reference work, a series and an anthology all count: ' +
  'answer about the thing itself, and where it has no single author say who ' +
  'produced it — a committee, a publisher, a tradition — rather than refusing. ' +
  'Where several unrelated works share this title, answer about the one by the ' +
  'author given, or failing that the best known, and name which one you mean in ' +
  'the first sentence. Reply {"unknown":true} only when the title is one you ' +
  'cannot place at all: an invented answer is worse than none, because nothing ' +
  'here can tell the two apart later.';

/**
 * `{"unknown":true}`, whether it arrives alone, fenced, or wrapped in the
 * sentence of explanation some models cannot help adding. The token is the
 * contract; where it appears is not something worth failing a chapter over.
 */
function refused(answer: string): boolean {
  const body = answer.replace(/```(?:json)?/gi, '').trim();
  return /\{\s*"?unknown"?\s*:\s*true\s*,?\s*\}?/i.test(body);
}

/** The one error a reader has to be able to read off the queue row, and act on. */
const UNKNOWN =
  'the model could not place this title — try the fuller title, or add the author';

/**
 * The same, one level down. A chapter of a book the app has no copy of is
 * asked about by name, so there are two ways to get nothing back: the model
 * does not know the book, or it knows it and cannot tell which chapter this
 * is. The second is the one the reader can do something about, and a line in
 * the chapter's brief is what does it.
 */
const UNKNOWN_CHAPTER =
  'the model could not place this chapter — a line in its brief saying what it covers is usually enough';

/**
 * The answer to a question about a book whose words were never sent. Three
 * shapes all mean the same thing — the token, `unknown` among the fields, and
 * the prose a model writes when it would rather explain than answer — and all
 * three are a failure the reader can see rather than a chapter that quietly
 * comes back empty. Nothing here can tell an invented chapter from a real one
 * later, so nothing invented may be written down now.
 */
function readCited<T>(answer: string): T {
  if (refused(answer)) throw new Error(UNKNOWN_CHAPTER);
  let result: T & { unknown?: boolean };
  try {
    result = parseJson<T & { unknown?: boolean }>(answer);
  } catch {
    // Not JSON at all: an apology, or a request for the text nobody can send.
    throw new Error(UNKNOWN_CHAPTER);
  }
  if (result.unknown) throw new Error(UNKNOWN_CHAPTER);
  return result;
}

async function lookUpBook(job: WorkJob, signal: AbortSignal) {
  const book = await getBook(job.book_id);
  if (!book) throw new Error('book is gone');
  const answer = await ask(
    'book-lookup',
    [
      {
        role: 'system',
        content:
          `${KNOWN_BOOK_RULES} Reply with JSON only: ` +
          '{"author","year","summary","chapters":0}. Give "chapters" only if you know ' +
          'how many the book has; leave any field out rather than guessing at it.',
      },
      {
        role: 'user',
        content: [
          `Title: ${book.title}`,
          book.author ? `Author: ${book.author}` : '',
          book.year ? `First published: ${book.year}` : '',
          // Filed by the reader, who may well have left the default on. It is
          // a hint, not a fact, and saying so is what stops the pass refusing
          // a bible for not being the novel it was filed as.
          `The reader filed it as ${kindOf(book.kind).subject}; if that is ` +
            'plainly wrong, answer about what it really is.',
          `Answer in ${book.language}.`,
        ]
          .filter(Boolean)
          .join('\n'),
      },
    ],
    700,
    signal
  );
  if (refused(answer)) throw new Error(UNKNOWN);

  const found = parseJson<KnownBook>(answer);
  if (found.unknown) throw new Error(UNKNOWN);
  const changes: Record<string, string> = {};
  if (!book.author?.trim() && found.author?.trim()) changes.author = found.author.trim();
  const year = String(found.year ?? '').match(/\d{3,4}/)?.[0];
  if (!book.year?.trim() && year) changes.year = year;
  if (!book.summary?.trim() && found.summary?.trim()) changes.summary = found.summary.trim();
  if (!Object.keys(changes).length) throw new Error('nothing was missing that it could fill in');
  await updateBook(job.book_id, changes);
}

/**
 * The details as they should read, rather than the gaps in them. A lookup only
 * writes where the shelf is blank, which is right for a book nobody has
 * touched and useless for the commonest way a record is wrong: a title typed
 * from memory, an author down to an initial, a year off by one, a subtitle
 * dropped. This pass is allowed to overwrite, and pays for that by being told
 * exactly what it may not do — turn the record into a different book, or
 * translate a title out of the language it was published in.
 */
type Correction = {
  unknown?: boolean;
  title?: string;
  author?: string;
  year?: string | number;
  edition?: string;
};

const CORRECT_FIELDS = ['title', 'author', 'year', 'edition'] as const;

async function correctBook(job: WorkJob, signal: AbortSignal) {
  const book = await getBook(job.book_id);
  if (!book) throw new Error('book is gone');
  const answer = await ask(
    'book-correct',
    [
      {
        role: 'system',
        content:
          'You are a reference desk. You are given a shelf record of a published work, ' +
          'which may be wrong: a title typed from memory, an author given by initial or ' +
          'surname alone, a missing subtitle, a wrong year, a translation credited to the ' +
          'wrong person. Reply with JSON only: {"title","author","year","edition"}. Give ' +
          'every field as it should read, corrected where it is wrong and copied exactly ' +
          'where it is right. "year" is the year this work was first published, four ' +
          'digits. "edition" is the translation, revision or named edition this record is ' +
          'of, and is left out where the record names none. ' +
          // Without this it "corrects" 三体 to The Three-Body Problem, which is a
          // different book on this shelf: the reader's copy is the one they read.
          'Keep every field in the language it is published in and never translate a ' +
          'title or a name. Never turn the record into a different work: correct what is ' +
          'written, and where the record names a work you cannot identify at all, reply ' +
          'with exactly {"unknown":true} and nothing else.',
      },
      {
        role: 'user',
        content: [
          `Title: ${book.title}`,
          `Author: ${book.author ?? ''}`,
          `First published: ${book.year ?? ''}`,
          `Edition: ${book.edition ?? ''}`,
          `Language of this copy: ${book.language}`,
          book.summary?.trim() ? `What it is: ${book.summary.trim().slice(0, 400)}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
      },
    ],
    400,
    signal
  );
  if (refused(answer)) throw new Error(UNKNOWN);

  const found = parseJson<Correction>(answer);
  if (found.unknown) throw new Error(UNKNOWN);
  const changes: Record<string, string> = {};
  for (const field of CORRECT_FIELDS) {
    const raw = field === 'year' ? String(found.year ?? '').match(/\d{3,4}/)?.[0] : found[field];
    const next = String(raw ?? '').trim();
    // Only a real difference. A pass that rewrites a field with the same
    // string is a pass that says it changed something when it did not.
    if (next && next !== (book[field] ?? '').trim()) changes[field] = next;
  }
  if (!Object.keys(changes).length) {
    throw new Error('nothing to correct — the details already match the book');
  }
  await updateBook(job.book_id, changes);
}

/**
 * What the book is made of, for a book whose pages are not here: its chapters,
 * in order, each with a line on what it covers. That is what makes the rest of
 * the app work on a record — a note, a brief and a rating all hang off a
 * chapter — and it is the one thing a catalog never publishes.
 *
 * It replaces the chapter list rather than merging with it. A table of contents
 * is one answer about one book; half of one merged into half of another is a
 * contents page for a book that does not exist, and the screen that starts this
 * asks first.
 */
type Outline = {
  unknown?: boolean;
  chapters?: { title?: string; brief?: string; part?: string }[];
};

async function outlineBook(job: WorkJob, signal: AbortSignal) {
  const book = await getBook(job.book_id);
  if (!book) throw new Error('book is gone');
  // A bible's contents are the same in every edition of the canon: 66 books
  // and 1,189 chapters, already here. Asking a model costs money to be told
  // something less certain — and asked for all 1,189 at once it answers that
  // it does not know how the work is divided, which is what a reader who typed
  // "NIV Bible" was told.
  if (isBible(book.title)) {
    await replaceChapters(job.book_id, canonChapters());
    return;
  }
  const kind = kindOf(book.kind);
  const unit = kind.unit ?? 'chapter';
  const answer = await ask(
    'book-outline',
    [
      {
        role: 'system',
        content:
          'You are a reference desk, asked for the table of contents of a published ' +
          'work. A translation, an edition, a scripture, a textbook, a manual and an ' +
          'anthology all count — the books of a bible, the parts of a manual and the ' +
          'stories in a collection are its contents just as chapters are a novel\'s. ' +
          `List every ${unit} in order, as it is printed, with the ${unit}'s own ` +
          'title where it has one and an empty title where it is only numbered. "brief" is ' +
          `one sentence on what that ${unit} covers, and no more. ` +
          (kind.part
            ? `"part" is the name of the ${kind.part} it sits under, where the book has them, ` +
              'spelled the same way on every row that belongs to it. '
            : '') +
          'Give the contents of this work only — never a plausible set of chapter titles, ' +
          `never a ${unit} you are unsure it has, and never more than it has. ` +
          'Reply {"unknown":true} only when the title is one you cannot place at all, or ' +
          'when you know the work but genuinely do not know how it is divided. ' +
          'Reply with JSON only: {"chapters":[{"title","brief"' +
          (kind.part ? ',"part"' : '') +
          '}]}.',
      },
      {
        role: 'user',
        content: [
          `Title: ${book.title}`,
          book.author ? `Author: ${book.author}` : '',
          book.year ? `First published: ${book.year}` : '',
          book.summary?.trim() ? `What it is: ${book.summary.trim().slice(0, 600)}` : '',
          `The reader filed it as ${kind.subject}; if that is plainly wrong, answer ` +
            'about what it really is.',
          `Answer in ${book.language}.`,
        ]
          .filter(Boolean)
          .join('\n'),
      },
    ],
    4000,
    signal
  );
  if (refused(answer)) throw new Error(UNKNOWN);

  const outline = parseJson<Outline>(answer);
  if (outline.unknown) throw new Error(UNKNOWN);
  const rows = (outline.chapters ?? []).filter((row) => row && typeof row === 'object');
  if (!rows.length) throw new Error('it listed no chapters');

  // A record has no manuscript, so every chapter is the same empty span: what
  // addresses one here is its place in the order and its name.
  const parts: string[] = [];
  await replaceChapters(
    job.book_id,
    rows.map((row, at) => {
      const part = row.part?.trim();
      if (part && parts[parts.length - 1] !== part) parts.push(part);
      return {
        title: row.title?.trim() || `${at + 1}`,
        start: 0,
        end: 0,
        // Nothing here was read off a page: it is the model's account of a
        // contents page, and the structure screen marks it as unconfirmed.
        confident: false,
        userEdited: false,
        brief: row.brief?.trim() || null,
        part_idx: part ? parts.length - 1 : null,
        part_title: part ?? null,
      };
    })
  );
}

/**
 * The book's own summary is built from the chapter briefs rather than the
 * text: by the time anyone asks for it the briefs already exist, and reading
 * 500 chapters again to say the same thing would cost a hundred times more.
 */
async function summarizeBook(job: WorkJob, signal: AbortSignal) {
  const book = await getBook(job.book_id);
  if (!book) throw new Error('book is gone');
  const chapters = await listChapters(job.book_id);
  const briefed = chapters.filter((chapter) => chapter.brief?.trim());
  const text = await getDocumentText(job.book_id);

  // Neither the book's words nor a word about them: whatever came back from
  // that would be a summary of an empty page, invented under a real title.
  // The pass that answers from the title alone is the lookup, and saying so
  // is more use than a made-up blurb.
  if (!briefed.length && !text.trim()) {
    throw new Error('nothing has been read or briefed yet — ask what this book is instead');
  }

  const material = briefed.length
    ? briefed
        .map((chapter) => `${chapter.idx + 1}. ${chapter.title.trim()} — ${chapter.brief!.trim()}`)
        .join('\n')
    : text.slice(0, 16000);

  const answer = await ask(
    'book-summary',
    [
      {
        role: 'system',
        content:
          kindOf(book.kind).reads === 'argument'
            ? 'You write the abstract of a paper from notes on its sections: what question ' +
              'it asks, how it goes about it, what it reports, and what it does not show. ' +
              'Four to six sentences, no evaluation of importance. Reply with the abstract ' +
              'only — no heading, no preamble.'
            : 'You write the back-cover summary of a novel: three to five sentences, present ' +
              'tense, no spoilers past the first act, no marketing language. Reply with the ' +
              'summary only — no heading, no preamble.',
      },
      {
        role: 'user',
        content: `${bookHeader(book, chapters)}\n\n${briefed.length ? 'CHAPTER BRIEFS' : 'OPENING'}\n${material}`,
      },
    ],
    500,
    signal
  );
  await updateBook(job.book_id, { summary: answer.trim() });
}

async function briefChapter(job: WorkJob, signal: AbortSignal) {
  const { book, chapters, chapter, text, passage } = await loadChapter(job);
  const before = recentBriefs(chapters, chapter);
  const answer = await ask(
    'chapter-brief',
    [
      {
        role: 'system',
        content:
          kindOf(book.kind).reads === 'argument'
            ? 'You write a one or two sentence brief of one section of a paper: what it ' +
              'claims and what it rests on. Plain, no interpretation of significance. ' +
              'Reply with the brief only.'
            : 'You write a one or two sentence brief of a chapter: who is in it, where it ' +
              'happens, and what changes. Past tense, plain, no interpretation. Reply with ' +
              'the brief only.',
      },
      {
        role: 'user',
        content: [
          bookHeader(book, chapters),
          before && `RECENT CHAPTERS\n${before}`,
          `CHAPTER ${chapter.idx + 1}${chapter.title.trim() ? `: ${chapter.title.trim()}` : ''}\n${chapterMaterial(book, chapter, text, passage)}`,
        ]
          .filter(Boolean)
          .join('\n\n'),
      },
    ],
    260,
    signal
  );
  // A book the model does not know comes back saying so, and that sentence is
  // not a brief — see `knownWorkBody`.
  if (citedNotSent(book) && refused(answer)) throw new Error(UNKNOWN_CHAPTER);
  await setChapterBrief(chapter.id, answer.trim() || null);
}

/**
 * The chapter itself, as far as anyone remembers it.
 *
 * Every other pass here refuses to write prose that could be mistaken for the
 * book. This one is asked for exactly that and is therefore the most careful:
 * it is only ever offered for a book the app has no copy of, what it writes is
 * kept in a column of its own rather than merged into a manuscript, and the
 * page that shows it says whose words they are. A reader who wants to know
 * what happened in chapter twelve of a book they lent out is asking a
 * reasonable question; the danger is not the answer but forgetting where it
 * came from a month later.
 *
 * So: recounted rather than reconstructed. It is told to say plainly where its
 * memory thins out instead of writing over the gap, and never to produce a
 * line as though quoting.
 */
async function recapChapter(job: WorkJob, signal: AbortSignal) {
  const { book, chapters, chapter, text, passage } = await loadChapter(job);
  const before = recentBriefs(chapters, chapter);
  const answer = await ask(
    'chapter-recap',
    [
      {
        role: 'system',
        content:
          'You recount one chapter of a published work for a reader who has read the book ' +
          'and wants to be back inside that chapter. Several paragraphs of plain prose: what ' +
          'happens, in order, who is there, where it takes place, and how the chapter ends. ' +
          'Past tense, the names and terms the book uses, the language asked for below. ' +
          'You are recalling, not reconstructing: where your memory of this chapter is thin, ' +
          'say so in the open — "the middle of this chapter I do not recall in detail" — ' +
          'rather than writing something plausible over the gap. Never present a sentence as ' +
          "the book's own words, never invent an event, a name or an ending, and never " +
          'recount a different chapter. Reply with the account only — no heading, no preamble.',
      },
      {
        role: 'user',
        content: [
          bookHeader(book, chapters),
          before && `THE CHAPTERS JUST BEFORE THIS ONE\n${before}`,
          chapterMaterial(book, chapter, text, passage),
          `Answer in ${book.language}.`,
        ]
          .filter(Boolean)
          .join('\n\n'),
      },
    ],
    1200,
    signal
  );
  if (refused(answer)) throw new Error(UNKNOWN_CHAPTER);
  const recap = answer.trim();
  if (!recap) throw new Error(UNKNOWN_CHAPTER);
  await setChapterRecap(chapter.id, recap);
}

type Detail = { label: string; value: string };

type Character = {
  name: string;
  aliases?: string[];
  role?: string;
  age?: string;
  gender?: string;
  appearance?: string;
  voice?: string;
  note?: string;
  details?: Detail[];
};

type SceneResult = { start?: number; title?: string; summary?: string };

type TieResult = { from: string; to: string; label: string };

type DeepResult = {
  brief?: string;
  scenes?: SceneResult[];
  characters?: Character[];
  places?: { name: string; note?: string; details?: Detail[]; location?: unknown }[];
  terms?: { name: string; note?: string; details?: Detail[] }[];
  relations?: TieResult[];
};

/**
 * Age and gender are columns because nearly every book has them; everything
 * else a genre cares about — cultivation level, house, rank, ship — arrives as
 * free-form details, so the schema never has to guess the genre.
 */
const PROFILE_SHAPE =
  '{"name","aliases":[],"role","age","gender","appearance","voice","note",' +
  '"details":[{"label","value"}]}';

/**
 * What a scene is, said in the terms a chapter is actually built from. The
 * earlier wording let the model off with "omit scenes when the chapter never
 * moves", and it took that out every time — a whole chapter came back as one
 * scene carrying the chapter's own title, which is the chapter said twice.
 */
const SCENE_RULES =
  'A scene is a continuous stretch of the chapter in one place, at one time, ' +
  'following one viewpoint. It ends the moment any of those three moves: the ' +
  'characters go somewhere else, time skips, the focus shifts to someone else, ' +
  'or the narration turns to a memory, dream or flashback and back again. Split ' +
  'the chapter into every scene it contains — most chapters hold two to five, and ' +
  'very few hold only one. "start" is the bracketed number of the paragraph the ' +
  'scene begins at, copied from the text; never a quote and never a number that ' +
  'is not there. The first scene always starts at paragraph 0. "title" names what ' +
  'happens in that scene, as a short phrase in the language of the book — a place, ' +
  'a confrontation, an errand. Never the chapter title, never "Scene 2", never a ' +
  'summary sentence. If a scene returns to a place or a situation that already has ' +
  'a title in the scenes listed from the previous chapter, reuse that exact title. ' +
  '"summary" is one sentence about that scene alone.';

/**
 * The same scene, said in the only numbers a cited book has. A bible's words
 * are named rather than sent — the model already has them — so there are no
 * paragraphs of ours to point at, and a verse is better than one anyway: it
 * is the same number in every edition, and the reader's page is ruled by it.
 */
const VERSE_SCENE_RULES =
  'A scene is a continuous stretch of the chapter in one place, at one time, ' +
  'following one set of people. It ends the moment any of those moves: they go ' +
  'somewhere else, time skips, or the account turns to someone else. "start" is ' +
  'the verse number the scene begins at, an integer from this chapter, and the ' +
  'first scene always starts at the chapter\'s first verse. A chapter that is ' +
  'one continuous account is one scene — give it one rather than splitting it ' +
  'at every paragraph. "title" names what happens in that scene, as a short ' +
  'phrase in the language of the book: the storm, the lots, the great fish. ' +
  'Never the chapter title, never "Scene 2". "summary" is one sentence about ' +
  'that scene alone.';

const PROFILE_RULES =
  '"age" and "gender" only when the text says or plainly implies them. ' +
  '"details" is for anything else this chapter establishes about who they are — ' +
  'schooling, rank, occupation, where they live, family, and whatever this genre ' +
  'tracks — as short label/value pairs in the language of the book. ' +
  'Leave a field out rather than inventing it.';

/**
 * A place is only useful if it can be found. "The camp" tells a reader nothing
 * a week later; the camp outside Ji'an, in Jiangxi, is somewhere you can put a
 * pin. So the geography is asked for explicitly and from the outside in, and
 * what the text does not say is left out rather than guessed at — an invented
 * country is worse than a missing one.
 */
const PLACE_RULES =
  '"places" are where this chapter happens. "details" must carry, wherever the ' +
  'text states or plainly implies it: what sort of place it is (country, region, ' +
  'province, city, town, district, neighbourhood, building, camp, base, park, ' +
  'road, landmark — or the word this book uses), and the geography around it ' +
  'from the outside in: country, region or province, city or town, and what it ' +
  'sits inside. Short label/value pairs in the language of the book. A place ' +
  'nobody could put a pin in — a world, an era, an afterlife — says so as its ' +
  'sort. Omit what the text does not establish; never invent a location.';

/**
 * Where the places are real, the pass is asked what they are called now. A
 * name rather than a coordinate: a map searches names, the model actually
 * knows them — Hazor is Tel Hazor, Shushan is Susa — and a name it gets wrong
 * is a name you can read and fix. It is asked once, for the place rather than
 * for the chapter, and it is allowed to say nothing: half the sites named in
 * scripture are argued over. A land is the exception to "nowhere": Canaan is
 * nobody's address, but a map opened over the region helps more than none.
 */
const MODERN_RULES =
  '"modern" is the present-day name a map would find it under, with the country ' +
  '— "Tel Hazor, Israel", "Susa, Iran". A region rather than a spot — a land, a ' +
  'province, a wilderness, a sea — gives the region as it is named on a map ' +
  'today. "certainty" is certain, probable or disputed.';

const PIN_RULES =
  `"location" says where the place is today. ${MODERN_RULES} It describes the ` +
  'place itself, not this chapter. Leave "location" out entirely where nobody ' +
  'has identified the site or scholars put it in more than one country; never ' +
  'write "unknown" into it.';

const LOCATE_RULES =
  `${MODERN_RULES} Leave a place out of your answer entirely where nobody has ` +
  'identified the site or scholars put it in more than one country; never answer ' +
  '"unknown".';

const PLACE_SHAPE = '{"name","note","details":[{"label","value"}]}';
const PINNED_PLACE_SHAPE =
  '{"name","note","details":[{"label","value"}],"location":{"modern","certainty"}}';

/**
 * The third kind of thing a book names. Not a person and not a place: the ark,
 * the covenant, the Passover, a rank, a rite, a law, an order — what the book
 * treats as a thing and keeps returning to. A reader meets it once in chapter
 * three and needs it again in chapter forty, which is exactly the problem a
 * page of its own solves.
 */
const TERM_RULES =
  '"terms" are the special nouns this chapter uses that are neither people nor ' +
  'places — what this book treats as its own and expects a reader to learn: ' +
  'named objects and artefacts, rites, feasts, laws, covenants, titles, ranks, ' +
  'orders, institutions, techniques, systems, coined words, and the words this ' +
  'book uses in a sense of its own. ' +
  // Without naming them, an extraction pass fills a book's glossary with the
  // furniture of the world and the page becomes unreadable.
  'Ordinary vocabulary is never a term, however often it appears: pencil, road, ' +
  'desk, chair, rain, sun, train, knife, fire and everything like them are the ' +
  'furniture of the world, not terminology. The one exception is a word this ' +
  'book has given a particular meaning of its own — a sword the story calls the ' +
  'Fire, an order named the Train — which is a term because of what the book ' +
  'made of it, not because of the word. ' +
  'Name each as the book names it. "note" is one sentence on what it is *here*, ' +
  'in this chapter. "details" is anything else this chapter establishes about ' +
  'it, as short label/value pairs in the language of the book. Skip anything ' +
  'already listed as a person or a place. ' +
  // Without this the answer stops at a handful, and a term met again in a
  // later chapter comes back under a new spelling as a second entry.
  'Within that, list every one the chapter names rather than a selection of the ' +
  'notable ones, including any that appeared in earlier chapters — reuse the ' +
  'exact spelling from TERMS ALREADY KNOWN wherever it is the same thing.';

const RELATION_RULES =
  '"relations" are the ties this chapter shows between two of its people. ' +
  '"from" and "to" are names from "characters" or from the list already known, ' +
  `spelled exactly as they appear there. "label" is exactly one of ${TIES.filter(
    (tie) => tie !== 'other'
  ).join(', ')} — that word alone, in English, lower case, and nothing else. ` +
  'It reads from "from" to "to": {"from":"Abraham","to":"Isaac","label":"parent"} ' +
  'says Abraham is the parent of Isaac. "kin" is for a family tie none of the ' +
  'others name. Only what this chapter states or plainly shows: omit a pair ' +
  'rather than guessing at one, never name a tie to someone not in this chapter, ' +
  'and where none of the words fits, omit the pair rather than stretching one.';

/** Every pass that reads a chapter writes its people down the same way. */
async function recordCharacters(bookId: string, chapterIdx: number, characters: Character[]) {
  for (const person of characters) {
    if (!person?.name?.trim()) continue;
    const entityId = await findOrCreateEntity(bookId, 'character', person.name.trim(), person.aliases ?? []);
    await addObservation({
      book_id: bookId,
      entity_id: entityId,
      chapter_idx: chapterIdx,
      appearance: person.appearance ?? null,
      voice: person.voice ?? null,
      note: person.note ?? null,
    });
    const changes: Record<string, string> = {};
    if (person.role?.trim()) changes.role = person.role.trim();
    if (person.age?.trim()) changes.age = person.age.trim();
    if (person.gender?.trim()) changes.gender = person.gender.trim();
    if (Object.keys(changes).length) await updateCast(entityId, changes);
    if (Array.isArray(person.details)) await mergeFields(entityId, person.details);
  }
}

/**
 * A place the model named for *this* chapter is recorded against it, the same
 * way a character is. Without that, a chapter's places could only be guessed at
 * by counting which place names its text happens to spell — which is how a
 * chapter ends up listing somewhere it never visits.
 */
async function recordPlaces(
  bookId: string,
  chapterIdx: number,
  places: { name?: string; note?: string; details?: Detail[]; location?: unknown }[]
) {
  for (const place of places) {
    if (!place?.name?.trim()) continue;
    const entityId = await findOrCreateEntity(bookId, 'place', place.name.trim(), []);
    // Where it is belongs to the place itself, not to the chapter that named
    // it: a camp does not move between chapters, and the first chapter to say
    // which province it is in has said it for good.
    if (Array.isArray(place.details)) await mergeFields(entityId, place.details);
    const pin = parsePin(place.location);
    if (pin) await setPinIfUnset(entityId, pin);
    await addObservation({
      book_id: bookId,
      entity_id: entityId,
      chapter_idx: chapterIdx,
      appearance: null,
      voice: null,
      note: place.note?.trim() || null,
    });
  }
}

/**
 * A term is recorded exactly as a place is, and for the same reason: what the
 * chapter said about it belongs to the chapter, and what it *is* is those
 * notes read together.
 */
async function recordTerms(
  bookId: string,
  chapterIdx: number,
  terms: { name?: string; note?: string; details?: Detail[] }[]
) {
  for (const term of terms) {
    if (!term?.name?.trim()) continue;
    const entityId = await findOrCreateEntity(bookId, 'term', term.name.trim(), []);
    if (Array.isArray(term.details)) await mergeFields(entityId, term.details);
    await addObservation({
      book_id: bookId,
      entity_id: entityId,
      chapter_idx: chapterIdx,
      appearance: null,
      voice: null,
      note: term.note?.trim() || null,
    });
  }
}

/**
 * Ties are written down as the chapters go by rather than only by the
 * whole-book pass: by the time a reader opens a character, the chapters
 * already analyzed should say who that character is to everyone else.
 * A name the chapter invented for the occasion is dropped — a relation is only
 * recorded between two people this book already has profiles for.
 */
async function recordRelations(bookId: string, chapterIdx: number, ties: TieResult[]) {
  if (!ties.length) return;
  const known = await listEntities(bookId, 'character');
  const byName = new Map<string, string>();
  for (const entity of known) {
    for (const name of namesOf(entity)) byName.set(name.toLowerCase(), entity.id);
  }
  for (const tie of ties) {
    const from = byName.get(tie?.from?.trim().toLowerCase() ?? '');
    const to = byName.get(tie?.to?.trim().toLowerCase() ?? '');
    // A word that is not one of the sixteen is not a tie this book can draw.
    const label = parseTie(tie?.label);
    if (!from || !to || from === to || !label) continue;
    await recordRelation({ book_id: bookId, from_id: from, to_id: to, label, chapter_idx: chapterIdx });
  }
}

/**
 * The model answers in paragraph numbers, so placing a scene is a lookup, not
 * a search. A number outside the chapter is dropped rather than clamped: it
 * means the model guessed, and a wrong boundary is worse than one less scene.
 *
 * The first scene always starts where the chapter does, whatever the model
 * says, and the last runs to the end of it — including the tail beyond what
 * was sent, which belongs to the last scene if it belongs to anything.
 */
function locateScenes(paragraphs: ChapterParagraph[], chapter: Chapter, scenes: SceneResult[]) {
  return tile(
    chapter,
    scenes,
    (index) =>
      Number.isInteger(index) && index >= 0 && index < paragraphs.length
        ? paragraphs[index].offset
        : null
  );
}

/**
 * A cited chapter is split the way its own edition numbers it. A verse the
 * chapter does not contain is dropped rather than clamped — the model named a
 * verse from somewhere else, and a scene starting nowhere is worse than one
 * scene fewer.
 */
function locateVerseScenes(verses: Verse[], chapter: Chapter, scenes: SceneResult[]) {
  const offsets = new Map(verses.map((verse) => [verse.number, verse.start]));
  return tile(chapter, scenes, (number) => offsets.get(number) ?? null);
}

/** Whatever the numbers meant, scenes tile their chapter with no gaps. */
function tile(
  chapter: Chapter,
  scenes: SceneResult[],
  offsetOf: (at: number) => number | null
) {
  const seen = new Set<number>();
  const found: { start: number; end: number; title: string | null; summary: string | null }[] = [];
  for (const scene of scenes) {
    const at = Number(scene.start);
    const offset = offsetOf(at);
    if (offset === null || seen.has(at)) continue;
    seen.add(at);
    found.push({
      start: offset,
      end: 0,
      title: scene.title?.trim() || null,
      summary: scene.summary?.trim() || null,
    });
  }
  if (!found.length) return [];
  found.sort((a, b) => a.start - b.start);
  found[0].start = chapter.start;
  for (let i = 0; i < found.length; i++) {
    found[i].end = i + 1 < found.length ? found[i + 1].start : chapter.end;
  }
  return found;
}

/**
 * One pass that reads a chapter *in the context of the book so far* — its
 * summary, the chapters just before, and everyone already known — so the names
 * come back consistent and the brief knows what it is continuing from.
 */
async function deepAnalyze(job: WorkJob, signal: AbortSignal) {
  const { book, chapters, chapter, text, passage, verses } = await loadChapter(job);
  const characters = await listEntities(job.book_id, 'character');
  const places = await listEntities(job.book_id, 'place');
  const kind = kindOf(book.kind);
  const wantsCast = kind.features.includes('cast');
  const wantsTerms = kind.features.includes('terms');
  // A cited book is split by verse, a sent one by paragraph — and a cited
  // chapter with no verses recorded cannot be split at all, so it is not asked.
  const byVerse = citedNotSent(book);
  const wantsScenes = kind.features.includes('scenes') && (!byVerse || verses.length > 0);

  const previous = chapters.find((entry) => entry.idx === chapter.idx - 1);
  const previousScenes = previous && wantsScenes ? await listChapterScenes(previous.id) : [];
  // Numbering costs tokens per paragraph, so it only goes out when the answer
  // is going to be paragraph numbers.
  const paragraphs = wantsScenes && !byVerse ? chapterParagraphs(text, chapter) : [];

  const shape = [
    '"brief":"one or two sentences on what happens"',
    wantsScenes && '"scenes":[{"start":0,"title","summary"}]',
    wantsCast && `"characters":[${PROFILE_SHAPE}]`,
    wantsCast && `"places":[${kind.fiction ? PLACE_SHAPE : PINNED_PLACE_SHAPE}]`,
    wantsTerms && '"terms":[{"name","note","details":[{"label","value"}]}]',
    wantsCast && '"relations":[{"from","to","label"}]',
  ]
    .filter(Boolean)
    .join(',');

  const rules = [
    // A story is followed; an argument is weighed. Same pass, different question.
    kind.reads === 'argument' &&
      'This is one section of a paper, not a chapter of a story. The brief says what ' +
        'the section claims and what it rests on — question, method, data, result, ' +
        'limitation, as far as each appears here. State what the authors assert as ' +
        'their assertion, not as fact, and never supply a number the section does not.',
    wantsScenes && !byVerse && 'Its paragraphs are numbered in brackets: [0], [1], [2] and so on.',
    wantsScenes && (byVerse ? VERSE_SCENE_RULES : SCENE_RULES),
    wantsCast &&
      'Reuse the exact names listed under CHARACTERS ALREADY KNOWN — never a new ' +
        'spelling of someone already there; put any new form in "aliases". ' +
        '"appearance" and "voice" carry only what *this* chapter states. ' +
        `${PROFILE_RULES} Skip people only mentioned in passing.`,
    wantsCast && PLACE_RULES,
    wantsCast && !kind.fiction && PIN_RULES,
    wantsTerms && TERM_RULES,
    wantsCast && RELATION_RULES,
    // Without this a profile of Paul reads like a character study of an
    // invented person: motives assigned, arc predicted, traits embellished.
    wantsCast && !kind.fiction &&
      'The people here are real and this text is read as a record of them. ' +
        'Write only what the text states or plainly implies — no invented motive, ' +
        'no arc, no reading of them as a character an author designed.',
  ]
    .filter(Boolean)
    .join(' ');

  const answer = await ask(
    'deep-analyze',
    [
      {
        role: 'system',
        content:
          `You are reading one chapter of ${kind.subject}, with the book so far as context. ` +
          `${rules} Reply with JSON only: {${shape}}.`,
      },
      {
        role: 'user',
        content: assemble({
          book,
          chapter,
          chapters,
          // A cast list is only worth its tokens to a pass that answers with names.
          characters: wantsCast ? characters : [],
          places: wantsCast ? places : [],
          terms: wantsTerms ? await listEntities(job.book_id, 'term') : [],
          text,
          passage,
          previousScenes,
          paragraphs: paragraphs.length ? paragraphs : undefined,
        }),
      },
    ],
    // Scenes are the last thing written and the first thing a tight budget
    // loses, and a truncated answer is no answer at all: the JSON fails to
    // parse and the chapter comes back with nothing, not with less.
    // Terms are the fifth of six answers, so a budget that fits without them
    // is a budget they fall off the end of.
    wantsCast ? (wantsTerms ? 3000 : 2400) : 400,
    signal
  );

  const result = citedNotSent(book) ? readCited<DeepResult>(answer) : parseJson<DeepResult>(answer);
  if (result.brief?.trim()) await setChapterBrief(chapter.id, result.brief.trim());

  if (wantsCast) {
    await recordCharacters(job.book_id, chapter.idx, result.characters ?? []);
    await recordPlaces(job.book_id, chapter.idx, result.places ?? []);
    // After the people: a tie can only be recorded between two profiles that exist.
    await recordRelations(job.book_id, chapter.idx, result.relations ?? []);
  }

  if (wantsTerms) await recordTerms(job.book_id, chapter.idx, result.terms ?? []);

  if (wantsScenes) {
    const located = byVerse
      ? locateVerseScenes(verses, chapter, result.scenes ?? [])
      : locateScenes(paragraphs, chapter, result.scenes ?? []);
    if (located.length) await replaceScenes(job.book_id, chapter.id, located, 'ai');
  }
}

/**
 * The same shape as a character profile and deliberately not the same content.
 * A place has no face, voice or arc; what it accumulates across a book is what
 * it is, what happens there and what changes about it — so that is what gets
 * written, from the per-chapter notes the chapter passes left behind.
 */
async function polishPlace(job: WorkJob, signal: AbortSignal) {
  const { entityId } = JSON.parse(job.payload) as { entityId: string };
  const entity = await getEntity(entityId);
  if (!entity) throw new Error('place is gone');
  const book = await getBook(job.book_id);
  const chapters = await listChapters(job.book_id);
  const observations = await listObservations(entityId);
  if (!observations.length) throw new Error('nothing observed yet');

  const seen = observations
    .map((row) => `Chapter ${row.chapter_idx + 1}: ${row.note ?? ''}`.trim())
    .join('\n');

  // A novel's places are nowhere; a bible's and a history's are somewhere you
  // could go, and where that is is the one thing the text will not tell you.
  const real = book ? !kindOf(book.kind).fiction : false;

  const answer = await ask(
    'place-polish',
    [
      {
        role: 'system',
        content:
          'You write a profile of a place in a book from per-chapter notes about it. ' +
          `Reply with JSON only: {"summary","details":[{"label","value"}]${
            real ? ',"location":{"modern","certainty"}' : ''
          }}. ` +
          '"summary" is two or three sentences: what the place is, what it is like, ' +
          'and what happens there. "details" is the rest as short label/value pairs in ' +
          'the language of the book — what kind of place it is, where it sits, who holds ' +
          'it, what it is known for, how it changes. A place has no age, face or voice; ' +
          'do not invent one. Use only what the notes state; contradictions are kept, ' +
          'not resolved — say "described as X early and Y later".' +
          (real ? ` ${PIN_RULES}` : ''),
      },
      {
        role: 'user',
        content: [
          book ? bookHeader(book, chapters) : '',
          `PLACE: ${entity.name}${entity.alias ? ` (${entity.alias})` : ''}`,
          `NOTES\n${seen}`,
        ]
          .filter(Boolean)
          .join('\n\n'),
      },
    ],
    700,
    signal
  );

  const polished = parseJson<{ summary?: string; details?: Detail[]; location?: unknown }>(answer);
  if (polished.summary?.trim()) await updateEntity(entityId, { summary: polished.summary.trim() });
  if (Array.isArray(polished.details)) await mergeFields(entityId, polished.details);

  const pin = real ? parsePin(polished.location) : null;
  if (pin) await updateEntity(entityId, pin);
}

/** The cast pass without the brief — cheaper, for when only names are wanted. */
async function castChapter(job: WorkJob, signal: AbortSignal) {
  const { book, chapters, chapter, text, passage } = await loadChapter(job);
  const characters = await listEntities(job.book_id, 'character');
  const pinned = !kindOf(book.kind).fiction;

  const answer = await ask(
    'cast-chapter',
    [
      {
        role: 'system',
        content:
          'You catalog the cast of one chapter of a novel. Reply with JSON only: ' +
          `{"characters":[${PROFILE_SHAPE}],` +
          `"places":[${pinned ? PINNED_PLACE_SHAPE : PLACE_SHAPE}]}. Reuse the exact ` +
          'names already known; put a new form in "aliases". ' +
          `${PROFILE_RULES} ${PLACE_RULES}${pinned ? ` ${PIN_RULES}` : ''}`,
      },
      {
        role: 'user',
        content: [
          bookHeader(book, chapters),
          castList(characters) && `CHARACTERS ALREADY KNOWN\n${castList(characters)}`,
          `CHAPTER ${chapter.idx + 1}\n${chapterMaterial(book, chapter, text, passage)}`,
        ]
          .filter(Boolean)
          .join('\n\n'),
      },
    ],
    1200,
    signal
  );

  // A refusal here used to parse to nothing and finish as a success, so a
  // chapter nobody could answer for came back with an empty cast and no sign
  // that anything had gone wrong.
  const result = citedNotSent(book) ? readCited<DeepResult>(answer) : parseJson<DeepResult>(answer);
  await recordCharacters(job.book_id, chapter.idx, result.characters ?? []);
  await recordPlaces(job.book_id, chapter.idx, result.places ?? []);
}

/**
 * What the places are called now, asked once for the whole book. A place named
 * in Judges is named in fifty other chapters, and letting each chapter's pass
 * place it again would buy the same answer fifty times — so every place that
 * has never been placed goes out together, forty to a request, and the answer
 * comes back as a list of names.
 */
async function locatePlaces(job: WorkJob, signal: AbortSignal) {
  const { ids } = JSON.parse(job.payload) as { ids: string[] };
  const book = await getBook(job.book_id);
  const chapters = await listChapters(job.book_id);
  const wanted = new Set(ids);
  // Re-read rather than trust the payload: an earlier batch, or a hand-typed
  // name, may have placed some of these since the run was queued.
  const places = (await listUnlocatedPlaces(job.book_id)).filter((place) => wanted.has(place.id));
  if (!places.length) return;

  const answer = await ask(
    'place-locate',
    [
      {
        role: 'system',
        content:
          'You are given the places named in a book. Say where each one is today. ' +
          'Reply with JSON only: {"places":[{"name","modern","certainty"}]}, where ' +
          `"name" is copied exactly from the list. ${LOCATE_RULES}`,
      },
      {
        role: 'user',
        content: [
          book ? bookHeader(book, chapters) : '',
          `PLACES\n${places.map((place) => `- ${place.name}${place.alias ? ` (${place.alias})` : ''}`).join('\n')}`,
        ]
          .filter(Boolean)
          .join('\n\n'),
      },
    ],
    Math.min(2400, 200 + places.length * 40),
    signal
  );

  const result = parseJson<{ places?: { name?: string }[] }>(answer);
  const byName = new Map(places.map((place) => [place.name.trim().toLowerCase(), place.id]));
  for (const entry of result.places ?? []) {
    const entityId = byName.get(String(entry?.name ?? '').trim().toLowerCase());
    const pin = parsePin(entry);
    if (entityId && pin) await setPinIfUnset(entityId, pin);
  }
}

/**
 * The article each real person has outside this book, asked for the whole cast
 * at once. Only the link: what an encyclopedia says about Deborah is not this
 * app's to recite, and a link is a claim the reader can check in one tap,
 * where a recalled paragraph is one they would have to take on trust.
 */
async function linkPeople(job: WorkJob, signal: AbortSignal) {
  const { ids } = JSON.parse(job.payload) as { ids: string[] };
  const book = await getBook(job.book_id);
  const chapters = await listChapters(job.book_id);
  const wanted = new Set(ids);
  const people = (await listEntities(job.book_id, 'character')).filter(
    (person) => wanted.has(person.id) && !person.wiki && !hasWiki(parseFields(person.fields))
  );
  if (!people.length) return;

  const answer = await ask(
    'person-link',
    [
      {
        role: 'system',
        content:
          'You are given the people named in a book, all of them real. For each, ' +
          'give their Wikipedia article. Reply with JSON only: ' +
          '{"people":[{"name","wikipedia"}]}, where "name" is copied exactly from ' +
          'the list and "wikipedia" is the exact title of an English Wikipedia ' +
          'article you are sure exists — "Deborah (biblical figure)", "Samson" — ' +
          'or its full https://…wikipedia.org/wiki/… address. A people is one of ' +
          'them: a nation, a tribe, a race or a family named as one actor — the ' +
          'Israelites, the Philistines, the Tribe of Judah — has an article like ' +
          'anybody else, and gets it. Leave one out of your answer entirely only ' +
          'when there is no article of its own, when the name belongs to several ' +
          'and this book does not say which, or when you would be guessing at the ' +
          'title — a link to nothing is worse than none.',
      },
      {
        role: 'user',
        content: [
          book ? bookHeader(book, chapters) : '',
          `PEOPLE\n${people.map((person) => `- ${person.name}${person.alias ? ` (${person.alias})` : ''}`).join('\n')}`,
        ]
          .filter(Boolean)
          .join('\n\n'),
      },
    ],
    Math.min(2400, 200 + people.length * 40),
    signal
  );

  const result = parseJson<{ people?: { name?: string; wikipedia?: string }[] }>(answer);
  const byName = new Map(people.map((person) => [person.name.trim().toLowerCase(), person.id]));
  for (const entry of result.people ?? []) {
    const entityId = byName.get(String(entry?.name ?? '').trim().toLowerCase());
    const link = parseWikiLink(entry?.wikipedia);
    if (entityId && link) await setWikiIfUnset(entityId, link);
  }
}

/**
 * One chapter of one translation, as a queued job. It used to be the whole
 * book inside a sheet you had to keep open: a novel is thousands of sentences
 * and tens of minutes, and leaving the page — or the phone locking — took the
 * run with it. A chapter is the unit because it is what a reader reaches for,
 * what a failure can be retried alone, and what the progress bar counts.
 */
async function translateChapter(job: WorkJob, signal: AbortSignal) {
  const { target } = JSON.parse(job.payload) as { target: string };
  const book = await getBook(job.book_id);
  if (!book) throw new Error('book is gone');
  if (job.chapter_idx === null) throw new Error('no chapter to translate');
  const text = await getDocumentText(job.book_id);
  const run = await translate(job.book_id, target, text, book.language, {
    signal,
    chapterIdx: job.chapter_idx,
  });
  // A failure here is a span the model would not line up, and it is worth
  // saying so: the chapter looks translated apart from the sentences missing
  // out of the middle of it.
  if (run.failed) throw new Error(`${run.failed} sentences did not line up`);
}

/**
 * The free half of a cast run, and the reason it is its own unit: counting
 * where a name occurs is `indexOf` over text already on the device, so it runs
 * once at the end rather than being re-done after every chapter.
 */
async function wrapUpCast(job: WorkJob) {
  const chapters = await listChapters(job.book_id);
  const text = await getDocumentText(job.book_id);
  const characters = await listEntities(job.book_id, 'character');
  const places = await listEntities(job.book_id, 'place');
  const terms = await listEntities(job.book_id, 'term');
  await replaceMentions(
    job.book_id,
    countMentions(text, chapters, [...characters, ...places, ...terms])
  );

  // A profile is its observations joined — not a second thing to keep in sync.
  // Rebuilt from all of them every time, so analyzing more chapters extends the
  // profile and re-analyzing an old one rewrites its part of it.
  for (const entity of characters) {
    if (entity.source !== 'ai') continue;
    const observations = await listObservations(entity.id);
    await updateCast(entity.id, {
      appearance: mergeClauses(observations.map((row) => row.appearance)),
      voice: mergeClauses(observations.map((row) => row.voice)),
    });
  }
}

const CLAUSE = /[,，。.;；、\n]+/;

/**
 * Twenty chapters all noticing the same blue hair produce twenty near-copies of
 * one phrase, and joining those verbatim reads as a stutter. Splitting on
 * punctuation and dropping every clause already covered by a longer one keeps
 * what each chapter added without repeating what it agreed with. This is the
 * free, local merge; `character-polish` is what turns it into prose.
 */
function mergeClauses(values: (string | null)[]): string | null {
  const kept: string[] = [];
  for (const value of values) {
    for (const raw of (value ?? '').split(CLAUSE)) {
      const clause = raw.trim();
      if (!clause || kept.some((existing) => existing.includes(clause))) continue;
      for (let i = kept.length - 1; i >= 0; i--) {
        if (clause.includes(kept[i])) kept.splice(i, 1);
      }
      kept.push(clause);
    }
  }
  return kept.join(' · ') || null;
}

type Polished = {
  summary?: string;
  role?: string;
  age?: string;
  gender?: string;
  appearance?: string;
  voice?: string;
  arc?: string;
  details?: Detail[];
};

/**
 * A picture, drawn from the prompt the reader approved.
 *
 * The prompt is settled on the page before this runs — what the chapters said,
 * edited by whoever is reading — so the job has nothing to decide. It draws,
 * writes the file, and files it under whatever it was drawn for. Nothing is
 * written over: the drawing you keep is rarely the first one.
 */
async function drawSomething(job: WorkJob, signal: AbortSignal) {
  const wanted = JSON.parse(job.payload) as {
    prompt: string;
    kind: ImageKind;
    entityId?: string | null;
    chapterIdx?: number | null;
    start?: number | null;
    end?: number | null;
  };
  const bytes = await drawImage(wanted.prompt, wanted.kind === 'cover' ? 'portrait' : 'square', signal);
  const path = writeImage(`drawn-${Date.now().toString(36)}.png`, bytes);
  await addImage({ bookId: job.book_id, path, ...wanted });
}

/**
 * Turns one character's per-chapter observations into prose. The observations
 * stay untouched underneath, so a polish can be run again, and a continuity
 * check still has the disagreements to find.
 */
async function polishCharacter(job: WorkJob, signal: AbortSignal) {
  const { entityId } = JSON.parse(job.payload) as { entityId: string };
  const entity = await getEntity(entityId);
  if (!entity) throw new Error('character is gone');
  const book = await getBook(job.book_id);
  const chapters = await listChapters(job.book_id);
  const observations = await listObservations(entityId);
  if (!observations.length) throw new Error('nothing observed yet');

  const seen = observations
    .map((row) =>
      `Chapter ${row.chapter_idx + 1}: ${[row.appearance, row.voice, row.note].filter(Boolean).join(' / ')}`
    )
    .join('\n');

  const answer = await ask(
    'character-polish',
    [
      {
        role: 'system',
        content:
          'You write a character profile from per-chapter notes about one person. ' +
          'Reply with JSON only: {"summary","role","age","gender","appearance","voice",' +
          '"arc","details":[{"label","value"}]}. ' +
          '"summary" is two or three sentences. "arc" is how they change across the book, ' +
          'or omit it if they do not. "details" is the rest of who they are as short ' +
          'label/value pairs — schooling, rank, occupation, where they have lived, family, ' +
          'and whatever this genre tracks — in the language of the book. ' +
          'Use only what the notes state; contradictions are ' +
          'kept, not resolved — say "described as X early and Y later".',
      },
      {
        role: 'user',
        content: [
          book ? bookHeader(book, chapters) : '',
          `CHARACTER: ${entity.name}${entity.alias ? ` (${entity.alias})` : ''}`,
          `NOTES\n${seen}`,
        ]
          .filter(Boolean)
          .join('\n\n'),
      },
    ],
    800,
    signal
  );

  const polished = parseJson<Polished>(answer);
  if (polished.summary?.trim()) await updateEntity(entityId, { summary: polished.summary.trim() });
  await updateCast(entityId, {
    role: polished.role?.trim() || entity.role,
    age: polished.age?.trim() || entity.age,
    gender: polished.gender?.trim() || entity.gender,
    appearance: polished.appearance?.trim() || entity.appearance,
    voice: polished.voice?.trim() || entity.voice,
    arc: polished.arc?.trim() || entity.arc,
  });
  if (Array.isArray(polished.details)) await mergeFields(entityId, polished.details);
}
