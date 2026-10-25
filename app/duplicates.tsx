import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from '../src/navigation/router';
import { useTranslation } from 'react-i18next';

import { listBooks, type BookListItem } from '../src/db/repo';
import { canKeep, findDuplicates, groupOf, isSafe, mergeMode, type DuplicateGroup } from '../src/books/duplicates';
import {
  dismissedPairs,
  dismissGroup,
  lastMerge,
  mergeGroup,
  undoLastMerge,
  type MergeRun,
} from '../src/books/mergeBooks';
import { isSkeleton } from '../src/books/record';
import { Cover } from '../src/ui/Cover';
import { Action } from '../src/ui/detail';
import { radius, space, usePalette } from '../src/theme';

/**
 * Books the shelf holds more than once, a card per book with every copy in it.
 * The copy marked Keep is the one that stays; tapping another moves the mark,
 * where that copy can take over. Merging is undoable here, and the copies that
 * go wait in Recently Deleted for a month besides.
 */
type Group = DuplicateGroup<BookListItem>;

export default function Duplicates() {
  const { t } = useTranslation();
  const palette = usePalette();
  const { book: only } = useLocalSearchParams<{ book?: string }>();
  const [books, setBooks] = useState<BookListItem[] | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [keepers, setKeepers] = useState<Record<string, string>>({});
  const [last, setLast] = useState<MergeRun[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    Promise.all([listBooks(), dismissedPairs(), lastMerge()])
      .then(([shelf, pairs, runs]) => {
        setBooks(shelf);
        setDismissed(pairs);
        setLast(runs);
      })
      .catch(() => setBooks([]));
  }, []);

  useFocusEffect(load);

  const groups = useMemo(() => {
    const all = findDuplicates(books ?? [], dismissed);
    if (!only) return all;
    const one = groupOf(only, all);
    return one ? [one] : [];
  }, [books, dismissed, only]);

  const safe = useMemo(() => groups.filter(isSafe), [groups]);

  const keeperIn = (group: Group) =>
    group.books.find((book) => book.id === keepers[group.key]) ?? group.books[0];

  async function run(work: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    try {
      await work();
    } catch (problem) {
      Alert.alert(t('duplicates.failed'), String(problem));
    } finally {
      setBusy(false);
      load();
    }
  }

  function merge(group: Group) {
    const keeper = keeperIn(group);
    const others = group.books.filter((book) => book !== keeper).map((book) => book.id);
    void run(() => mergeGroup(keeper.id, others));
  }

  function mergeAll() {
    Alert.alert(
      t('duplicates.mergeAll', { count: safe.length }),
      t('duplicates.mergeAllWhy'),
      [
        { text: t('settings.cancel'), style: 'cancel' },
        {
          text: t('duplicates.merge'),
          onPress: () =>
            void run(async () => {
              const batch = `${Date.now()}`;
              for (const group of safe) {
                const keeper = keeperIn(group);
                await mergeGroup(keeper.id, group.books.filter((book) => book !== keeper).map((book) => book.id), batch);
              }
            }),
        },
      ]
    );
  }

  function noteOn(book: BookListItem): string {
    const length = isSkeleton(book) ? t('duplicates.noText') : t('duplicates.words', { count: book.word_count });
    return [book.author, length, book.stars ? '★'.repeat(book.stars) : null].filter(Boolean).join(' · ');
  }

  /** What the button does, said as what will be left: one book, or editions of one. */
  function mergeLabel(group: Group): string {
    const keeper = keeperIn(group);
    const all = group.books.filter((book) => book !== keeper);
    return all.every((book) => mergeMode(keeper, book) === 'edition')
      ? t('duplicates.editions')
      : t('duplicates.merge');
  }

  const header = (
    <View style={{ gap: space.md, marginBottom: space.md }}>
      <Text style={{ color: palette.dim, fontSize: 14, lineHeight: 20 }}>{t('duplicates.why')}</Text>
      {last.length > 0 ? (
        <View style={[styles.banner, { backgroundColor: palette.soft }]}>
          <Text style={{ color: palette.text, fontSize: 14, flex: 1 }} numberOfLines={2}>
            {last.length === 1
              ? t('duplicates.mergedOne', { title: last[0].title })
              : t('duplicates.mergedMany', { count: last.length })}
          </Text>
          <Text
            onPress={() => void run(undoLastMerge)}
            suppressHighlighting
            style={{ color: palette.accent, fontSize: 15, fontWeight: '600' }}
          >
            {t('duplicates.undo')}
          </Text>
        </View>
      ) : null}
      {!only && safe.length > 1 ? (
        <View style={{ flexDirection: 'row' }}>
          <Action label={t('duplicates.mergeAll', { count: safe.length })} onPress={mergeAll} />
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <Stack.Screen options={{ title: t('duplicates.title'), headerBackTitle: ' ' }} />
      <FlatList
        data={groups}
        keyExtractor={(group) => group.key}
        contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}
        ListHeaderComponent={books === null ? null : header}
        ListEmptyComponent={
          books === null ? (
            <ActivityIndicator />
          ) : (
            <View>
              <Text style={{ color: palette.text, fontSize: 16 }}>{t('duplicates.none')}</Text>
              <Text style={{ color: palette.dim, fontSize: 14, marginTop: space.xs, lineHeight: 20 }}>
                {t('duplicates.noneWhy')}
              </Text>
            </View>
          )
        }
        renderItem={({ item: group }) => {
          const keeper = keeperIn(group);
          return (
            <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
              <Text style={{ color: group.near ? palette.danger : palette.dim, fontSize: 13 }}>
                {t(group.near ? 'duplicates.near' : 'duplicates.same')}
              </Text>
              {group.books.map((book) => {
                const kept = book === keeper;
                const choosable = canKeep(book, group.books);
                return (
                  <Pressable
                    key={book.id}
                    onPress={() => choosable && setKeepers((was) => ({ ...was, [group.key]: book.id }))}
                    onLongPress={() => router.push(`/book/${book.id}`)}
                    style={({ pressed }) => [styles.line, pressed && { backgroundColor: palette.sunken }]}
                  >
                    <Cover title={book.title} hue={book.cover_hue} width={34} path={book.cover_path} />
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={{ color: palette.text, fontSize: 16 }}>{book.title}</Text>
                      <Text numberOfLines={1} style={{ color: palette.dim, fontSize: 13, marginTop: 2 }}>
                        {noteOn(book)}
                      </Text>
                    </View>
                    <Text style={{ color: kept ? palette.accent : palette.faint, fontSize: 13, fontWeight: '600' }}>
                      {kept ? t('duplicates.keep') : choosable ? '○' : ''}
                    </Text>
                  </Pressable>
                );
              })}
              <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.xs }}>
                <Action label={mergeLabel(group)} tone="loud" onPress={() => merge(group)} />
                <Action
                  label={t('duplicates.notSame')}
                  onPress={() => void run(() => dismissGroup(group.books.map((book) => book.id)))}
                />
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: space.md,
    gap: space.xs,
    marginBottom: space.md,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.sm,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
  },
});
