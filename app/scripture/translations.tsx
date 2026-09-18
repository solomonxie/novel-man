import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { readCatalog, search, type Translation } from '../../src/scripture/ebible';
import { Row } from '../../src/ui/primitives';
import { radius, space, usePalette } from '../../src/theme';

/**
 * Every edition the source says may be redistributed, searchable by name or
 * language. The licence is on the row because it is the reason the row exists.
 */
export default function Translations() {
  const { kind } = useLocalSearchParams<{ kind?: string }>();
  const { t } = useTranslation();
  const palette = usePalette();
  const [query, setQuery] = useState('');
  const catalog = useMemo(() => readCatalog(), []);
  const found = useMemo(
    () => search(catalog?.translations ?? [], query),
    [catalog, query]
  );

  function choose(translation: Translation) {
    router.replace({
      pathname: '/add',
      params: { kind: kind ?? 'scripture', translation: translation.id },
    });
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <Stack.Screen options={{ title: t('add.chooseTranslation'), headerBackTitle: ' ' }} />

      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={t('add.searchTranslations')}
        placeholderTextColor={palette.faint}
        autoCorrect={false}
        style={[
          styles.search,
          { color: palette.text, backgroundColor: palette.surface, borderColor: palette.border },
        ]}
      />

      <FlatList
        data={found}
        keyExtractor={(entry) => entry.id}
        contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <Text style={{ color: palette.dim, fontSize: 15 }}>
            {catalog ? t('add.noTranslations') : t('add.noCatalog')}
          </Text>
        }
        renderItem={({ item, index }) => (
          <Row
            label={item.title}
            detail={`${item.language} · ${item.copyright}${
              item.extraBooks ? ` · +${item.extraBooks}` : ''
            }`}
            value={`${item.books}  ›`}
            onPress={() => choose(item)}
            last={index === found.length - 1}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  search: {
    marginHorizontal: space.lg,
    marginTop: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    fontSize: 16,
  },
});
