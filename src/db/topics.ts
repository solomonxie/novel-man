import { db, newId, transaction } from './index';
import { createEntity, type Entity } from './repo';
import { TOPIC_KIND } from '../books/kinds';

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

export type CardLine = Entity & { book_title: string; book_kind: string; topics: string | null };

/** Cards from every book and topic, newest first; a card never written on is not one yet. */
export async function recentCards(limit = -1): Promise<CardLine[]> {
  const database = await db();
  return database.getAllAsync<CardLine>(
    `SELECT e.*, b.title AS book_title, b.kind AS book_kind,
            (SELECT GROUP_CONCAT(topic, ' · ') FROM card_topics t WHERE t.entity_id = e.id) AS topics
       FROM entities e JOIN books b ON b.id = e.book_id
      WHERE e.kind = 'card' AND TRIM(e.name) != ''
      ORDER BY e.created_at DESC LIMIT ?`,
    limit
  );
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
