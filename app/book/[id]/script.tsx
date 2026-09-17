import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { getBook, getDocumentText, listChapters, type Book, type Chapter } from '../../../src/db/repo';
import { clearScript, listScript, type ScriptElement } from '../../../src/script/model';
import { convertToScript, estimateScript, scenesFor, type SceneUnit } from '../../../src/script/convert';
import { hasAnyKey } from '../../../src/ai/keys';
import type { Estimate } from '../../../src/ai/cost';
import { AiRunSheet } from '../../../src/ui/AiRunSheet';
import { ExportSheet } from '../../../src/ui/ExportSheet';
import { Hint, Row, Section } from '../../../src/ui/primitives';
import { space, usePalette } from '../../../src/theme';

export default function Script() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const palette = usePalette();

  const [book, setBook] = useState<Book | null>(null);
  const [text, setText] = useState('');
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [elements, setElements] = useState<ScriptElement[]>([]);
  const [units, setUnits] = useState<SceneUnit[]>([]);
  const [estimateValue, setEstimate] = useState<Estimate | null>(null);
  const [keyed, setKeyed] = useState(false);
  const [runOpen, setRunOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const load = useCallback(() => {
    if (!id) return;
    getBook(id).then(setBook);
    listChapters(id).then(setChapters);
    listScript(id).then(setElements);
    getDocumentText(id).then(async (document) => {
      setText(document);
      setUnits(await scenesFor(id, document));
    });
  }, [id]);

  useFocusEffect(load);

  useEffect(() => {
    hasAnyKey().then(setKeyed);
  }, []);

  useEffect(() => {
    if (!book || !units.length) return;
    estimateScript(units, book.language).then(setEstimate);
  }, [book, units]);

  if (!book) {
    return (
      <View style={[styles.center, { backgroundColor: palette.bg }]}>
        <ActivityIndicator />
      </View>
    );
  }

  function confirmClear() {
    Alert.alert(t('script.clear'), t('script.clearConfirm'), [
      { text: t('settings.cancel'), style: 'cancel' },
      {
        text: t('script.clear'),
        style: 'destructive',
        onPress: async () => {
          await clearScript(id!);
          load();
        },
      },
    ]);
  }

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}
    >
      <Stack.Screen options={{ title: t('book.script'), headerBackTitle: ' ' }} />

      <Section title={t('script.conversion')}>
        <Row
          label={elements.length ? t('script.convertAgain') : t('script.convert')}
          value={t('cast.costs')}
          onPress={units.length ? () => setRunOpen(true) : undefined}
        />
        <Row
          label={t('script.scenes')}
          value={`${units.length}`}
        />
        <Row
          label={t('book.export')}
          value={elements.length ? '›' : t('script.nothingYet')}
          onPress={elements.length ? () => setExportOpen(true) : undefined}
          last
        />
      </Section>
      <Hint>{t('script.hint')}</Hint>

      {elements.length > 0 && (
        <View style={[styles.page, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          {elements.slice(0, 120).map((element) => (
            <Text key={element.id} style={[styleFor(element.type), { color: palette.text }]}>
              {element.type === 'scene_heading' || element.type === 'character'
                ? element.text.toUpperCase()
                : element.text}
            </Text>
          ))}
          {elements.length > 120 ? (
            <Text style={{ color: palette.dim, fontSize: 12, marginTop: space.lg }}>
              {t('script.more', { count: elements.length - 120 })}
            </Text>
          ) : null}
        </View>
      )}

      {elements.length > 0 && (
        <Section>
          <Row label={t('script.clear')} onPress={confirmClear} danger last />
        </Section>
      )}

      <AiRunSheet
        visible={runOpen}
        title={t('script.convert')}
        description={t('script.what')}
        estimate={estimateValue}
        hasKey={keyed}
        onRun={async ({ signal, onProgress }) => {
          const run = await convertToScript(id!, units, { signal, onProgress });
          return t('script.converted', { scenes: run.scenes, failed: run.failed });
        }}
        onClose={(changed) => {
          setRunOpen(false);
          if (changed) load();
        }}
      />

      <ExportSheet
        visible={exportOpen}
        input={text ? { book, text, chapters, annotations: [], script: elements } : null}
        onClose={() => setExportOpen(false)}
      />
    </ScrollView>
  );
}

/** Screenplay indentation is the format; showing it flat would hide the point. */
function styleFor(type: ScriptElement['type']) {
  switch (type) {
    case 'scene_heading':
      return styles.heading;
    case 'character':
      return styles.character;
    case 'parenthetical':
      return styles.parenthetical;
    case 'dialogue':
      return styles.dialogue;
    case 'transition':
      return styles.transition;
    default:
      return styles.action;
  }
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  page: {
    marginTop: space.lg,
    padding: space.lg,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  heading: { fontSize: 14, fontWeight: '700', marginTop: space.lg, marginBottom: space.sm },
  action: { fontSize: 14, lineHeight: 21, marginBottom: space.sm },
  character: { fontSize: 14, fontWeight: '600', marginLeft: '28%', marginTop: space.sm },
  parenthetical: { fontSize: 13, marginLeft: '22%' },
  dialogue: { fontSize: 14, lineHeight: 21, marginLeft: '14%', marginRight: '14%', marginBottom: space.sm },
  transition: { fontSize: 13, textAlign: 'right', marginVertical: space.sm },
});
