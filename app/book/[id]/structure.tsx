import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import {
  getBook,
  listChapters,
  listScenes,
  mergeUserEdits,
  replaceChapters,
  setSceneBreaks,
  toDrafts,
  type Book,
  type Chapter,
  type ChapterDraft,
  type Scene,
} from '../../../src/db/repo';
import { detectChapters } from '../../../src/structure/detect';
import { reconstruct } from '../../../src/structure/document';
import {
  deleteChapter,
  mergeWithNext,
  move,
  splitAt,
  splitPoints,
} from '../../../src/structure/edit';
import {
  detectChaptersWithAi,
  estimateDetection,
  estimateScenes,
  suggestScenes,
} from '../../../src/structure/assisted';
import { breaksOf } from '../../../src/structure/scenes';
import { hasAnyKey } from '../../../src/ai/keys';
import type { Estimate } from '../../../src/ai/cost';
import { AiRunSheet } from '../../../src/ui/AiRunSheet';
import { estimateBriefs, queueChapterRun, unbriefed } from '../../../src/analysis/runs';
import { Hint, Row, Search, SEARCHABLE_FROM, Section } from '../../../src/ui/primitives';
import { ActionMenu, type MenuAction } from '../../../src/ui/ActionMenu';
import { useDocument } from '../../../src/ui/useDocument';
import { backUpBefore } from '../../../src/backup/local';
import { space, usePalette } from '../../../src/theme';
import { useWorkRefresh } from '../../../src/work/refresh';

export default function StructurePage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const palette = usePalette();
  const [chapters, setChapters] = useState<Chapter[] | null>(null);
  const [query, setQuery] = useState('');
  const [text, setText] = useState('');
  const [book, setBook] = useState<Book | null>(null);
  const language = book?.language ?? 'en';
  const document = useDocument(id);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [busy, setBusy] = useState(false);
  const [actionsFor, setActionsFor] = useState<number | null>(null);
  const [splitFor, setSplitFor] = useState<number | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [sceneAiOpen, setSceneAiOpen] = useState(false);
  const [sceneFor, setSceneFor] = useState<number | null>(null);
  const [aiEstimate, setAiEstimate] = useState<Estimate | null>(null);
  const [sceneEstimate, setSceneEstimate] = useState<Estimate | null>(null);
  const [briefOpen, setBriefOpen] = useState(false);
  /** A single chapter's own AI action, opened from its ⋯ menu. */
  const [briefEstimate, setBriefEstimate] = useState<Estimate | null>(null);
  const [keyed, setKeyed] = useState(false);

  const load = useCallback(() => {
    if (!id) return;
    listChapters(id).then(setChapters);
    getBook(id).then(setBook);
    listScenes(id).then(setScenes);
  }, [id]);

  useFocusEffect(load);
  // A pass that lands while this page is open has to show up on it.
  useWorkRefresh(load);

  useEffect(() => {
    hasAnyKey().then(setKeyed);
  }, []);

  /**
   * Prices are worked out when the sheet that states them opens. Doing it on
   * focus read the whole manuscript, rebuilt every paragraph of it and walked
   * all five hundred chapters — to answer three questions nobody had asked.
   */
  async function openSheet(which: 'chapters' | 'scenes' | 'briefs') {
    const { text: body, hints } = await document.read();
    setText(body);
    if (which === 'chapters') {
      setAiOpen(true);
      estimateDetection(reconstruct(body, hints), language).then(setAiEstimate).catch(() => undefined);
      return;
    }
    if (which === 'scenes') {
      setSceneAiOpen(true);
      estimateScenes(body, chapters ?? [], language).then(setSceneEstimate).catch(() => undefined);
      return;
    }
    setBriefOpen(true);
    estimateBriefs(body, unbriefed(chapters ?? []), book ?? { language, kind: 'novel', title: '' })
      .then(setBriefEstimate)
      .catch(() => undefined);
  }

  /**
   * The per-chapter action. It still passes through the run sheet, because a
   * chapter is cheap but not free and nothing should start without saying so.
   */
  // One chapter is pennies and the answer is cached, so it runs on the tap.
  // Only a whole-book run is worth stopping someone to confirm.
  async function runOne(index: number, kind: 'deep-analyze' | 'chapter-brief') {
    setActionsFor(null);
    if (!chapters) return;
    await queueChapterRun(id!, kind, [chapters[index]]);
  }

  /** Everything this chapter supports, in the order it is usually wanted. */
  function chapterActions(index: number): MenuAction[] {
    const sceneCount = scenes.filter((scene) => scene.chapter_id === chapters?.[index]?.id).length;
    return [
      { label: t('structure.aiChapter'), onPress: () => runOne(index, 'deep-analyze') },
      { label: t('structure.aiChapterBrief'), onPress: () => runOne(index, 'chapter-brief') },
      { label: t('structure.split'), onPress: () => openPicker('split', index) },
      { label: t('structure.addScene'), onPress: () => openPicker('scene', index) },
      {
        label: t('structure.clearScenes', { count: sceneCount }),
        enabled: sceneCount > 0,
        onPress: async () => {
          await setSceneBreaks(id!, chapters![index], []);
          setActionsFor(null);
          load();
        },
      },
      {
        label: t('structure.mergeNext'),
        enabled: index < (chapters?.length ?? 0) - 1,
        onPress: () => apply(mergeWithNext(drafts, index)),
      },
      { label: t('structure.moveUp'), enabled: index > 0, onPress: () => apply(move(drafts, index, -1)) },
      {
        label: t('structure.moveDown'),
        enabled: index < (chapters?.length ?? 0) - 1,
        onPress: () => apply(move(drafts, index, 1)),
      },
      {
        label: t('structure.delete'),
        danger: true,
        enabled: (chapters?.length ?? 0) > 1,
        onPress: () =>
          Alert.alert(t('structure.delete'), t('structure.deleteConfirm'), [
            { text: t('settings.cancel'), style: 'cancel' },
            {
              text: t('structure.delete'),
              style: 'destructive',
              onPress: () => apply(deleteChapter(drafts, index)),
            },
          ]),
      },
    ];
  }

  /** The split and scene pickers need the text too, and only then. */
  async function openPicker(kind: 'split' | 'scene', index: number) {
    setText((await document.read()).text);
    setActionsFor(null);
    if (kind === 'split') setSplitFor(index);
    else setSceneFor(index);
  }

  async function apply(next: ChapterDraft[]) {
    if (!id) return;
    setBusy(true);
    try {
      // Every chapter of the book, rewritten in one go: the copy that undoes
      // it has to exist before it happens, not on tomorrow's schedule.
      await backUpBefore('restructure');
      await replaceChapters(id, next);
      load();
    } finally {
      setBusy(false);
      setActionsFor(null);
      setSplitFor(null);
    }
  }

  function redetect() {
    Alert.alert(t('structure.redetect'), t('structure.redetectConfirm'), [
      { text: t('settings.cancel'), style: 'cancel' },
      {
        text: t('structure.redetect'),
        onPress: async () => {
          if (!chapters) return;
          const { text: body, hints } = await document.read();
          const doc = reconstruct(body, hints);
          const detection = detectChapters(doc, language);
          const fresh: ChapterDraft[] = detection.chapters.map((chapter) => ({
            title: chapter.title,
            start: chapter.start,
            end: chapter.end,
            confident: chapter.confident,
            userEdited: false,
          }));
          await apply(mergeUserEdits(fresh, chapters));
        },
      },
    ]);
  }

  if (!chapters) {
    return (
      <View style={[styles.center, { backgroundColor: palette.bg }]}>
        <ActivityIndicator />
      </View>
    );
  }

  const drafts = toDrafts(chapters);
  // The number, the title and the brief: the three things anyone remembers a
  // chapter by. Editing still acts on the chapter itself, so a filtered list
  // is only a shorter way to reach the same row.
  const needle = query.trim().toLowerCase();
  const shown = needle
    ? chapters.filter((chapter) =>
        `${chapter.idx + 1} ${chapter.title} ${chapter.brief ?? ''}`.toLowerCase().includes(needle)
      )
    : chapters;
  const unsure = chapters.filter((chapter) => !chapter.confident).length;
  // A chapter already briefed costs nothing to skip and everything to redo.
  const pending = unbriefed(chapters);

  // Scene counts are looked up per row; filtering the whole list inside the
  // row would be five hundred passes over it on every render.
  const sceneCounts = new Map<string, number>();
  for (const scene of scenes) {
    sceneCounts.set(scene.chapter_id, (sceneCounts.get(scene.chapter_id) ?? 0) + 1);
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <FlatList
        contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}
        data={shown}
        keyExtractor={(chapter) => chapter.id}
        // A 500-chapter book mounts every row at once in a ScrollView.
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={9}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <>
            <Stack.Screen options={{ title: t('structure.title'), headerBackTitle: ' ' }} />
            {chapters.length >= SEARCHABLE_FROM && (
              <Search value={query} onChange={setQuery} placeholder={t('structure.search')} />
            )}
            <Text style={[styles.sectionTitle, { color: palette.dim }]}>
              {needle
                ? t('structure.found', { count: shown.length })
                : t('structure.chapters').toUpperCase()}
            </Text>
          </>
        }
        ListEmptyComponent={
          <Text style={{ color: palette.dim, fontSize: 14, paddingVertical: space.lg }}>
            {t('book.jumpNone')}
          </Text>
        }
        renderItem={({ item: chapter, index }) => (
          <View
            style={[
              styles.row,
              { backgroundColor: palette.surface, borderColor: palette.border },
              index === 0 && styles.firstRow,
              index === shown.length - 1 ? styles.lastRow : { borderBottomWidth: StyleSheet.hairlineWidth },
            ]}
          >
            {/* The number is the chapter's place in the book, not its place in
                a filtered list — searching must not renumber the book. */}
            <Text style={{ color: palette.faint, fontSize: 13, width: 28 }}>{chapter.idx + 1}</Text>
            {/* The row navigates; the chapter's own page is where it is edited. */}
            <Pressable
              onPress={() => router.push(`/chapter/${chapter.id}`)}
              style={{ flex: 1 }}
              hitSlop={4}
            >
              <Text numberOfLines={1} style={{ color: palette.text, fontSize: 16 }}>
                {chapter.title.trim() || t('structure.untitled')}
              </Text>
              <Text
                numberOfLines={2}
                style={[
                  { fontSize: 13, lineHeight: 18, marginTop: 2 },
                  chapter.brief?.trim()
                    ? { color: palette.dim }
                    : { color: palette.faint },
                ]}
              >
                {chapter.brief?.trim() || t('structure.briefPlaceholder')}
              </Text>
              <Text style={{ color: palette.faint, fontSize: 12, marginTop: 2 }}>
                {t('structure.meta', {
                  chars: chapter.end - chapter.start,
                  scenes: sceneCounts.get(chapter.id) ?? 0,
                })}
                {chapter.confident ? '' : `  ·  ${t('structure.unsure')}`}
                {chapter.user_edited ? `  ·  ${t('structure.edited')}` : ''}
              </Text>
            </Pressable>
            <Text style={{ color: palette.faint, fontSize: 16 }}>›</Text>
            {/* Every action edits by position in the book, which a filtered
                list no longer agrees with. */}
            <Pressable
              onPress={() => setActionsFor(chapters.findIndex((entry) => entry.id === chapter.id))}
              style={styles.more}
              hitSlop={8}
            >
              <Text style={{ color: palette.accent, fontSize: 20 }}>⋯</Text>
            </Pressable>
          </View>
        )}
        ListFooterComponent={
          <>
        {unsure > 0 ? <Hint>{t('structure.unsureCount', { count: unsure })}</Hint> : null}

        <Section>
          <Row label={t('structure.redetect')} onPress={redetect} />
          <Row
            label={t('structure.aiDetect')}
            value={t('structure.aiDetectValue')}
            onPress={() => openSheet('chapters')}
          />
          <Row
            label={t('structure.aiScenes')}
            value={t('structure.aiDetectValue')}
            onPress={() => openSheet('scenes')}
          />
          <Row
            label={t('structure.aiBriefs', { count: pending.length })}
            value={t('structure.aiDetectValue')}
            onPress={pending.length ? () => openSheet('briefs') : undefined}
            last
          />
        </Section>
        <Hint>{t('structure.redetectHint')}</Hint>

          </>
        }
      />

      <ActionMenu
        visible={actionsFor !== null}
        busy={busy}
        title={t('structure.chapterN', { n: (actionsFor ?? 0) + 1 })}
        onClose={() => setActionsFor(null)}
        actions={chapterActions(actionsFor ?? 0)}
      />

      <AiRunSheet
        visible={aiOpen}
        title={t('structure.aiDetect')}
        description={t('structure.aiDetectWhat')}
        estimate={aiEstimate}
        hasKey={keyed}
        onRun={async ({ signal, onProgress }) => {
          const found = await detectChaptersWithAi(reconstruct(text, (await document.read()).hints), {
            signal,
            onProgress,
          });
          if (!found.chapters.length) return t('structure.aiFoundNothing');
          await apply(
            mergeUserEdits(
              found.chapters.map((chapter) => ({ ...chapter, userEdited: false })),
              chapters ?? []
            )
          );
          return t('structure.aiFound', { count: found.chapters.length, failed: found.failed });
        }}
        onClose={(changed) => {
          setAiOpen(false);
          if (changed) load();
        }}
      />

      <AiRunSheet
        visible={briefOpen}
        title={t('structure.aiBriefs', { count: pending.length })}
        description={t('structure.aiBriefsWhat')}
        estimate={briefEstimate}
        hasKey={keyed}
        onRun={async () => {
          await queueChapterRun(id!, 'chapter-brief', pending);
          return t('work.queued', { count: pending.length });
        }}
        onClose={() => setBriefOpen(false)}
      />

      <AiRunSheet
        visible={sceneAiOpen}
        title={t('structure.aiScenes')}
        description={t('structure.aiScenesWhat')}
        estimate={sceneEstimate}
        hasKey={keyed}
        onRun={async ({ signal, onProgress }) => {
          const found = await suggestScenes(text, chapters ?? [], { signal, onProgress });
          const byIdx = new Map((chapters ?? []).map((chapter) => [chapter.idx, chapter]));
          let marked = 0;
          for (const suggestion of found.suggestions) {
            const chapter = byIdx.get(suggestion.chapterIndex);
            if (!chapter) continue;
            await setSceneBreaks(id!, chapter, suggestion.breaks);
            marked += suggestion.breaks.length;
          }
          load();
          return t('structure.aiScenesFound', { count: marked, failed: found.failed });
        }}
        onClose={(changed) => {
          setSceneAiOpen(false);
          if (changed) load();
        }}
      />

      {/* A scene break is a place, and the only readable place is a paragraph. */}
      <SplitPicker
        index={sceneFor}
        title={t('structure.sceneAt')}
        chapters={chapters}
        text={text}
        onClose={() => setSceneFor(null)}
        onPick={async (index, offset) => {
          const chapter = chapters[index];
          const existing = breaksOf(
            scenes.filter((scene) => scene.chapter_id === chapter.id),
            chapter.start
          );
          await setSceneBreaks(id!, chapter, [...existing, offset]);
          setSceneFor(null);
          load();
        }}
      />

      <SplitPicker
        index={splitFor}
        title={t('structure.splitAt')}
        chapters={chapters}
        text={text}
        onClose={() => setSplitFor(null)}
        onPick={(index, offset) => apply(splitAt(drafts, index, offset))}
      />
    </View>
  );
}

function ActionSheet({
  index, count, busy, sceneCount,
  onClose, onAnalyze, onBrief, onSplit, onScene, onClearScenes, onMerge, onMove, onDelete,
}: {
  index: number | null;
  count: number;
  busy: boolean;
  sceneCount: number;
  onClose: () => void;
  onAnalyze: (index: number) => void;
  onBrief: (index: number) => void;
  onSplit: () => void;
  onScene: () => void;
  onClearScenes: (index: number) => void;
  onMerge: (index: number) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onDelete: (index: number) => void;
}) {
  const { t } = useTranslation();
  const palette = usePalette();
  if (index === null) return null;

  // The AI actions come first: they are what this menu is opened for most.
  const actions = [
    { label: t('structure.aiChapter'), onPress: () => onAnalyze(index), enabled: true, danger: false },
    { label: t('structure.aiChapterBrief'), onPress: () => onBrief(index), enabled: true, danger: false },
    { label: t('structure.split'), onPress: onSplit, enabled: true, danger: false },
    { label: t('structure.addScene'), onPress: onScene, enabled: true, danger: false },
    {
      label: t('structure.clearScenes', { count: sceneCount }),
      onPress: () => onClearScenes(index),
      enabled: sceneCount > 0,
      danger: false,
    },
    { label: t('structure.mergeNext'), onPress: () => onMerge(index), enabled: index < count - 1, danger: false },
    { label: t('structure.moveUp'), onPress: () => onMove(index, -1), enabled: index > 0, danger: false },
    { label: t('structure.moveDown'), onPress: () => onMove(index, 1), enabled: index < count - 1, danger: false },
    { label: t('structure.delete'), onPress: () => onDelete(index), enabled: count > 1, danger: true },
  ];

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={[styles.scrim, { backgroundColor: palette.scrim }]} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: palette.surface, borderColor: palette.border }]}
          onPress={(event) => event.stopPropagation()}
        >
          <Text style={{ color: palette.dim, fontSize: 13, paddingVertical: space.md }}>
            {t('structure.chapterN', { n: index + 1 })}
          </Text>
          {actions.map((action) => (
            <Pressable
              key={action.label}
              disabled={!action.enabled || busy}
              onPress={action.onPress}
              style={{ paddingVertical: space.md }}
            >
              <Text
                style={{
                  color: !action.enabled ? palette.faint : action.danger ? palette.danger : palette.text,
                  fontSize: 16,
                }}
              >
                {action.label}
              </Text>
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Splitting needs a place, and the only readable place is a paragraph start. */
function SplitPicker({ index, title, chapters, text, onClose, onPick }: {
  index: number | null;
  title: string;
  chapters: Chapter[];
  text: string;
  onClose: () => void;
  onPick: (index: number, offset: number) => void;
}) {
  const { t } = useTranslation();
  const palette = usePalette();
  if (index === null) return null;
  const chapter = chapters[index];
  const points = splitPoints(text, chapter);

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: palette.bg }}>
        <View style={styles.modalBar}>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={{ color: palette.accent, fontSize: 16 }}>{t('settings.cancel')}</Text>
          </Pressable>
          <Text style={{ color: palette.text, fontSize: 16, fontWeight: '600' }}>{title}</Text>
          <View style={{ width: 50 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: space.lg }}>
          {points.length === 0 ? (
            <Text style={{ color: palette.dim }}>{t('structure.noSplitPoints')}</Text>
          ) : (
            points.map((point) => (
              <Pressable
                key={point.offset}
                onPress={() => onPick(index, point.offset)}
                style={{ paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: palette.border }}
              >
                <Text numberOfLines={2} style={{ color: palette.text, fontSize: 15 }}>
                  {point.preview}
                </Text>
              </Pressable>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: {
    fontSize: 12,
    letterSpacing: 0.8,
    fontWeight: '600',
    paddingHorizontal: space.xs,
    marginBottom: space.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    borderTopWidth: 0,
  },
  firstRow: { borderTopLeftRadius: 12, borderTopRightRadius: 12, borderTopWidth: StyleSheet.hairlineWidth },
  lastRow: {
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  more: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  scrim: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.xl,
    paddingBottom: space.xxl,
  },
  modalBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: space.lg,
  },
});
