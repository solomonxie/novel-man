import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';
import { router, Stack, useFocusEffect } from '../src/navigation/router';
import { useTranslation } from 'react-i18next';

import {
  cardSource,
  createTopicCard,
  MARK_GLYPH,
  filterCards,
  importCards,
  listTopics,
  recentCards,
  setVerdict,
  tagsAmong,
  type CardFilter,
  type CardLine,
  type Verdict,
} from '../src/db/topics';
import { parseCardsFile } from '../src/sources/cardsFile';
import { pickCardsFile } from '../src/import/sources/picker';
import { File } from '../src/storage/fs';
import { CardRow } from '../src/ui/CardRow';
import { askTopic } from '../src/ui/askTopic';
import { Chip, ChipRow } from '../src/ui/detail';
import { hueFrom } from '../src/ui/fields';
import { Row, Search, Section } from '../src/ui/primitives';
import { space, usePalette } from '../src/theme';

/** Every flashcard, from every book and topic, newest first. */
export default function AllCards() {
  const { t } = useTranslation();
  const palette = usePalette();
  const [cards, setCards] = useState<CardLine[] | null>(null);
  const [topics, setTopics] = useState<{ topic: string; cards: number }[]>([]);
  const [topic, setTopic] = useState<string | null>(null);
  const [book, setBook] = useState<string | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [mark, setMark] = useState<CardFilter['mark'] | null>(null);
  const [query, setQuery] = useState('');
  const [dragging, setDragging] = useState(false);

  const load = useCallback(() => {
    recentCards().then(setCards);
    listTopics().then(setTopics);
  }, []);
  useFocusEffect(load);

  const books = booksAmong(cards ?? []);
  const inTopic = filterCards(cards ?? [], { topic: topic ?? undefined, book: book ?? undefined });
  const tags = tagsAmong(inTopic);
  const filter: CardFilter = {
    book: book ?? undefined,
    topic: topic ?? undefined,
    tag: tag ?? undefined,
    mark: mark ?? undefined,
    query,
  };
  const shown = filterCards(cards ?? [], filter);
  const marks = (['favorite', 'later', 'known'] as const)
    .map((one) => ({ one, n: filterCards(inTopic, { tag: tag ?? undefined, mark: one }).length }))
    .filter(({ one, n }) => n || mark === one);

  function pickTopic(next: string | null) {
    setTopic(next);
    setBook(null);
    setTag(null);
  }

  function pickBook(next: string | null) {
    setBook(next);
    setTopic(null);
    setTag(null);
  }

  function decide(id: string, verdict: Verdict | null) {
    setCards((was) => was?.map((one) => (one.id === id ? { ...one, verdict } : one)) ?? was);
    void setVerdict(id, verdict);
  }

  function play() {
    const params = Object.entries(filter)
      .filter(([, value]) => value)
      .map(([key, value]) => `${key}=${encodeURIComponent(value!)}`)
      .join('&');
    router.push(`/cards/play${params ? `?${params}` : ''}`);
  }

  const check = <Text style={{ color: palette.accent, fontSize: 13, fontWeight: '700' }}>✓</Text>;

  function add() {
    askTopic(t, async (picked) => router.push(`/card/${await createTopicCard(picked)}`), topic ?? '');
  }

  function explain() {
    Alert.alert(t('cards.formatTitle'), t('cards.format'));
  }

  async function importFile() {
    try {
      const picked = await pickCardsFile();
      if (!picked) return;
      const drafts = parseCardsFile(await new File(picked.uri).text());
      if (!drafts.length) {
        Alert.alert(t('cards.importNone'), t('cards.format'));
        return;
      }
      const run = async (fallback: string) => {
        const { added, skipped, unmatched } = await importCards(drafts, fallback);
        load();
        const notes = [
          skipped ? t('cards.importSkipped', { count: skipped }) : '',
          unmatched ? t('cards.importUnmatched', { count: unmatched }) : '',
        ].filter(Boolean);
        Alert.alert(t('cards.imported', { count: added }), notes.join('\n\n') || undefined);
      };
      if (drafts.every((draft) => draft.topics.length || draft.book)) await run('');
      else askTopic(t, (chosen) => void run(chosen), topic ?? picked.name.replace(/\.[^.]+$/, ''));
    } catch (problem) {
      Alert.alert(t('cards.importFailed'), String(problem));
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <Stack.Screen options={{ title: t('cards.title'), headerBackTitle: ' ', gestureEnabled: false }} />
      <FlatList
        data={shown}
        scrollEnabled={!dragging}
        keyExtractor={(card) => card.id}
        contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ gap: space.md, marginBottom: space.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <Pressable onPress={add} hitSlop={8}>
                <Text style={{ color: palette.accent, fontSize: 16 }}>{t('shelf.newCard')}</Text>
              </Pressable>
              <View style={{ flex: 1 }} />
              <Pressable onPress={() => void importFile()} hitSlop={8}>
                <Text style={{ color: palette.accent, fontSize: 16 }}>{t('cards.import')}</Text>
              </Pressable>
              <Pressable onPress={explain} hitSlop={12} accessibilityLabel={t('cards.formatTitle')}>
                <Text style={{ color: palette.dim, fontSize: 17 }}>ⓘ</Text>
              </Pressable>
            </View>
            {(cards?.length ?? 0) > 8 ? (
              <Search value={query} onChange={setQuery} placeholder={t('cards.search')} />
            ) : null}
            {topics.length + books.length > 1 ? (
              <ChipRow>
                <Chip label={t('cards.all')} glyph={topic || book ? undefined : check} onPress={() => pickTopic(null)} />
                {topics.map((entry) => (
                  <Chip
                    key={entry.topic}
                    label={entry.topic}
                    detail={String(entry.cards)}
                    hue={hueFrom(entry.topic)}
                    glyph={topic === entry.topic ? check : undefined}
                    onPress={() => pickTopic(topic === entry.topic ? null : entry.topic)}
                  />
                ))}
                {books.map((entry) => (
                  <Chip
                    key={entry.id}
                    label={entry.title}
                    detail={String(entry.cards)}
                    hue={hueFrom(entry.title)}
                    glyph={book === entry.id ? check : undefined}
                    onPress={() => pickBook(book === entry.id ? null : entry.id)}
                  />
                ))}
              </ChipRow>
            ) : null}
            {tags.length ? (
              <ChipRow>
                {tags.map((entry) => (
                  <Chip
                    key={entry.tag}
                    label={`#${entry.tag}`}
                    detail={String(entry.cards)}
                    hue={hueFrom(entry.tag)}
                    glyph={tag === entry.tag ? check : undefined}
                    onPress={() => setTag(tag === entry.tag ? null : entry.tag)}
                  />
                ))}
              </ChipRow>
            ) : null}
            {marks.length ? (
              <ChipRow>
                {marks.map(({ one, n }) => (
                  <Chip
                    key={one}
                    label={t(`cards.mark_${one}`)}
                    detail={String(n)}
                    glyph={mark === one ? check : <Text style={{ fontSize: 13 }}>{MARK_GLYPH[one]}</Text>}
                    onPress={() => setMark(mark === one ? null : one)}
                  />
                ))}
              </ChipRow>
            ) : null}
            {shown.length ? (
              <Section flush>
                <Row
                  label={t('cards.play', { count: shown.length })}
                  detail={t('cards.playDetail', {
                    later: shown.filter((card) => card.verdict === 'later').length,
                    known: shown.filter((card) => card.verdict === 'known').length,
                  })}
                  link
                  onPress={play}
                  last
                />
              </Section>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          cards ? (
            <Text style={{ color: palette.dim, fontSize: 15 }}>
              {cards.length ? t('cards.noMatches') : t('cards.empty')}
            </Text>
          ) : null
        }
        renderItem={({ item }) => (
          <CardRow card={item} onVerdict={(verdict) => decide(item.id, verdict)} onDragging={setDragging} />
        )}
      />
    </View>
  );
}

/** The books cards came from, most cards first; a topic's own cards are under their topic. */
function booksAmong(cards: CardLine[]): { id: string; title: string; cards: number }[] {
  const counts = new Map<string, { id: string; title: string; cards: number }>();
  for (const card of cards) {
    const title = cardSource(card);
    if (!title) continue;
    const entry = counts.get(card.book_id) ?? { id: card.book_id, title, cards: 0 };
    entry.cards += 1;
    counts.set(card.book_id, entry);
  }
  return [...counts.values()].sort((a, b) => b.cards - a.cards || a.title.localeCompare(b.title));
}
