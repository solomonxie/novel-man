import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, Stack } from '../../src/navigation/router';
import { useTranslation } from 'react-i18next';

import {
  fetchSubject,
  searchOpenLibrary,
  sourceIdFor,
  subjects,
  SUBJECT_PREFIX,
  workOf,
  type Work,
} from '../../src/sources/openLibrary';
import { keptIndexes, replaceIndex, searchIndex } from '../../src/sources/catalog';
import { choose } from '../../src/sources/chosen';
import { Hint, Row, Search, Section } from '../../src/ui/primitives';
import { radius, space, usePalette } from '../../src/theme';

type Mode = 'kept' | 'live';

/**
 * The catalog that answers about books it cannot give you. Two ways to ask it,
 * and the difference is the whole point of the page.
 *
 * A category fetched once is a thousand titles on the device: instant, offline,
 * and searchable in the same query as every other list this app keeps. That is
 * what somebody adding books from memory actually needs — the title half-
 * remembered on a train. The live search is the other case, a specific book in
 * somebody's hand, and it is the one that needs a signal.
 */
export default function FindOnOpenLibrary() {
  const { t, i18n } = useTranslation();
  const palette = usePalette();
  const [mode, setMode] = useState<Mode>('kept');
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<Work[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kept, setKept] = useState<Record<string, { fetchedAt: number; count: number }>>({});
  const [listsOpen, setListsOpen] = useState(false);
  /** Which category is being fetched, and how far in — one at a time, on request. */
  const [fetching, setFetching] = useState<{ slug: string; done: number; total: number } | null>(null);

  const readKept = useCallback(async () => {
    const rows = await keptIndexes(`${SUBJECT_PREFIX}:`);
    const state: Record<string, { fetchedAt: number; count: number }> = {};
    for (const row of rows) state[row.source] = { fetchedAt: row.fetchedAt, count: row.count };
    setKept(state);
    return state;
  }, []);

  useEffect(() => {
    readKept().then((state) => setListsOpen(Object.keys(state).length === 0));
  }, [readKept]);

  const keptSources = Object.keys(kept);
  const keptTotal = keptSources.reduce((total, source) => total + kept[source].count, 0);

  /** The kept lists answer as they are typed into; a stranger's API does not. */
  useEffect(() => {
    if (mode !== 'kept') return;
    if (!keptSources.length) {
      setFound(null);
      return;
    }
    const timer = setTimeout(
      () => {
        setError(null);
        searchIndex(query, keptSources, 60)
          .then((rows) => setFound(rows.map(workOf)))
          .catch(() => setError(t('find.failed')));
      },
      query.trim() ? 180 : 0
    );
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, mode, keptTotal]);

  async function runLive() {
    if (!query.trim()) return;
    setBusy(true);
    setError(null);
    try {
      setFound(await searchOpenLibrary(query));
    } catch {
      setError(t('find.failed'));
      setFound(null);
    } finally {
      setBusy(false);
    }
  }

  async function getList(slug: string) {
    setFetching({ slug, done: 0, total: 1 });
    setError(null);
    try {
      const rows = await fetchSubject(slug, (done, total) => setFetching({ slug, done, total }));
      await replaceIndex(sourceIdFor(slug), rows, (done, total) =>
        setFetching({ slug, done, total })
      );
      await readKept();
    } catch {
      setError(t('ol.getFailed'));
    } finally {
      setFetching(null);
    }
  }

  function pick(work: Work) {
    choose({ source: 'openlibrary', work });
    router.back();
  }

  const modes: Mode[] = ['kept', 'live'];

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <Stack.Screen options={{ title: t('source.openlibrary'), headerBackTitle: ' ' }} />

      <FlatList
        data={found ?? []}
        keyExtractor={(work) => work.key}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}
        ListHeaderComponent={
          <View style={{ gap: space.md }}>
            <Search
              value={query}
              onChange={setQuery}
              placeholder={t(mode === 'kept' ? 'ol.searchKept' : 'ol.searchLive')}
              onSubmit={mode === 'live' ? runLive : undefined}
            />

            <View style={styles.modes}>
              {modes.map((entry) => {
                const on = entry === mode;
                return (
                  <Pressable
                    key={entry}
                    onPress={() => {
                      setMode(entry);
                      setFound(null);
                      setError(null);
                    }}
                    style={[
                      styles.chip,
                      { borderColor: on ? palette.accent : palette.border },
                      on && { backgroundColor: palette.soft },
                    ]}
                  >
                    <Text style={{ color: on ? palette.accent : palette.dim, fontSize: 14 }}>
                      {t(`ol.mode_${entry}`)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* The lists themselves, folded once there is one — this is a page
                for finding a book, and the machinery that makes finding it
                possible offline belongs under it rather than over it. */}
            <Section
              title={t('ol.categories')}
              action={{
                label: listsOpen ? t('ol.hideLists') : t('ol.showLists'),
                onPress: () => setListsOpen((was) => !was),
              }}
            >
              <Row
                label={t('ol.keptTotal', { count: keptTotal })}
                detail={t('ol.categoriesHint')}
                value={`${Object.keys(kept).length}/${subjects.length}`}
                last={!listsOpen}
              />
              {listsOpen
                ? subjects.map((subject, index) => {
                    const state = kept[sourceIdFor(subject.slug)];
                    const here = fetching?.slug === subject.slug;
                    return (
                      <Row
                        key={subject.slug}
                        label={subject.name}
                        detail={
                          state
                            ? t('ol.keptAsOf', {
                                count: state.count,
                                date: new Date(state.fetchedAt).toLocaleDateString(i18n.language),
                              })
                            : subject.group
                        }
                        value={
                          here
                            ? `${Math.round((fetching.done / Math.max(1, fetching.total)) * 100)}%`
                            : state
                              ? t('ol.update')
                              : t('ol.get')
                        }
                        onPress={fetching ? undefined : () => getList(subject.slug)}
                        last={index === subjects.length - 1}
                      />
                    );
                  })
                : null}
            </Section>

            {error ? <Hint>{error}</Hint> : null}
            {busy ? <ActivityIndicator /> : null}
          </View>
        }
        ListEmptyComponent={
          busy ? null : (
            <Text style={{ color: palette.dim, fontSize: 14, lineHeight: 20, marginTop: space.lg }}>
              {mode === 'kept' && !keptSources.length
                ? t('ol.noLists')
                : found === null
                  ? t(mode === 'kept' ? 'ol.hintKept' : 'ol.hintLive')
                  : t('find.none')}
            </Text>
          )
        }
        renderItem={({ item, index }) => (
          <Row
            label={item.title}
            detail={[item.author, item.year].filter(Boolean).join(' · ') || undefined}
            value="›"
            onPress={() => pick(item)}
            last={index === (found?.length ?? 0) - 1}
          />
        )}
        ListFooterComponent={
          found?.length ? <Hint>{t('ol.whatYouGet')}</Hint> : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  modes: { flexDirection: 'row', gap: space.sm },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
});
