import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from '../../../src/navigation/router';
import { useTranslation } from 'react-i18next';

import { createEntity, listEntities, type Entity } from '../../../src/db/repo';
import { useWorkRefresh } from '../../../src/work/refresh';
import { Search } from '../../../src/ui/primitives';
import { space, usePalette } from '../../../src/theme';

/**
 * The vocabulary of one book, in the order it was collected.
 *
 * Alphabetical was the obvious order and the wrong one. What a reader wants
 * from this list is the thing they kept last — a word is looked up again
 * within a day or two of being marked, and after that it is either learned or
 * it is in the flash cards. A `FlatList` because a bible read properly runs to
 * hundreds of these.
 */
export default function WordsPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const palette = usePalette();
  const [words, setWords] = useState<Entity[]>([]);
  const [query, setQuery] = useState('');

  const load = useCallback(() => {
    if (!id) return;
    listEntities(id, 'word').then(setWords);
  }, [id]);

  useFocusEffect(load);
  useWorkRefresh(load);

  const typed = query.trim().toLowerCase();
  const shown = typed
    ? words.filter(
        (word) =>
          word.name.toLowerCase().includes(typed) ||
          (word.alias ?? '').toLowerCase().includes(typed) ||
          (word.summary ?? '').toLowerCase().includes(typed)
      )
    : words;

  async function add() {
    const newId = await createEntity(id!, 'word', '');
    router.push(`/word/${newId}`);
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <Stack.Screen options={{ title: t('book.words'), headerBackTitle: ' ' }} />
      <FlatList
        data={shown}
        keyExtractor={(word) => word.id}
        contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          words.length > 8 ? (
            <View style={{ marginBottom: space.md }}>
              <Search value={query} onChange={setQuery} placeholder={t('book.searchWords')} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          <Text style={{ color: palette.dim, fontSize: 15 }}>
            {words.length ? t('shelf.noMatches') : t('book.wordsEmpty')}
          </Text>
        }
        ListFooterComponent={
          <Pressable onPress={add} style={{ paddingVertical: space.lg }}>
            <Text style={{ color: palette.accent, fontSize: 16 }}>{t('book.addWord')}</Text>
          </Pressable>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/word/${item.id}`)}
            style={[styles.row, { backgroundColor: palette.surface, borderColor: palette.border }]}
          >
            <View style={{ flex: 1 }}>
              <Text numberOfLines={2} style={{ color: palette.text, fontSize: 17 }}>
                {item.name || t('word.name')}
              </Text>
              {/* The gloss, which is the one thing worth seeing without
                  opening the word: a list of bare words you already marked
                  tells you nothing you did not know when you marked them. */}
              {item.summary?.trim() ? (
                <Text numberOfLines={2} style={{ color: palette.dim, fontSize: 14, marginTop: 3 }}>
                  {item.summary.trim()}
                </Text>
              ) : null}
            </View>
            <Text style={{ color: palette.faint, fontSize: 16 }}>›</Text>
          </Pressable>
        )}
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
