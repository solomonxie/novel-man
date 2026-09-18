import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Row, Search } from './primitives';
import { space, usePalette } from '../theme';

/**
 * Searching somebody else's catalog, which is the same page whichever catalog
 * it is: a field, a list of what came back, and a row that ends the search by
 * choosing. It runs on the return key rather than on every keystroke — a
 * stranger's API is not a local index, and nothing here is fetched until the
 * reader asks for it.
 *
 * The query can be owned by the page above when that page has its own way of
 * setting it — arXiv's category picker is a search nobody types.
 */
export function FindPage<T>({
  title,
  placeholder,
  hint,
  header,
  search,
  query: outerQuery,
  onQuery,
  runKey,
  keyOf,
  row,
  onPick,
  live,
}: {
  title: string;
  placeholder: string;
  hint?: string;
  /** Anything the source needs above its results: fields to search, filters. */
  header?: React.ReactNode;
  search: (query: string) => Promise<T[]>;
  query?: string;
  onQuery?: (next: string) => void;
  /** Change this to run the search without the return key. */
  runKey?: number;
  /**
   * Search as it is typed. Only for a list already on the device — a request
   * per keystroke to somebody else's API is a different thing entirely.
   */
  live?: boolean;
  keyOf: (item: T) => string;
  row: (item: T) => { label: string; detail?: string; value?: string };
  onPick: (item: T) => void;
}) {
  const { t } = useTranslation();
  const palette = usePalette();
  const [ownQuery, setOwnQuery] = useState('');
  const query = outerQuery ?? ownQuery;
  const setQuery = onQuery ?? setOwnQuery;
  const [found, setFound] = useState<T[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(term = query) {
    if (!term.trim() && !live) return;
    setBusy(true);
    setError(null);
    try {
      setFound(await search(term));
    } catch {
      setError(t('find.failed'));
      setFound(null);
    } finally {
      setBusy(false);
    }
  }

  // A kept list is shown as soon as the page opens, then narrowed as it is
  // typed into: a search page that opens blank asks what is in it.
  useEffect(() => {
    if (!live) return;
    const timer = setTimeout(() => void run(query), query.trim() ? 180 : 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, live]);

  useEffect(() => {
    if (runKey) void run();
    // The page above decides when this fires; re-running on every render of it
    // would be a request per keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runKey]);

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <Stack.Screen options={{ title, headerBackTitle: ' ' }} />

      <View style={{ paddingHorizontal: space.lg, paddingTop: space.md }}>
        <Search value={query} onChange={setQuery} placeholder={placeholder} onSubmit={() => run()} />
        {header}
      </View>

      {busy ? <ActivityIndicator style={{ marginTop: space.xl }} /> : null}

      <FlatList
        data={found ?? []}
        keyExtractor={keyOf}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}
        ListEmptyComponent={
          busy ? null : (
            <Text style={{ color: palette.dim, fontSize: 14, lineHeight: 20 }}>
              {error ?? (found === null ? hint ?? t('find.prompt') : t('find.none'))}
            </Text>
          )
        }
        renderItem={({ item, index }) => {
          const shown = row(item);
          return (
            <Row
              label={shown.label}
              detail={shown.detail}
              value={`${shown.value ?? ''}  ›`}
              onPress={() => onPick(item)}
              last={index === (found?.length ?? 0) - 1}
            />
          );
        }}
      />
    </View>
  );
}
