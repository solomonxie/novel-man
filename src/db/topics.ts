import { db, newId, transaction } from './index';
import { createEntity, updateEntity, type Entity } from './repo';
import type { CardDraft } from '../sources/cardsFile';
import { ON_SHELF, TOPIC_KIND } from '../books/kinds';

/**
 * A topic is a book of kind `topic`, kept off the shelf: it holds the flash
 * cards made outside any book, so study, backup and restore treat them like
 * any other book's. Its id and title are long so nothing on a shelf can ever
 * be mistaken for one — and restore makes new ids, so the title is what
 * finds it again.
 */
const TITLE_PREFIX = 'Novel Man flash card topic · ';
const ID_PREFIX = 'novel-man-flash-card-topic-';

export function topicName(title: string): string {
  return title.startsWith(TITLE_PREFIX) ? title.slice(TITLE_PREFIX.length) : title;
}

export function cleanTopic(name: string): string {
  return name.replace(/\s+/g, ' ').trim();
}

/** The topic's book, made the first time a card is filed under it. */
export async function topicBook(name: string): Promise<string> {
  const database = await db();
  const title = TITLE_PREFIX + cleanTopic(name);
  const found = await database.getFirstAsync<{ id: string }>(
    'SELECT id FROM books WHERE kind = ? AND title = ? LIMIT 1',
    TOPIC_KIND,
    title
  );
  if (found) return found.id;
  const id = ID_PREFIX + newId();
  await transaction(async () => {
    await database.runAsync(
      `INSERT INTO books (id, title, language, kind, source_name, source_hash, source_path, source_ext, created_at)
       VALUES (?, ?, 'en', ?, '', '', '', '', ?)`,
      id,
      title,
      TOPIC_KIND,
      Date.now()
    );
    await database.runAsync("INSERT INTO documents (book_id, text, hints) VALUES (?, '', '[]')", id);
  });
  return id;
}

export async function createTopicCard(topic: string): Promise<string> {
  const name = cleanTopic(topic);
  const cardId = await createEntity(await topicBook(name), 'card', '');
  await addCardTopic(cardId, name);
  return cardId;
}

export async function topicsOf(cardId: string): Promise<string[]> {
  const database = await db();
  const rows = await database.getAllAsync<{ topic: string }>(
    'SELECT topic FROM card_topics WHERE entity_id = ? ORDER BY topic',
    cardId
  );
  return rows.map((row) => row.topic);
}

export async function addCardTopic(cardId: string, topic: string): Promise<void> {
  const name = cleanTopic(topic);
  if (!name) return;
  const database = await db();
  await database.runAsync(
    `INSERT OR IGNORE INTO card_topics (book_id, entity_id, topic)
     SELECT book_id, id, ? FROM entities WHERE id = ?`,
    name,
    cardId
  );
}

export async function removeCardTopic(cardId: string, topic: string): Promise<void> {
  const database = await db();
  await database.runAsync('DELETE FROM card_topics WHERE entity_id = ? AND topic = ?', cardId, topic);
}

/** Every topic in use, the most used first. */
export async function listTopics(): Promise<{ topic: string; cards: number }[]> {
  const database = await db();
  return database.getAllAsync(
    'SELECT topic, COUNT(*) AS cards FROM card_topics GROUP BY topic ORDER BY cards DESC, topic'
  );
}

export type Verdict = 'known' | 'later';

export const MARK_GLYPH = { favorite: '★', later: '↺', known: '✓' } as const;

export type CardLine = Entity & {
  book_title: string;
  book_kind: string;
  topics: string | null;
  tags: string | null;
  favorite: number | null;
  verdict: Verdict | null;
};

export const SEPARATOR = ' · ';

export const listOf = (joined: string | null) => (joined ? joined.split(SEPARATOR) : []);

/** Cards from every book and topic, newest first; a card never written on is not one yet. */
export async function recentCards(limit = -1): Promise<CardLine[]> {
  const database = await db();
  return database.getAllAsync<CardLine>(
    `SELECT e.*, b.title AS book_title, b.kind AS book_kind,
            (SELECT GROUP_CONCAT(topic, ' · ') FROM card_topics t WHERE t.entity_id = e.id) AS topics,
            (SELECT GROUP_CONCAT(tag, ' · ') FROM card_tags g WHERE g.entity_id = e.id) AS tags,
            m.favorite, m.verdict
       FROM entities e JOIN books b ON b.id = e.book_id
       LEFT JOIN card_marks m ON m.entity_id = e.id
      WHERE e.kind = 'card' AND TRIM(e.name) != ''
      ORDER BY e.created_at DESC LIMIT ?`,
    limit
  );
}

export async function tagsOf(cardId: string): Promise<string[]> {
  const database = await db();
  const rows = await database.getAllAsync<{ tag: string }>(
    'SELECT tag FROM card_tags WHERE entity_id = ? ORDER BY tag',
    cardId
  );
  return rows.map((row) => row.tag);
}

export async function addCardTag(cardId: string, tag: string): Promise<void> {
  const name = cleanTopic(tag.replace(/^\s*#+/, ''));
  if (!name) return;
  const database = await db();
  await database.runAsync(
    `INSERT OR IGNORE INTO card_tags (book_id, entity_id, tag)
     SELECT book_id, id, ? FROM entities WHERE id = ?`,
    name,
    cardId
  );
}

export async function removeCardTag(cardId: string, tag: string): Promise<void> {
  const database = await db();
  await database.runAsync('DELETE FROM card_tags WHERE entity_id = ? AND tag = ?', cardId, tag);
}

/** Tags used on cards sharing a topic with this one, or on any card if it has none. */
export async function nearbyTags(cardId: string): Promise<string[]> {
  const database = await db();
  const rows = await database.getAllAsync<{ tag: string }>(
    `SELECT g.tag FROM card_tags g
      WHERE NOT EXISTS (SELECT 1 FROM card_topics WHERE entity_id = ?)
         OR g.entity_id IN (SELECT entity_id FROM card_topics
                             WHERE topic IN (SELECT topic FROM card_topics WHERE entity_id = ?))
      GROUP BY g.tag ORDER BY COUNT(*) DESC, g.tag LIMIT 24`,
    cardId,
    cardId
  );
  return rows.map((row) => row.tag);
}

async function mark(cardId: string, column: 'favorite' | 'verdict', value: number | string | null) {
  const database = await db();
  // Not an upsert: its conflict clause would override the change trigger's OR IGNORE.
  await database.runAsync(
    'INSERT OR IGNORE INTO card_marks (book_id, entity_id) SELECT book_id, id FROM entities WHERE id = ?',
    cardId
  );
  await database.runAsync(
    `UPDATE card_marks SET ${column} = ?, marked_at = ? WHERE entity_id = ?`,
    value,
    Date.now(),
    cardId
  );
}

export const setFavorite = (cardId: string, favorite: boolean) => mark(cardId, 'favorite', favorite ? 1 : 0);

export const setVerdict = (cardId: string, verdict: Verdict | null) => mark(cardId, 'verdict', verdict);

export async function isFavorite(cardId: string): Promise<boolean> {
  const database = await db();
  const row = await database.getFirstAsync<{ favorite: number }>(
    'SELECT favorite FROM card_marks WHERE entity_id = ?',
    cardId
  );
  return Boolean(row?.favorite);
}

/** What narrows the deck: a topic, a tag in it, a mark, typed words. */
export type CardFilter = { topic?: string; tag?: string; mark?: 'favorite' | Verdict; query?: string };

export function filterCards(cards: CardLine[], { topic, tag, mark: wanted, query }: CardFilter): CardLine[] {
  const typed = query?.trim().toLowerCase();
  return cards.filter(
    (card) =>
      (!topic || listOf(card.topics).includes(topic)) &&
      (!tag || listOf(card.tags).includes(tag)) &&
      (!wanted || (wanted === 'favorite' ? Boolean(card.favorite) : card.verdict === wanted)) &&
      (!typed ||
        card.name.toLowerCase().includes(typed) ||
        (card.summary ?? '').toLowerCase().includes(typed))
  );
}

/** Tags on these cards, the most used first. */
export function tagsAmong(cards: CardLine[]): { tag: string; cards: number }[] {
  const counts = new Map<string, number>();
  for (const card of cards) for (const tag of listOf(card.tags)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts]
    .map(([tag, n]) => ({ tag, cards: n }))
    .sort((a, b) => b.cards - a.cards || a.tag.localeCompare(b.tag));
}

export async function countCards(): Promise<number> {
  const database = await db();
  const row = await database.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM entities WHERE kind = 'card' AND TRIM(name) != ''"
  );
  return row?.n ?? 0;
}

/** Where a card is from, in words: its book, or for a topic's own card, nothing — the topics say it. */
export function cardSource(card: CardLine): string {
  return card.book_kind === TOPIC_KIND ? '' : card.book_title;
}

export type CardsImported = { added: number; skipped: number; unmatched: number };

/**
 * Cards out of a file. A card naming a book on the shelf goes into it; one
 * naming a book that isn't here gets that title as a topic instead. The rest
 * live in their first topic, or `fallback`. A card already here, front and back
 * alike, is skipped, so importing the same file twice adds nothing.
 */
export async function importCards(drafts: CardDraft[], fallback: string): Promise<CardsImported> {
  const database = await db();
  const known = new Set(
    (
      await database.getAllAsync<{ name: string; summary: string | null }>(
        "SELECT name, summary FROM entities WHERE kind = 'card'"
      )
    ).map((card) => sameCard(card.name, card.summary ?? ''))
  );
  const shelf = new Map(
    (await database.getAllAsync<{ id: string; title: string }>(`SELECT b.id, b.title FROM books b WHERE ${ON_SHELF}`))
      .map((book) => [book.title.trim().toLowerCase(), book.id])
  );
  let unmatched = 0;
  const fresh = drafts
    .filter((draft) => {
      const key = sameCard(draft.front, draft.back);
      if (known.has(key)) return false;
      known.add(key);
      return true;
    })
    .map((draft) => {
      const bookId = draft.book ? shelf.get(draft.book.toLowerCase()) : undefined;
      const topics = draft.topics.map(cleanTopic);
      if (draft.book && !bookId) {
        unmatched++;
        topics.push(cleanTopic(draft.book));
      }
      if (!bookId && !topics.length) topics.push(cleanTopic(fallback));
      return { ...draft, bookId, topics };
    });
  // Decks first: making one is its own transaction, and those don't nest.
  const decks = new Map<string, string>();
  for (const { bookId, topics } of fresh) {
    if (!bookId && !decks.has(topics[0])) decks.set(topics[0], await topicBook(topics[0]));
  }
  await transaction(async () => {
    for (const draft of fresh) {
      const cardId = await createEntity(draft.bookId ?? decks.get(draft.topics[0])!, 'card', draft.front);
      if (draft.back) await updateEntity(cardId, { summary: draft.back });
      for (const topic of draft.topics) await addCardTopic(cardId, topic);
      for (const tag of draft.tags) await addCardTag(cardId, tag);
    }
  });
  return { added: fresh.length, skipped: drafts.length - fresh.length, unmatched };
}

function sameCard(front: string, back: string): string {
  return `${front.trim().toLowerCase()}\u0000${back.trim().toLowerCase()}`;
}
