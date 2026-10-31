import { AppState, InteractionManager, NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { db } from '../db';
import { ON_SHELF, TOPIC_KIND } from '../books/kinds';
import { topicName } from '../db/topics';
import { imageUri } from '../storage/files';
import { demoMode } from '../dev/demo';
import i18n from '../i18n';

type Entry = { id: string; title: string; subtitle?: string; keywords?: string[]; image?: string };

const native = NativeModules.Spotlight as { replaceAll(entries: Entry[]): Promise<boolean> } | undefined;
const LAST = 'spotlight.fingerprint';
/** The routes a Spotlight result may open; anything else in a link is ignored. */
export const SPOTLIGHT_ROUTE = /^\/(book|card|entity|place)\/[^/?#]+$/;

const joined = (...parts: (string | null | undefined)[]) => parts.filter((part) => part?.trim()).join(' · ');

/** Books with their authors, flashcards, characters and places — each the route it opens. */
async function entries(): Promise<Entry[]> {
  const database = await db();
  const t = i18n.t.bind(i18n);
  const books = await database.getAllAsync<{ id: string; title: string; author: string | null; cover_path: string | null }>(
    `SELECT b.id, b.title, b.author, b.cover_path FROM books b WHERE ${ON_SHELF}`
  );
  const named = await database.getAllAsync<{
    id: string; kind: string; name: string; alias: string | null; summary: string | null;
    book_title: string; book_kind: string;
  }>(
    `SELECT e.id, e.kind, e.name, e.alias, e.summary, b.title AS book_title, b.kind AS book_kind
       FROM entities e JOIN books b ON b.id = e.book_id
      WHERE e.kind IN ('card', 'character', 'place') AND TRIM(e.name) != ''`
  );
  const filePath = (uri?: string) => (uri ? decodeURIComponent(uri.replace(/^file:\/\//, '')) : undefined);

  return [
    ...books.map((book) => ({
      id: `/book/${book.id}`,
      title: book.title,
      subtitle: book.author ?? undefined,
      keywords: book.author ? [book.author] : undefined,
      image: filePath(imageUri(book.cover_path)),
    })),
    ...named.map((entity) => {
      const source = entity.book_kind === TOPIC_KIND ? topicName(entity.book_title) : entity.book_title;
      const route = entity.kind === 'card' ? 'card' : entity.kind === 'place' ? 'place' : 'entity';
      return {
        id: `/${route}/${entity.id}`,
        title: entity.alias ? `${entity.name} · ${entity.alias}` : entity.name,
        subtitle: joined(t(`spotlight.${entity.kind}`), source, entity.kind === 'card' ? entity.summary : null),
        keywords: [entity.alias, source].filter((word): word is string => Boolean(word)),
      };
    }),
  ];
}

function fingerprint(list: Entry[]): string {
  const text = JSON.stringify(list);
  let hash = 0x811c9dc5;
  for (let at = 0; at < text.length; at++) hash = Math.imul(hash ^ text.charCodeAt(at), 0x01000193);
  return `${list.length}:${(hash >>> 0).toString(36)}`;
}

/** Spotlight made to match the library, written only when something changed. */
export async function syncSpotlight(): Promise<void> {
  if (!native) return;
  const list = demoMode() ? [] : await entries();
  const now = fingerprint(list);
  if ((await AsyncStorage.getItem(LAST)) === now) return;
  await native.replaceAll(list);
  await AsyncStorage.setItem(LAST, now);
}

/** Once the app is up, and each time it is put away — the moment edits are done. */
export function watchSpotlight(): () => void {
  const sync = () => void syncSpotlight().catch(() => undefined);
  const task = InteractionManager.runAfterInteractions(sync);
  const subscription = AppState.addEventListener('change', (next) => {
    if (next === 'background') sync();
  });
  return () => {
    task.cancel();
    subscription.remove();
  };
}
