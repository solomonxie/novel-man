import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';
import { router, Stack, useFocusEffect } from '../src/navigation/router';
import { useTranslation } from 'react-i18next';

import { createTopicCard, importCards, listTopics, recentCards, type CardLine } from '../src/db/topics';
import { parseCardsFile } from '../src/sources/cardsFile';
import { pickCardsFile } from '../src/import/sources/picker';
import { File } from '../src/storage/fs';
import { CardRow } from '../src/ui/CardRow';
import { askTopic } from '../src/ui/askTopic';
import { Chip, ChipRow } from '../src/ui/detail';
import { hueFrom } from '../src/ui/fields';
import { Search } from '../src/ui/primitives';
import { space, usePalette } from '../src/theme';

/** Every flashcard, from every book and topic, newest first. */
export default function AllCards() {
  const { t } = useTranslation();
  const palette = usePalette();
  const [cards, setCards] = useState<CardLine[] | null>(null);
  const [topics, setTopics] = useState<{ topic: string; cards: number }[]>([]);
  const [topic, setTopic] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(() => {
    recentCards().then(setCards);
    listTopics().then(setTopics);
  }, []);
  useFocusEffect(load);

  const typed = query.trim().toLowerCase();
  const shown = (cards ?? []).filter(
    (card) =>
      (!topic || (card.topics ?? '').split(' · ').includes(topic)) &&
      (!typed ||
        card.name.toLowerCase().includes(typed) ||
        (card.summary ?? '').toLowerCase().includes(typed))
  );

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
      <Stack.Screen options={{ title: t('cards.title'), headerBackTitle: ' ' }} />
      <FlatList
        data={shown}
        keyExtractor={(card) => card.id}
        contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ gap: space.md, marginBottom: space.md }}>
            {(cards?.length ?? 0) > 8 ? (
              <Search value={query} onChange={setQuery} placeholder={t('cards.search')} />
            ) : null}
            {topics.length ? (
              <ChipRow>
                <Chip label={t('cards.all')} glyph={topic ? undefined : check} onPress={() => setTopic(null)} />
                {topics.map((entry) => (
                  <Chip
                    key={entry.topic}
                    label={entry.topic}
                    detail={String(entry.cards)}
                    hue={hueFrom(entry.topic)}
                    glyph={topic === entry.topic ? check : undefined}
                    onPress={() => setTopic(topic === entry.topic ? null : entry.topic)}
                  />
                ))}
              </ChipRow>
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
        ListFooterComponent={
          <View>
            <Pressable onPress={add} style={{ paddingVertical: space.lg }}>
              <Text style={{ color: palette.accent, fontSize: 16 }}>{t('shelf.newCard')}</Text>
            </Pressable>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <Pressable onPress={() => void importFile()} style={{ paddingVertical: space.sm }}>
                <Text style={{ color: palette.accent, fontSize: 16 }}>{t('cards.import')}</Text>
              </Pressable>
              <Pressable onPress={explain} hitSlop={12} accessibilityLabel={t('cards.formatTitle')}>
                <Text style={{ color: palette.dim, fontSize: 17 }}>ⓘ</Text>
              </Pressable>
            </View>
          </View>
        }
        renderItem={({ item }) => <CardRow card={item} />}
      />
    </View>
  );
}
