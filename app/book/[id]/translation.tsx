import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from '../../../src/navigation/router';
import { useTranslation } from 'react-i18next';

import {
  getBook,
  getDocumentText,
  listChapters,
  type Book,
  type Chapter,
} from '../../../src/db/repo';
import {
  deleteTarget,
  listTargets,
  listUnits,
  rememberEdit,
  saveEdit,
  upsertTerm,
  markStaleContaining,
  type TranslationUnit,
} from '../../../src/db/translation';
import { estimateTranslation, pendingSpans, prepare, translate } from '../../../src/translate/run';
import { labelFor, targetLanguages } from '../../../src/translate/languages';
import { hasChanges } from '../../../src/translate/diff';
import { hasAnyKey } from '../../../src/ai/keys';
import type { Estimate } from '../../../src/ai/cost';
import { AiRunSheet } from '../../../src/ui/AiRunSheet';
import { PickerSheet } from '../../../src/ui/PickerSheet';
import { UnitEditor } from '../../../src/ui/UnitEditor';
import { ExportSheet } from '../../../src/ui/ExportSheet';
import { Hint, Row, Section } from '../../../src/ui/primitives';
import { radius, space, usePalette } from '../../../src/theme';

export default function TranslationPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const palette = usePalette();

  const [book, setBook] = useState<Book | null>(null);
  const [text, setText] = useState('');
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [targets, setTargets] = useState<{ target: string; units: number; done: number }[]>([]);
  const [target, setTarget] = useState<string | null>(null);
  const [chapterIdx, setChapterIdx] = useState(0);
  const [units, setUnits] = useState<TranslationUnit[]>([]);
  const [editing, setEditing] = useState<TranslationUnit | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [chapterOpen, setChapterOpen] = useState(false);
  const [runOpen, setRunOpen] = useState(false);
  const [estimateValue, setEstimate] = useState<Estimate | null>(null);
  const [keyed, setKeyed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [allUnits, setAllUnits] = useState<TranslationUnit[]>([]);

  const load = useCallback(() => {
    if (!id) return;
    getBook(id).then(setBook);
    getDocumentText(id).then(setText);
    listChapters(id).then(setChapters);
    listTargets(id).then((rows) => {
      setTargets(rows);
      setTarget((was) => was ?? rows[0]?.target ?? null);
    });
  }, [id]);

  useFocusEffect(load);

  useEffect(() => {
    hasAnyKey().then(setKeyed);
  }, []);

  const loadUnits = useCallback(() => {
    if (!id || !target) return;
    listUnits(id, target, chapterIdx).then(setUnits);
    listUnits(id, target).then(setAllUnits);
  }, [id, target, chapterIdx]);

  useEffect(loadUnits, [loadUnits]);

  useEffect(() => {
    if (!id || !target || !book) return;
    pendingSpans(id, target)
      .then((spans) => estimateTranslation(spans, book.language))
      .then(setEstimate);
  }, [id, target, book, units]);

  if (!book) {
    return (
      <View style={[styles.center, { backgroundColor: palette.bg }]}>
        <ActivityIndicator />
      </View>
    );
  }

  async function addTarget(code: string) {
    setAddOpen(false);
    setBusy(true);
    try {
      await prepare(id!, code, text, chapters, book!.language);
      setTarget(code);
      load();
    } finally {
      setBusy(false);
    }
  }

  function confirmRemove(code: string) {
    Alert.alert(t('translate.remove'), t('translate.removeConfirm', { language: labelFor(code) }), [
      { text: t('settings.cancel'), style: 'cancel' },
      {
        text: t('settings.delete'),
        style: 'destructive',
        onPress: async () => {
          await deleteTarget(id!, code);
          setTarget(null);
          load();
        },
      },
    ]);
  }

  const current = targets.find((entry) => entry.target === target);
  const remaining = current ? current.units - current.done : 0;

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}
    >
      <Stack.Screen options={{ title: t('book.translations'), headerBackTitle: ' ' }} />

      <View style={styles.chips}>
        {targets.map((entry) => (
          <Pressable
            key={entry.target}
            onPress={() => setTarget(entry.target)}
            onLongPress={() => confirmRemove(entry.target)}
            style={[
              styles.chip,
              {
                borderColor: entry.target === target ? palette.accent : palette.border,
                backgroundColor: entry.target === target ? palette.accent : palette.surface,
              },
            ]}
          >
            <Text style={{ color: entry.target === target ? palette.onAccent : palette.text, fontSize: 14 }}>
              {labelFor(entry.target)}  {Math.round((entry.done / Math.max(1, entry.units)) * 100)}%
            </Text>
          </Pressable>
        ))}
        <Pressable
          onPress={() => setAddOpen(true)}
          style={[styles.chip, { borderColor: palette.border, backgroundColor: palette.surface }]}
        >
          <Text style={{ color: palette.accent, fontSize: 14 }}>＋</Text>
        </Pressable>
      </View>

      {busy ? <ActivityIndicator style={{ marginTop: space.xl }} /> : null}

      {!target ? (
        <Hint>{t('translate.empty')}</Hint>
      ) : (
        <>
          <Section title={t('translate.run')}>
            <Row
              label={remaining > 0 ? t('translate.translateRemaining', { count: remaining }) : t('translate.allDone')}
              value={remaining > 0 ? t('cast.costs') : '✓'}
              onPress={remaining > 0 ? () => setRunOpen(true) : undefined}
            />
            <Row
              label={t('translate.glossary')}
              value="›"
              onPress={() => router.push(`/book/${id}/terms?target=${target}`)}
            />
            <Row label={t('book.export')} value="›" onPress={() => setExportOpen(true)} last />
          </Section>
          <Hint>{t('translate.glossaryHint')}</Hint>

          <Section title={t('translate.units')}>
            <Row
              label={t('book.jumpTo')}
              value={`${chapterLabel(chapters, chapterIdx)}  ›`}
              onPress={() => setChapterOpen(true)}
              last
            />
          </Section>

          <View style={{ marginTop: space.md }}>
            {units.map((unit) => (
              <Pressable
                key={unit.id}
                onPress={() => setEditing(unit)}
                style={[styles.unit, { backgroundColor: palette.surface, borderColor: palette.border }]}
              >
                <Text style={{ color: palette.dim, fontSize: 14, lineHeight: 21 }}>{unit.source}</Text>
                <Text
                  style={{
                    color: unit.machine ? palette.text : palette.faint,
                    fontSize: 15,
                    lineHeight: 23,
                    marginTop: space.xs,
                  }}
                >
                  {unit.edited ?? unit.machine ?? t('translate.notYet')}
                </Text>
                {hasChanges(unit.machine, unit.edited) ? (
                  <Text style={{ color: palette.accent, fontSize: 11, marginTop: 2 }}>
                    {t('translate.edited')}
                  </Text>
                ) : null}
                {unit.stale ? (
                  <Text style={{ color: palette.danger, fontSize: 11, marginTop: 2 }}>
                    {t('translate.stale')}
                  </Text>
                ) : null}
              </Pressable>
            ))}
          </View>
        </>
      )}

      <PickerSheet
        visible={addOpen}
        title={t('translate.addLanguage')}
        options={targetLanguages
          .filter((entry) => !targets.some((row) => row.target === entry.code))
          .map((entry) => ({ id: entry.code, label: entry.label }))}
        onPick={addTarget}
        onClose={() => setAddOpen(false)}
      />

      <PickerSheet
        visible={chapterOpen}
        title={t('book.jumpTo')}
        options={chapters.map((chapter) => ({
          id: String(chapter.idx),
          label: chapter.title.trim() || `${chapter.idx + 1}`,
        }))}
        selectedId={String(chapterIdx)}
        onPick={(value) => {
          setChapterIdx(Number(value));
          setChapterOpen(false);
        }}
        onClose={() => setChapterOpen(false)}
      />

      <AiRunSheet
        visible={runOpen}
        title={t('translate.title', { language: labelFor(target ?? '') })}
        description={t('translate.what')}
        estimate={estimateValue}
        hasKey={keyed}
        onRun={async ({ signal, onProgress }) => {
          const run = await translate(id!, target!, text, book!.language, { signal, onProgress });
          return t('translate.result', { translated: run.translated, failed: run.failed });
        }}
        onClose={(changed) => {
          setRunOpen(false);
          if (changed) {
            load();
            loadUnits();
          }
        }}
      />

      <ExportSheet
        visible={exportOpen}
        input={
          target && text
            ? {
                book,
                text,
                chapters,
                annotations: [],
                translation: { target, units: allUnits },
              }
            : null
        }
        onClose={() => setExportOpen(false)}
      />

      <UnitEditor
        unit={editing}
        onSave={async (value) => {
          if (!editing) return;
          const next = value.trim();
          await saveEdit(editing.id, next || null);
          // An accepted correction becomes an example for nearby sentences.
          if (editing.machine && next && next !== editing.machine.trim()) {
            await rememberEdit({
              bookId: id!,
              target: target!,
              source: editing.source,
              machine: editing.machine,
              edited: next,
            });
          }
          setEditing(null);
          loadUnits();
        }}
        onRevert={async () => {
          if (!editing) return;
          await saveEdit(editing.id, null);
          setEditing(null);
          loadUnits();
        }}
        onPromote={async (source, translation) => {
          await upsertTerm({ bookId: id!, target: target!, source, translation, locked: true });
          const affected = await markStaleContaining(id!, target!, source);
          setEditing(null);
          loadUnits();
          Alert.alert(t('translate.termAdded'), t('translate.termAffects', { count: affected }));
        }}
        onClose={() => setEditing(null)}
      />
    </ScrollView>
  );
}

function chapterLabel(chapters: Chapter[], idx: number): string {
  const chapter = chapters.find((entry) => entry.idx === idx);
  return chapter?.title.trim() || `${idx + 1}`;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  unit: {
    padding: space.md,
    marginBottom: space.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
