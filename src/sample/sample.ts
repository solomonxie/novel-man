import { countMentions } from '../cast/mentions';
import { keepByHand } from '../books/save';
import { kindFromSource } from '../sources/registry';
import { enqueueGutenberg, subscribeToQueue } from '../import/queue';
import {
  addFlags,
  findOrCreateEntity,
  getDocumentText,
  listChapters,
  listEntities,
  mergeFields,
  replaceMentions,
  replaceRelations,
  setPinIfUnset,
  updateCast,
  updateEntity,
} from '../db/repo';
import {
  SAMPLE_GUTENBERG,
  sampleFlags,
  samplePeople,
  samplePlaces,
  sampleTies,
} from './prideAndPrejudice';

/**
 * A real book with its analysis already done, for a first look with no key.
 * The text comes from Gutenberg like any other; what a cast pass would have
 * found is applied once the import lands, and the counts are the device's own.
 */
export async function addSampleBook(): Promise<string> {
  const kind = kindFromSource('gutenberg');
  const id = await keepByHand({ title: SAMPLE_GUTENBERG.title, author: 'Jane Austen', kind });
  const job = enqueueGutenberg(SAMPLE_GUTENBERG, kind, id);
  const stop = subscribeToQueue((jobs) => {
    const mine = jobs.find((entry) => entry.id === job);
    if (!mine) {
      stop();
      return;
    }
    if (mine.status !== 'done' || !mine.bookId) return;
    stop();
    void applySampleAnalysis(mine.bookId);
  });
  return `/book/${id}`;
}

export async function applySampleAnalysis(bookId: string) {
  const ids = new Map<string, string>();

  for (const person of samplePeople) {
    const id = await findOrCreateEntity(bookId, 'character', person.name, person.aliases);
    ids.set(person.name, id);
    await updateEntity(id, { summary: person.summary });
    await updateCast(id, {
      ...(person.role ? { role: person.role } : {}),
      ...(person.age ? { age: person.age } : {}),
      ...(person.gender ? { gender: person.gender } : {}),
    });
    if (person.fields) await mergeFields(id, person.fields);
  }

  for (const place of samplePlaces) {
    const id = await findOrCreateEntity(bookId, 'place', place.name, []);
    await updateEntity(id, { summary: place.summary });
    if (place.fields) await mergeFields(id, place.fields);
    if (place.pin) await setPinIfUnset(id, place.pin);
  }

  const chapters = await listChapters(bookId);
  const text = await getDocumentText(bookId);
  const characters = await listEntities(bookId, 'character');
  const places = await listEntities(bookId, 'place');
  const mentions = countMentions(text, chapters, [...characters, ...places]);
  await replaceMentions(bookId, mentions);

  // A tie spans the chapters where both are named, as a pass would have seen it.
  const seenIn = new Map<string, Set<number>>();
  for (const mention of mentions) {
    if (!seenIn.has(mention.entity_id)) seenIn.set(mention.entity_id, new Set());
    seenIn.get(mention.entity_id)!.add(mention.chapter_idx);
  }
  const shared = (a: string, b: string) =>
    [...(seenIn.get(a) ?? [])].filter((idx) => seenIn.get(b)?.has(idx)).sort((x, y) => x - y);
  const lastChapter = Math.max(0, chapters.length - 1);
  const relations = sampleTies.flatMap((tie) => {
    const from = ids.get(tie.from);
    const to = ids.get(tie.to);
    if (!from || !to) return [];
    const both = shared(from, to);
    return [{
      from_id: from,
      to_id: to,
      label: tie.label,
      first_chapter: both[0] ?? 0,
      last_chapter: both[both.length - 1] ?? lastChapter,
    }];
  });
  await replaceRelations(bookId, relations);

  await addFlags(
    bookId,
    sampleFlags.flatMap((flag) => {
      const entity = ids.get(flag.about);
      return entity ? [{ entity_id: entity, kind: flag.kind, detail: flag.detail }] : [];
    })
  );
}
