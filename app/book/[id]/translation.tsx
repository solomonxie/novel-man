import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from '../../../src/navigation/router';
import { useTranslation } from 'react-i18next';

import {
  getBook,
  listChapters,
  type Book,
  type Chapter,
} from '../../../src/db/repo';
import {
  deleteTarget,
  listTargets,
  listUnits,
  markChapterStale,
  rememberEdit,
  saveEdit,
  pendingByChapter,
  type Pending,
  type TranslationUnit,
} from '../../../src/db/translation';
import { prepare } from '../../../src/translate/run';
import { queueTranslation } from '../../../src/analysis/runs';
import { stoppedWithoutKey } from '../../../src/ai/guard';
import { useWorkRefresh } from '../../../src/work/refresh';
import { labelFor, targetLanguages } from '../../../src/translate/languages';
import { Hint, PrimaryAction, Row, Section } from '../../../src/ui/primitives';
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
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [targets, setTargets] = useState<{ target: string; units: number; done: number }[]>([]);
  const [target, setTarget] = useState<string | null>(null);
  const [chapterIdx, setChapterIdx] = useState(askedChapter ? Number(askedChapter) : 0);
  const [queued, setQueued] = useState(false);
  const [units, setUnits] = useState<TranslationUnit[]>([]);
  /** What is left, per chapter: the chooser's list and the progress behind it. */
  const [pending, setPending] = useState<Pending[]>([]);

  const load = useCallback(() => {
    if (!id) return;
    getBook(id).then(setBook);
    listChapters(id).then(setChapters);
    listTargets(id).then((rows) => {
      setTargets(rows);
      setTarget((was) => was ?? asked ?? rows[0]?.target ?? null);
    });
  }, [id, asked]);

  useFocusEffect(load);

  const loadUnits = useCallback(() => {
    if (!id || !target) return;
    listUnits(id, target, chapterIdx).then(setUnits);
    pendingByChapter(id, target).then(setPending);
  }, [id, target, chapterIdx]);

  useEffect(loadUnits, [loadUnits]);
  // A chapter finishing in the queue has to show up here.
  useWorkRefresh(() => {
    load();
    loadUnits();
  });

  /**
   * "Queued" is a state of the work, not of the button, and the work finishes
   * without telling the button. So the moment this chapter has nothing left
   * to translate, the button stops claiming otherwise.
   */
  const waiting = pending.find((row) => row.chapter_idx === chapterIdx)?.pending ?? 0;
  useEffect(() => {
    if (waiting === 0) setQueued(false);
  }, [waiting]);

  if (!book) {
    return (
      <View style={[styles.center, { backgroundColor: palette.bg }]}>
        <ActivityIndicator />
      </View>
    );
  }

  /**
   * A correction, saved where it was typed. It is also kept as an example: the
   * sentences after it are translated knowing how this one was put right.
   */
  async function saveUnit(unit: TranslationUnit, value: string) {
    const next = value.trim();
    await saveEdit(unit.id, next || null);
    if (unit.machine && next && next !== unit.machine.trim()) {
      await rememberEdit({
        bookId: id!,
        target: target!,
        source: unit.source,
        machine: unit.machine,
        edited: next,
      });
    }
    loadUnits();
  }

  function confirmRemove(code: string) {
    Alert.alert(t('translate.remove'), t('translate.removeConfirm', { language: labelFor(code) }), [
      { text: t('settings.cancel'), style: 'cancel' },
      {
        text: t('settings.delete'),
        style: 'destructive',
        onPress: async () => {
          await deleteTarget(id!, code);
          // Back to the chapter that opened this: the page it was showing no
          // longer exists, and an empty one in its place is a dead end.
          router.back();
        },
      },
    ]);
  }

  /** This chapter's own share of that, which is all this page acts on. */
  const left = waiting;
  const busy = queued && left > 0;

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}
    >
      <Stack.Screen
        options={{
          title: target ? labelFor(target) : t('book.translations'),
          headerBackTitle: ' ',
        }}
      />

      {/* One language and one chapter, both handed over by the page that
          opened this. There is nothing to choose here: adding a language
          happens on the chapter, and the glossary is a row there too. */}
      {!target ? (
        <Hint>{t('translate.empty')}</Hint>
      ) : (
        <>
          <Text style={{ color: palette.dim, fontSize: 13, marginBottom: space.md }}>
            {left > 0
              ? t('translate.sentencesLeft', { count: left })
              : t('translate.readInReader')}
          </Text>

          {/* The glossary is the language's, not the chapter's: what is
              mapped here is obeyed everywhere this language is written. */}
          <Section>
            <Row
              label={t('translate.mapping')}
              detail={t('translate.mappingShort')}
              value="›"
              onPress={() => router.push(`/book/${id}/mapping?target=${target}`)}
              last
            />
          </Section>

          {/* Read again with what is known now. A mapping written after the
              first run is a mapping that run never saw — and so is a
              correction made three chapters later, which is fed back as an
              example. Corrections themselves survive: an edit outranks the
              machine line wherever both exist. */}
          {units.length > 0 ? (
            <View style={{ marginTop: space.lg }}>
              <PrimaryAction
                // One button, because there is one thing to do here. What it
                // says depends only on whether anything is still waiting: a
                // half-translated chapter used to show both of these at once,
                // one above the mapping and one below.
                label={
                  busy
                    ? t('work.queuedShort')
                    : left > 0
                      ? t('translate.translateChapter')
                      : t('translate.again')
                }
                // No confirm: it is undoable in the only sense that matters —
                // hand-written corrections survive it, and the rest was
                // machine text either way.
                onPress={async () => {
                  if (busy) return;
                  if (await stoppedWithoutKey(t)) return;
                  // Nothing waiting means everything here is already written,
                  // so there is something to mark before there is anything to do.
                  if (left === 0) await markChapterStale(id!, target, chapterIdx);
                  await queueTranslation(id!, target, [
                    { idx: chapterIdx, label: chapterLabel(chapters, chapterIdx) },
                  ]);
                  setQueued(true);
                  loadUnits();
                }}
              />
            </View>
          ) : null}

          {/* The chapter as it reads now, sentence by sentence. This is where
              a translation is corrected — the reader is where it is read — and
              a correction is kept as an example for the sentences after it. */}
          <Section title={t('translate.sentences', { count: units.length })}>
            {units.length === 0 ? (
              <Row label={t('translate.nothingYet')} last />
            ) : (
              units.map((unit, index) => (
                <UnitRow
                  key={unit.id}
                  unit={unit}
                  last={index === units.length - 1}
                  onSave={(value) => saveUnit(unit, value)}
                  onRevert={async () => {
                    await saveEdit(unit.id, null);
                    loadUnits();
                  }}
                />
              ))
            )}
          </Section>
          <Hint>{t('translate.editHint')}</Hint>

          <View style={{ marginTop: space.xl }}>
            <PrimaryAction
              label={t('translate.remove')}
              onPress={() => confirmRemove(target)}
              danger
            />
          </View>

        </>
      )}

    </ScrollView>
  );
}

/**
 * One sentence, corrected in place.
 *
 * It was a sheet, which meant a tap to open, a tap to save and a tap to close
 * for a line of text already on screen — and the sheet carried a word-mapping
 * form that belongs on the mapping page, where the whole glossary is. Now the
 * translation *is* the field: type in it, and leaving it saves.
 */
function UnitRow({ unit, last, onSave, onRevert }: {
  unit: TranslationUnit;
  last: boolean;
  onSave: (value: string) => void;
  onRevert: () => void;
}) {
  const { t } = useTranslation();
  const palette = usePalette();
  const saved = unit.edited ?? unit.machine ?? '';
  const [draft, setDraft] = useState(saved);
  useEffect(() => setDraft(saved), [saved]);

  return (
    <View
      style={[
        styles.unit,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: palette.border },
      ]}
    >
      <Text style={{ color: palette.dim, fontSize: 13 }}>{unit.source}</Text>
      <TextInput
        value={draft}
        onChangeText={setDraft}
        onBlur={() => draft.trim() !== saved.trim() && onSave(draft)}
        multiline
        scrollEnabled={false}
        placeholder={t('translate.notYet')}
        placeholderTextColor={palette.faint}
        style={{
          color: unit.edited ? palette.accent : palette.text,
          fontSize: 15,
          marginTop: 2,
          padding: 0,
        }}
      />
      {unit.edited ? (
        <Pressable onPress={onRevert} hitSlop={8} style={{ alignSelf: 'flex-start' }}>
          <Text style={{ color: palette.dim, fontSize: 12, marginTop: space.xs }}>
            {t('translate.revert')}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function chapterLabel(chapters: Chapter[], idx: number): string {
  const chapter = chapters.find((entry) => entry.idx === idx);
  return chapter?.title.trim() || `${idx + 1}`;
}

const styles = StyleSheet.create({
  unit: { paddingHorizontal: space.lg, paddingVertical: space.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
