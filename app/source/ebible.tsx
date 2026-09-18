import { useMemo } from 'react';
import { FlatList, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { readCatalog, type Translation } from '../../src/sources/ebible';
import { choose } from '../../src/sources/chosen';
import { Row } from '../../src/ui/primitives';
import { space, usePalette } from '../../src/theme';

/**
 * The editions this app offers — a chosen handful, so the list is the whole
 * answer and there is nothing to search. The licence is on the row because it
 * is the reason the row exists.
 */
export default function Translations() {
  const { kind } = useLocalSearchParams<{ kind?: string }>();
  const { t } = useTranslation();
  const palette = usePalette();
  const catalog = useMemo(() => readCatalog(), []);
  const found = catalog?.translations ?? [];

  function pick(translation: Translation) {
    choose({ source: 'ebible', translation });
    router.back();
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <Stack.Screen options={{ title: t('add.chooseTranslation'), headerBackTitle: ' ' }} />

      <FlatList
        data={found}
        keyExtractor={(entry) => entry.id}
        contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}
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
