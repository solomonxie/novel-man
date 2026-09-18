import { parseJson } from '../ai/run';
import { contentHash, readCache, writeCache } from '../ai/cache';
import { runChat } from '../ai/keys';
import type { ChatMessage } from '../ai/client';
import {
  addObservation,
  findOrCreateEntity,
  getBook,
  getDocumentText,
  getEntity,
  listChapters,
  listVerses,
  listEntities,
  listChapterScenes,
  listObservations,
  mergeFields,
  recordRelation,
  replaceMentions,
  replaceScenes,
  setChapterBrief,
  updateBook,
  updateCast,
  updateEntity,
  type Book,
  type Chapter,
} from '../db/repo';
import { countMentions, namesOf } from '../cast/mentions';
import { kindOf } from '../books/kinds';
import type { WorkJob, WorkKind } from '../db/work';
import {
  assemble,
  bookHeader,
  castList,
  chapterMaterial,
  chapterParagraphs,
  citedNotSent,
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
  'chapter-brief': briefChapter,
  'deep-analyze': deepAnalyze,
  'cast-chapter': castChapter,
  'cast-wrapup': wrapUpCast,
  'character-polish': polishCharacter,
  'place-polish': polishPlace,
  'scene-suggest': notHere,
  'translate-span': notHere,
  'script-scene': notHere,
};

async function notHere(): Promise<void> {
  throw new Error('no handler registered');
}

/** Shared by every handler: ask once, keep the answer, never pay twice. */
async function ask(kind: string, messages: ChatMessage[], maxTokens: number, signal: AbortSignal) {
  const hash = contentHash(kind, ...messages.map((message) => message.content));
  const cached = await readCache(hash);
  if (cached !== null) return cached;
  const answer = await runChat(messages, { maxTokens, signal });
  await writeCache(hash, kind, answer);
  return answer;
}

async function loadChapter(job: WorkJob): Promise<{
  book: Book;
  chapters: Chapter[];
  chapter: Chapter;
  text: string;
  passage?: Passage;
}> {
  const book = await getBook(job.book_id);
  if (!book) throw new Error('book is gone');
  const chapters = await listChapters(job.book_id);
  const chapter = chapters.find((entry) => entry.idx === job.chapter_idx);
  if (!chapter) throw new Error('chapter is gone');
  const text = await getDocumentText(job.book_id);
  // A chapter that is cited rather than sent needs its verse range, and only
  // that: the query is one row, against a book whose text never goes out.
  if (!citedNotSent(book)) return { book, chapters, chapter, text };
  const verses = await listVerses(chapter.id);
  const passage = verses.length
    ? { first: verses[0].number, last: verses[verses.length - 1].number }
    : undefined;
  return { book, chapters, chapter, text, passage };
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
  await setChapterBrief(chapter.id, answer.trim() || null);
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

type Tie = { from: string; to: string; label: string };

type DeepResult = {
  brief?: string;
  scenes?: SceneResult[];
  characters?: Character[];
  places?: { name: string; note?: string; details?: Detail[] }[];
  relations?: Tie[];
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

const RELATION_RULES =
  '"relations" are the ties this chapter shows between two of its people — ' +
  'family, rank, allegiance, rivalry, who works for whom. "from" and "to" are ' +
  'names from "characters" or from the list already known, spelled exactly as ' +
  'they appear there; "label" is two or three words in the language of the book. ' +
  'Only what this chapter states or plainly shows: omit a pair rather than ' +
  'guessing at one, and never name a tie to someone not in this chapter.';

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
  places: { name?: string; note?: string; details?: Detail[] }[]
) {
  for (const place of places) {
    if (!place?.name?.trim()) continue;
    const entityId = await findOrCreateEntity(bookId, 'place', place.name.trim(), []);
    // Where it is belongs to the place itself, not to the chapter that named
    // it: a camp does not move between chapters, and the first chapter to say
    // which province it is in has said it for good.
    if (Array.isArray(place.details)) await mergeFields(entityId, place.details);
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
 * Ties are written down as the chapters go by rather than only by the
 * whole-book pass: by the time a reader opens a character, the chapters
 * already analyzed should say who that character is to everyone else.
 * A name the chapter invented for the occasion is dropped — a relation is only
 * recorded between two people this book already has profiles for.
 */
async function recordRelations(bookId: string, chapterIdx: number, ties: Tie[]) {
  if (!ties.length) return;
  const known = await listEntities(bookId, 'character');
  const byName = new Map<string, string>();
  for (const entity of known) {
    for (const name of namesOf(entity)) byName.set(name.toLowerCase(), entity.id);
  }
  for (const tie of ties) {
    const from = byName.get(tie?.from?.trim().toLowerCase() ?? '');
    const to = byName.get(tie?.to?.trim().toLowerCase() ?? '');
    if (!from || !to || from === to || !tie.label?.trim()) continue;
    await recordRelation({
      book_id: bookId,
      from_id: from,
      to_id: to,
      label: tie.label.trim(),
      chapter_idx: chapterIdx,
    });
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
  const seen = new Set<number>();
  const found: { start: number; end: number; title: string | null; summary: string | null }[] = [];
  for (const scene of scenes) {
    const index = Number(scene.start);
    if (!Number.isInteger(index) || index < 0 || index >= paragraphs.length) continue;
    if (seen.has(index)) continue;
    seen.add(index);
    found.push({
      start: paragraphs[index].offset,
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
  const { book, chapters, chapter, text, passage } = await loadChapter(job);
  const characters = await listEntities(job.book_id, 'character');
  const places = await listEntities(job.book_id, 'place');
  const kind = kindOf(book.kind);
  const wantsScenes = kind.features.includes('scenes');
  const wantsCast = kind.features.includes('cast');

  const previous = chapters.find((entry) => entry.idx === chapter.idx - 1);
  const previousScenes = previous && wantsScenes ? await listChapterScenes(previous.id) : [];
  // Numbering costs tokens per paragraph, so it only goes out when the answer
  // is going to be paragraph numbers.
  const paragraphs = wantsScenes ? chapterParagraphs(text, chapter) : [];

  const shape = [
    '"brief":"one or two sentences on what happens"',
    wantsScenes && '"scenes":[{"start":0,"title","summary"}]',
    wantsCast && `"characters":[${PROFILE_SHAPE}]`,
    wantsCast && '"places":[{"name","note","details":[{"label","value"}]}]',
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
    wantsScenes && 'Its paragraphs are numbered in brackets: [0], [1], [2] and so on.',
    wantsScenes && SCENE_RULES,
    wantsCast &&
      'Reuse the exact names listed under CHARACTERS ALREADY KNOWN — never a new ' +
        'spelling of someone already there; put any new form in "aliases". ' +
        '"appearance" and "voice" carry only what *this* chapter states. ' +
        `${PROFILE_RULES} Skip people only mentioned in passing.`,
    wantsCast && PLACE_RULES,
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
          text,
          passage,
          previousScenes,
          paragraphs: wantsScenes ? paragraphs : undefined,
        }),
      },
    ],
    // Scenes are the last thing written and the first thing a tight budget
    // loses, and a truncated answer is no answer at all: the JSON fails to
    // parse and the chapter comes back with nothing, not with less.
    wantsCast ? 2400 : 400,
    signal
  );

  const result = parseJson<DeepResult>(answer);
  if (result.brief?.trim()) await setChapterBrief(chapter.id, result.brief.trim());

  if (wantsCast) {
    await recordCharacters(job.book_id, chapter.idx, result.characters ?? []);
    await recordPlaces(job.book_id, chapter.idx, result.places ?? []);
    // After the people: a tie can only be recorded between two profiles that exist.
    await recordRelations(job.book_id, chapter.idx, result.relations ?? []);
  }

  if (wantsScenes) {
    const located = locateScenes(paragraphs, chapter, result.scenes ?? []);
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

  const answer = await ask(
    'place-polish',
    [
      {
        role: 'system',
        content:
          'You write a profile of a place in a book from per-chapter notes about it. ' +
          'Reply with JSON only: {"summary","details":[{"label","value"}]}. ' +
          '"summary" is two or three sentences: what the place is, what it is like, ' +
          'and what happens there. "details" is the rest as short label/value pairs in ' +
          'the language of the book — what kind of place it is, where it sits, who holds ' +
          'it, what it is known for, how it changes. A place has no age, face or voice; ' +
          'do not invent one. Use only what the notes state; contradictions are kept, ' +
          'not resolved — say "described as X early and Y later".',
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

  const polished = parseJson<{ summary?: string; details?: Detail[] }>(answer);
  if (polished.summary?.trim()) await updateEntity(entityId, { summary: polished.summary.trim() });
  if (Array.isArray(polished.details)) await mergeFields(entityId, polished.details);
}

/** The cast pass without the brief — cheaper, for when only names are wanted. */
async function castChapter(job: WorkJob, signal: AbortSignal) {
  const { book, chapters, chapter, text, passage } = await loadChapter(job);
  const characters = await listEntities(job.book_id, 'character');

  const answer = await ask(
    'cast-chapter',
    [
      {
        role: 'system',
        content:
          'You catalog the cast of one chapter of a novel. Reply with JSON only: ' +
          `{"characters":[${PROFILE_SHAPE}],` +
          '"places":[{"name","note","details":[{"label","value"}]}]}. Reuse the exact ' +
          'names already known; put a new form in "aliases". ' +
          `${PROFILE_RULES} ${PLACE_RULES}`,
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

  const result = parseJson<DeepResult>(answer);
  await recordCharacters(job.book_id, chapter.idx, result.characters ?? []);
  await recordPlaces(job.book_id, chapter.idx, result.places ?? []);
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
  await replaceMentions(job.book_id, countMentions(text, chapters, [...characters, ...places]));

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
