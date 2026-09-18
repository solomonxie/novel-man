import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import {
  countVersesIn,
  getBook,
  getPart,
  listAnnotations,
  listPartChapters,
  renamePart,
  setPartDetail,
  type Annotation,
  type Book,
  type Chapter,
  type Part,
} from '../../../../src/db/repo';
import { estimateDeep, queueChapterRun } from '../../../../src/analysis/runs';
import { hasAnyKey } from '../../../../src/ai/keys';
import type { Estimate } from '../../../../src/ai/cost';
import { AiRunSheet } from '../../../../src/ui/AiRunSheet';
import { useDocument } from '../../../../src/ui/useDocument';
import { kindOf, supports } from '../../../../src/books/kinds';
import { Action, Badge, Block, Empty, Fact, Hero, Item, Writable } from '../../../../src/ui/detail';
import { Cover, Hint, Search, SEARCHABLE_FROM } from '../../../../src/ui/primitives';
import { InlineText } from '../../../../src/ui/inline';
import { pickImage } from '../../../../src/ui/fields';
import { adoptImage } from '../../../../src/storage/files';
import { formatCount } from '../../../../src/text/counts';
import { space, usePalette } from '../../../../src/theme';
import { useWorkRefresh } from '../../../../src/work/refresh';

/**
 * A bible book, a novel's 卷: the page for the level above the chapter. It is
 * the book page's shape at the part's scale — what it is, what is true about
 * it, what you can do to it — because Genesis is the unit a reader of a bible
 * actually holds in mind, and until now it was a row that only led away.
 */
export default function PartPage() {
  const { id, idx } = useLocalSearchParams<{ id: string; idx: string }>();
  const partIdx = Number(idx);
  const { t } = useTranslation();
  const palette = usePalette();
  const document = useDocument(id);

  const [book, setBook] = useState<Book | null>(null);
  const [part, setPart] = useState<Part | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [verses, setVerses] = useState(0);
  const [query, setQuery] = useState('');
  const [analyzeOpen, setAnalyzeOpen] = useState(false);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [keyed, setKeyed] = useState(false);

  const load = useCallback(() => {
    if (!id || !Number.isFinite(partIdx)) return;
    getBook(id).then(setBook);
    listPartChapters(id, partIdx).then(setChapters);
    getPart(id, partIdx).then(async (found) => {
      setPart(found);
      if (found) setVerses(await countVersesIn(id, found.start, found.end));
    });
    listAnnotations(id).then(setAnnotations);
  }, [id, partIdx]);

  useFocusEffect(load);
  useWorkRefresh(load);

  useEffect(() => {
    hasAnyKey().then(setKeyed);
  }, []);

  // Notes are kept per book, at book offsets — so the ones that belong to this
  // part are the ones that fall inside it. Nothing had to be filed twice.
  const notes = useMemo(
    () => (part ? annotations.filter((entry) => entry.start >= part.start && entry.start < part.end) : []),
    [annotations, part]
  );

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return chapters;
    return chapters.filter((chapter) =>
      `${chapter.idx + 1} ${chapter.title} ${chapter.brief ?? ''}`.toLowerCase().includes(needle)
    );
  }, [chapters, query]);

  if (!book || !part) {
    return (
      <View style={[styles.center, { backgroundColor: palette.bg }]}>
        <ActivityIndicator />
      </View>
    );
  }

  const unit = kindOf(book.kind).part ?? 'volume';
  const read = (chapter?: Chapter) =>
    router.push(
      chapter
        ? `/reader/${book.id}?chapter=${chapter.idx}`
        : `/reader/${book.id}?at=${part.start}`
    );

  async function openAnalyze() {
    setAnalyzeOpen(true);
    setEstimate(null);
    const { text } = await document.read();
    estimateDeep(text, chapters, book!).then(setEstimate).catch(() => undefined);
  }

  async function pickPicture() {
    const uri = await pickImage();
    if (!uri) return;
    await setPartDetail(book!.id, partIdx, { image_path: adoptImage(uri, 'part') });
    load();
  }

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen options={{ title: part.title, headerBackTitle: ' ' }} />

      <Hero
        eyebrow={book.title}
        avatar={
          <Pressable onPress={pickPicture}>
            <Cover title={part.title} hue={(book.cover_hue + partIdx * 7) % 360} width={84} path={part.image_path} />
            <View style={[styles.badge, { backgroundColor: palette.surface, borderColor: palette.border }]}>
              <Text style={{ fontSize: 11 }}>✎</Text>
            </View>
          </Pressable>
        }
        facts={
          <>
            <Fact value={chapters.length} label={t('units.unit_chapters')} />
            {verses > 0 && <Fact value={formatCount(verses, 'en')} label={t('units.unit_verses')} />}
            <Fact
              value={formatCount(part.end - part.start, book.language)}
              label={t('units.unit_long')}
            />
            {notes.length > 0 && <Fact value={notes.length} label={t('units.unit_notes')} />}
          </>
        }
        actions={
          <>
            <Action label={t('part.read')} tone="loud" onPress={() => read()} />
            <Action label={t('book.analyzeShort')} onPress={openAnalyze} />
          </>
        }
        note={t('part.analyzeScope', { count: chapters.length, name: part.title })}
      >
        <InlineText
          value={part.title}
          placeholder={t(`book.parts_${unit}`)}
          onCommit={(value) => renamePart(book.id, partIdx, value).then(load)}
          style={{ color: palette.text, fontSize: 22, fontWeight: '700' }}
          multiline
        />
      </Hero>

      <View style={{ marginTop: space.lg }}>
        <Writable empty={!part.summary?.trim()}>
          <InlineText
            value={part.summary}
            placeholder={t('part.summaryPlaceholder')}
            onCommit={(value) =>
              setPartDetail(book.id, partIdx, { summary: value.trim() || null }).then(load)
            }
            style={{ color: palette.dim, fontSize: 15, lineHeight: 22 }}
            multiline
          />
        </Writable>
      </View>

      <Block title={t('book.chapters')} count={chapters.length || undefined}>
        {chapters.length >= SEARCHABLE_FROM && (
          <View style={{ marginBottom: space.md }}>
            <Search value={query} onChange={setQuery} placeholder={t('book.jumpSearch')} />
          </View>
        )}
        {shown.length === 0 ? (
          <Empty text={t('book.jumpNone')} />
        ) : (
          shown.map((chapter, index) => (
            // The row reads it. A part is a place in the book, and its own page
            // is where a chapter is edited — reached from Chapters, not here.
            <Item
              key={chapter.id}
              badge={<Badge n={chapter.idx + 1} />}
              title={chapter.title.trim() || `${chapter.idx + 1}`}
              detail={chapter.brief?.trim() || undefined}
              onPress={() => read(chapter)}
              last={index === shown.length - 1}
            />
          ))
        )}
      </Block>

      <Block
        title={t('book.notesShort')}
        count={notes.length || undefined}
        onOpen={notes.length ? () => router.push(`/book/${book.id}/notes`) : undefined}
      >
        {notes.length === 0 ? (
          <Empty text={t('part.noNotes')} />
        ) : (
          notes.slice(0, 5).map((note, index) => (
            <Item
              key={note.id}
              title={note.quote.trim()}
              quiet
              detail={note.note?.trim() || undefined}
              onPress={() => router.push(`/reader/${book.id}?at=${note.start}`)}
              last={index === Math.min(notes.length, 5) - 1}
            />
          ))
        )}
      </Block>

      {supports(book.kind, 'verses') ? <Hint>{t('part.hint')}</Hint> : null}

      <AiRunSheet
        visible={analyzeOpen}
        title={t('book.analyze')}
        description={t(
          supports(book.kind, 'verses') ? 'part.analyzeWhatCited' : 'part.analyzeWhat',
          { count: chapters.length, name: part.title }
        )}
        estimate={estimate}
        hasKey={keyed}
        onRun={async () => {
          await queueChapterRun(book.id, 'deep-analyze', chapters);
          return t('work.queued', { count: chapters.length });
        }}
        onClose={() => setAnalyzeOpen(false)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    right: -6,
    bottom: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
