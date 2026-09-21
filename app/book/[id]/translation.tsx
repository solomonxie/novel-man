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
  pendingByChapter,
  rememberEdit,
  saveEdit,
  upsertTerm,
  markStaleContaining,
  type TranslationUnit,
} from '../../../src/db/translation';
import { estimateTranslation, pendingSpans, prepare } from '../../../src/translate/run';
import { queueTranslation } from '../../../src/analysis/runs';
import { useWorkRefresh } from '../../../src/work/refresh';
import { labelFor, targetLanguages } from '../../../src/translate/languages';
import { hasChanges } from '../../../src/translate/diff';
import { hasAnyKey } from '../../../src/ai/keys';
import type { Estimate } from '../../../src/ai/cost';
import { TranslateSheet, type Pending } from '../../../src/ui/TranslateSheet';
import { PickerSheet } from '../../../src/ui/PickerSheet';
import { UnitEditor } from '../../../src/ui/UnitEditor';
import { ExportSheet } from '../../../src/ui/ExportSheet';
import { Hint, Row, Section } from '../../../src/ui/primitives';
import { radius, space, usePalette } from '../../../src/theme';

export default function TranslationPage() {
  // A chapter page hands over both: which language, and where in the book.
  const { id, target: asked, chapter: askedChapter } = useLocalSearchParams<{
    id: string;
    target?: string;
    chapter?: string;
  }>();
  const { t } = useTranslation();
  const palette = usePalette();

  const [book, setBook] = useState<Book | null>(null);
  const [text, setText] = useState('');
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [targets, setTargets] = useState<{ target: string; units: number; done: number }[]>([]);
  const [target, setTarget] = useState<string | null>(null);
  const [chapterIdx, setChapterIdx] = useState(askedChapter ? Number(askedChapter) : 0);
  /** Null while the page is its list of chapters; an index once one is open. */
  const [openChapter, setOpenChapter] = useState<number | null>(
    askedChapter ? Number(askedChapter) : null
  );
  const [units, setUnits] = useState<TranslationUnit[]>([]);
  const [editing, setEditing] = useState<TranslationUnit | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [runOpen, setRunOpen] = useState(false);
  const [estimateValue, setEstimate] = useState<Estimate | null>(null);
  const [keyed, setKeyed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [allUnits, setAllUnits] = useState<TranslationUnit[]>([]);
  /** What is left, per chapter: the chooser's list and the progress behind it. */
  const [pending, setPending] = useState<Pending[]>([]);

  const load = useCallback(() => {
    if (!id) return;
    getBook(id).then(setBook);
    getDocumentText(id).then(setText);
    listChapters(id).then(setChapters);
    listTargets(id).then((rows) => {
      setTargets(rows);
      setTarget((was) => was ?? asked ?? rows[0]?.target ?? null);
    });
  }, [id, asked]);

  useFocusEffect(load);

  useEffect(() => {
    hasAnyKey().then(setKeyed);
  }, []);

  const loadUnits = useCallback(() => {
    if (!id || !target) return;
    listUnits(id, target, chapterIdx).then(setUnits);
    listUnits(id, target).then(setAllUnits);
    pendingByChapter(id, target).then(setPending);
  }, [id, target, chapterIdx]);

  useEffect(loadUnits, [loadUnits]);
  // A chapter finishing in the queue has to show up here.
  useWorkRefresh(() => {
    load();
    loadUnits();
  });

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

  const byChapter = new Map(pending.map((row) => [row.chapter_idx, row.pending]));
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
              detail={remaining > 0 ? t('translate.chooseHint') : undefined}
              value={remaining > 0 ? t('cast.costs') : '✓'}
              onPress={remaining > 0 ? () => setRunOpen(true) : undefined}
            />
            <Row
              label={t('translate.mapping')}
              value="›"
              onPress={() => router.push(`/book/${id}/mapping?target=${target}`)}
            />
            <Row label={t('book.export')} value="›" onPress={() => setExportOpen(true)} last />
          </Section>
          <Hint>{t('translate.mappingHint')}</Hint>

          {/* A book is translated a chapter at a time, so a chapter is what this
              page lists. The sentences are inside one, where they are read. */}
          {openChapter === null ? (
            <Section title={t('translate.chapters')}>
              {chapters.map((chapter, index) => {
                const left = byChapter.get(chapter.idx) ?? 0;
                return (
                  <Row
                    key={chapter.id}
                    label={chapter.title.trim() || `${chapter.idx + 1}`}
                    detail={
                      left
                        ? t('translate.sentencesLeft', { count: left })
                        : t('translate.chapterDone')
                    }
                    value={left ? `${left}  ›` : '✓  ›'}
                    onPress={() => {
                      setChapterIdx(chapter.idx);
                      setOpenChapter(chapter.idx);
                    }}
                    last={index === chapters.length - 1}
                  />
                );
              })}
            </Section>
          ) : (
            <Section title={chapterLabel(chapters, chapterIdx)}>
              <Row
                label={t('translate.backToChapters')}
                value={`${units.length}  ‹`}
                onPress={() => setOpenChapter(null)}
                last
              />
            </Section>
          )}

          <View style={{ marginTop: space.md }}>
            {(openChapter === null ? [] : units).map((unit) => (
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

      <TranslateSheet
        visible={runOpen}
        chapters={chapters}
        pending={pending}
        language={labelFor(target ?? '')}
        estimate={estimateValue}
        hasKey={keyed}
        onQueue={async (picked) => {
          setRunOpen(false);
          await queueTranslation(
            id!,
            target!,
            picked.map((chapter) => ({ idx: chapter.idx, label: chapterLabel(chapters, chapter.idx) }))
          );
        }}
        onClose={() => setRunOpen(false)}
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
