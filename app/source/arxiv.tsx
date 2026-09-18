import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import {
  authorLine,
  paperCategories,
  searchArxiv,
  type Paper,
  type PaperField,
} from '../../src/sources/arxiv';
import { choose } from '../../src/sources/chosen';
import { FindPage } from '../../src/ui/FindPage';
import { PickerSheet } from '../../src/ui/PickerSheet';
import { radius, space, usePalette } from '../../src/theme';

const FIELDS: PaperField[] = ['all', 'ti', 'au', 'cat'];

/**
 * arXiv's search is fielded, so "by author" is the source's own query rather
 * than a filter over results. A category is picked from a list instead of
 * typed: `cond-mat.stat-mech` is not something anyone spells from memory, and
 * choosing one runs the search on the spot.
 */
export default function FindOnArxiv() {
  const { kind } = useLocalSearchParams<{ kind?: string }>();
  const { t } = useTranslation();
  const palette = usePalette();
  const [field, setField] = useState<PaperField>('all');
  const [query, setQuery] = useState('');
  const [runKey, setRunKey] = useState(0);
  const [picking, setPicking] = useState(false);

  const categories = useMemo(
    () =>
      paperCategories.map((category) => ({
        id: category.id,
        label: `${category.name}`,
        detail: `${category.group} · ${category.id}`,
      })),
    []
  );

  return (
    <>
      <FindPage<Paper>
        title={t('source.arxiv')}
        placeholder={t(`source.arxivSearch_${field}`)}
        hint={t('source.arxivHint')}
        query={query}
        onQuery={setQuery}
        runKey={runKey}
        header={
          <View style={styles.fields}>
            {FIELDS.map((entry) => {
              const on = entry === field;
              return (
                <Pressable
                  key={entry}
                  onPress={() => {
                    setField(entry);
                    if (entry === 'cat') setPicking(true);
                  }}
                  style={[
                    styles.chip,
                    { borderColor: on ? palette.accent : palette.border },
                    on && { backgroundColor: palette.soft },
                  ]}
                >
                  <Text style={{ color: on ? palette.accent : palette.dim, fontSize: 14 }}>
                    {t(`source.arxivField_${entry}`)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        }
        search={(term) => searchArxiv(term, field)}
        keyOf={(paper) => paper.id}
        row={(paper) => ({
          label: paper.title,
          detail: [authorLine(paper), paper.journal].filter(Boolean).join(' · ') || undefined,
          value: `${paper.category}  ${paper.published.slice(0, 4)}`,
        })}
        onPick={(paper) => {
          choose({ source: 'arxiv', paper });
          router.back();
        }}
      />

      <PickerSheet
        visible={picking}
        title={t('source.arxivField_cat')}
        options={categories}
        selectedId={query}
        onPick={(id) => {
          setPicking(false);
          setQuery(id);
          // Choosing one is asking for it: the newest papers filed under it.
          setRunKey((was) => was + 1);
        }}
        onClose={() => setPicking(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  fields: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
});
