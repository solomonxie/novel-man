import { useMemo, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from '../../src/navigation/router';
import { useTranslation } from 'react-i18next';

import { readCatalog, type Translation } from '../../src/sources/ebible';
import { choose } from '../../src/sources/chosen';
import { Row, Search, SEARCHABLE_FROM } from '../../src/ui/primitives';
import { SourceRows } from '../../src/ui/SourceRows';
import { publicSources } from '../../src/sources/registry';
import { space, usePalette } from '../../src/theme';

/**
 * The editions this app offers — a chosen handful, so the list is the whole
 * answer and there is nothing to search. The licence is on the row because it
 * is the reason the row exists.
 */
const EBIBLE = publicSources.find((source) => source.id === 'ebible')!;

export default function Translations() {
  const { kind } = useLocalSearchParams<{ kind?: string }>();
  const { t } = useTranslation();
  const palette = usePalette();
  /** Bumped when the list is fetched here, which is what re-reads it. */
  const [fetched, setFetched] = useState(0);
  const catalog = useMemo(() => readCatalog(), [fetched]);
  const all = catalog?.translations ?? [];
  const [query, setQuery] = useState('');
  // Every redistributable edition is here — over a thousand — so the field is
  // how anyone reaches one, and it filters a list already on the device.
  const found = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((entry) =>
      `${entry.title} ${entry.abbr} ${entry.language} ${entry.id}`.toLowerCase().includes(needle)
    );
  }, [all, query]);

  function pick(translation: Translation) {
    choose({ source: 'ebible', translation });
    router.back();
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <Stack.Screen options={{ title: t('add.chooseTranslation'), headerBackTitle: ' ' }} />

      {all.length >= SEARCHABLE_FROM ? (
        <View style={{ paddingHorizontal: space.lg, paddingTop: space.md }}>
          <Search value={query} onChange={setQuery} placeholder={t('add.searchEditions')} />
        </View>
      ) : null}

      <FlatList
        data={found}
        keyExtractor={(entry) => entry.id}
        contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}
        // Fetching the list belongs where the list is read, not on the page
        // before it — an empty page whose only fix is somewhere else is a
        // dead end.
        ListHeaderComponent={
          <SourceRows source={EBIBLE} onUpdated={() => setFetched((was) => was + 1)} />
        }
        ListEmptyComponent={
          <Text style={{ color: palette.dim, fontSize: 15 }}>
            {catalog ? t('add.noTranslations') : t('add.noCatalog')}
          </Text>
        }
        renderItem={({ item, index }) => (
          <Row
            label={`${item.abbr} · ${item.title}`}
            detail={`${item.language} · ${item.copyright}${
              item.extraBooks ? ` · +${item.extraBooks}` : ''
            }`}
            value={`${item.books}  ›`}
            onPress={() => pick(item)}
            last={index === found.length - 1}
          />
        )}
      />
    </View>
  );
}
