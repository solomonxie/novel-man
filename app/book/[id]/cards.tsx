import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from '../../../src/navigation/router';
import { useTranslation } from 'react-i18next';

import {
  createEntity,
  excerptCounts,
  listEntities,
  type Entity,
} from '../../../src/db/repo';
import { Search } from '../../../src/ui/primitives';
import { space, usePalette } from '../../../src/theme';

/**
 * Every card for one book. A `FlatList` because a textbook somebody is actually
 * studying accumulates hundreds, and the search box because by then scrolling
 * is not finding.
 */
export default function CardsPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const palette = usePalette();
  const [cards, setCards] = useState<Entity[]>([]);
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [query, setQuery] = useState('');

  const load = useCallback(() => {
    if (!id) return;
    listEntities(id, 'card').then(setCards);
    excerptCounts(id).then(setCounts);
  }, [id]);

  useFocusEffect(load);

  const typed = query.trim().toLowerCase();
  const shown = typed
    ? cards.filter(
        (card) =>
          card.name.toLowerCase().includes(typed) ||
          (card.summary ?? '').toLowerCase().includes(typed)
      )
    : cards;

  async function add() {
    router.push(`/card/${await createEntity(id!, 'card', '')}`);
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <Stack.Screen options={{ title: t('book.cards'), headerBackTitle: ' ' }} />
      <FlatList
        data={shown}
        keyExtractor={(card) => card.id}
        contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          cards.length > 8 ? (
            <View style={{ marginBottom: space.md }}>
              <Search value={query} onChange={setQuery} placeholder={t('book.searchCards')} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          <Text style={{ color: palette.dim, fontSize: 15 }}>
            {cards.length ? t('shelf.noMatches') : t('book.cardsEmpty')}
          </Text>
        }
        ListFooterComponent={
          <Pressable onPress={add} style={{ paddingVertical: space.lg }}>
            <Text style={{ color: palette.accent, fontSize: 16 }}>{t('book.addCard')}</Text>
          </Pressable>
        }
        renderItem={({ item }) => {
          const kept = counts.get(item.id) ?? 0;
          return (
            <Pressable
              onPress={() => router.push(`/card/${item.id}`)}
              style={[styles.row, { backgroundColor: palette.surface, borderColor: palette.border }]}
            >
              <View style={{ flex: 1 }}>
                <Text numberOfLines={2} style={{ color: palette.text, fontSize: 16 }}>
                  {item.name || t('card.frontPlaceholder')}
                </Text>
                {item.summary?.trim() ? (
                  <Text numberOfLines={2} style={{ color: palette.dim, fontSize: 13, marginTop: 2 }}>
                    {item.summary.trim()}
                  </Text>
                ) : null}
              </View>
              {kept ? (
                <Text style={{ color: palette.faint, fontSize: 12 }}>
                  {t('card.excerptCount', { count: kept })}
                </Text>
              ) : null}
              <Text style={{ color: palette.faint, fontSize: 16 }}>›</Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: space.sm,
  },
});
