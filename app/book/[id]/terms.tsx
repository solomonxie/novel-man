import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from '../../../src/navigation/router';
import { useTranslation } from 'react-i18next';

import { createEntity, listEntities, type Entity } from '../../../src/db/repo';
import { useWorkRefresh } from '../../../src/work/refresh';
import { hueFrom } from '../../../src/ui/fields';
import { Search } from '../../../src/ui/primitives';
import { space, usePalette } from '../../../src/theme';

/**
 * Everything the book names that is neither a person nor a place, in one list.
 * A `FlatList` because a bible accumulates hundreds of them and a technical
 * book more — and the search box because by then scrolling is not finding.
 */
export default function TermsPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const palette = usePalette();
  const [terms, setTerms] = useState<Entity[]>([]);
  const [query, setQuery] = useState('');

  const load = useCallback(() => {
    if (!id) return;
    listEntities(id, 'term').then(setTerms);
  }, [id]);

  useFocusEffect(load);
  useWorkRefresh(load);

  const typed = query.trim().toLowerCase();
  const shown = typed
    ? terms.filter(
        (term) =>
          term.name.toLowerCase().includes(typed) ||
          (term.alias ?? '').toLowerCase().includes(typed)
      )
    : terms;

  async function add() {
    const newId = await createEntity(id!, 'term', '');
    router.push(`/term/${newId}`);
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <Stack.Screen
        options={{
          title: t('book.terms'),
          headerBackTitle: ' ',
        }}
      />
      <FlatList
        data={shown}
        keyExtractor={(term) => term.id}
        contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          terms.length > 8 ? (
            <View style={{ marginBottom: space.md }}>
              <Search value={query} onChange={setQuery} placeholder={t('book.searchTerms')} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          <Text style={{ color: palette.dim, fontSize: 15 }}>
            {terms.length ? t('shelf.noMatches') : t('book.termsEmpty')}
          </Text>
        }
        ListFooterComponent={
          <Pressable onPress={add} style={{ paddingVertical: space.lg }}>
            <Text style={{ color: palette.accent, fontSize: 16 }}>{t('book.addTerm')}</Text>
          </Pressable>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/term/${item.id}`)}
            style={[styles.row, { backgroundColor: palette.surface, borderColor: palette.border }]}
          >
            <View style={[styles.dot, { backgroundColor: `hsl(${hueFrom(item.name)}, 45%, 55%)` }]} />
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ color: palette.text, fontSize: 16 }}>
                {item.name || t('term.name')}
              </Text>
              {item.summary?.trim() ? (
                <Text numberOfLines={2} style={{ color: palette.dim, fontSize: 13, marginTop: 2 }}>
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
  dot: { width: 10, height: 10, borderRadius: 5 },
});
