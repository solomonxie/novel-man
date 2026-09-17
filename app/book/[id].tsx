import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import {
  countEntities,
  listScenes,
  createEntity,
  deleteBook,
  getBook,
  getProgress,
  listAnnotations,
  listChapters,
  listEntities,
  listMentions,
  listRelations,
  updateBook,
  type Annotation,
  type Book,
  type Chapter,
  type Scene,
  type Entity,
  type EntityKind,
  type Mention,
  type Relation,
} from '../../src/db/repo';
import { Cover, PrimaryAction, Row, Section } from '../../src/ui/primitives';
import { ExportSheet } from '../../src/ui/ExportSheet';
import { byFrequency } from '../../src/cast/mentions';
import { AiRunSheet } from '../../src/ui/AiRunSheet';
import { estimateDeep, queueBookSummary, queueChapterRun } from '../../src/analysis/runs';
import { hasAnyKey } from '../../src/ai/keys';
import { useDocument } from '../../src/ui/useDocument';
import type { Estimate } from '../../src/ai/cost';
import { pickImage } from '../../src/ui/fields';
import { adoptImage } from '../../src/storage/files';
import { InlineText } from '../../src/ui/inline';
import { formatCount, formatDuration, readingMinutes } from '../../src/text/counts';
import { radius, space, usePalette } from '../../src/theme';
import { useWorkRefresh } from '../../src/work/refresh';
import { PickerSheet } from '../../src/ui/PickerSheet';
import { bookKinds, supports } from '../../src/books/kinds';

export default function BookPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const palette = usePalette();
  const [book, setBook] = useState<Book | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [characters, setCharacters] = useState<Entity[]>([]);
  const [places, setPlaces] = useState<Entity[]>([]);
  const [offset, setOffset] = useState(0);
  const [noteCount, setNoteCount] = useState(0);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [kindOpen, setKindOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryEstimate, setSummaryEstimate] = useState<Estimate | null>(null);
  const [keyed, setKeyed] = useState(false);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [text, setText] = useState('');
  const document = useDocument(id);
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [relations, setRelations] = useState<Relation[]>([]);

  const load = useCallback(() => {
    if (!id) return;
    getBook(id).then(setBook);
    listChapters(id).then(setChapters);
    listEntities(id, 'character').then(setCharacters);
    listEntities(id, 'place').then(setPlaces);
    getProgress(id).then(setOffset);
    listAnnotations(id).then((rows) => {
      setAnnotations(rows);
      setNoteCount(rows.length);
    });
    listMentions(id).then(setMentions);
    listRelations(id).then(setRelations);
    listScenes(id).then(setScenes);
  }, [id]);

  useFocusEffect(load);
  // A pass that lands while this page is open has to show up on it.
  useWorkRefresh(load);

  useEffect(() => {
    hasAnyKey().then(setKeyed);
  }, []);



  if (!book) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.bg }}>
        <ActivityIndicator />
      </View>
    );
  }

  const current = chapters.find((chapter) => offset >= chapter.start && offset < chapter.end);
  const minutes = readingMinutes(book.word_count, book.language);

  // Priced when the sheet opens, not on every visit: an estimate needs the
  // whole manuscript, and nobody asked for one by walking past.
  /**
   * One entry point for "read this book": every chapter, then the summary
   * built from what they said. Priced before it runs, because this is the one
   * action in the app that can cost real money on a 500-chapter novel.
   */
  async function openAnalyze() {
    setSummaryOpen(true);
    setSummaryEstimate(null);
    const { text: body } = await document.read();
    estimateDeep(body, chapters, book!.language).then(setSummaryEstimate).catch(() => undefined);
  }

  async function edit(field: 'title' | 'author' | 'year' | 'edition' | 'summary', value: string) {
    await updateBook(book!.id, { [field]: value.trim() || null });
    load();
  }

  async function pickCover() {
    const uri = await pickImage();
    if (!uri) return;
    await updateBook(book!.id, { cover_path: adoptImage(uri, 'cover') });
    load();
  }

  // Created unnamed: the ＋ already says what this is, and a profile called
  // "New character" is a row you have to clean up rather than one you wanted.
  async function addEntity(kind: EntityKind) {
    const entityId = await createEntity(book!.id, kind, '');
    router.push(kind === 'place' ? `/place/${entityId}` : `/entity/${entityId}`);
  }

  function confirmDelete() {
    Alert.alert(t('book.delete'), t('book.deleteConfirm'), [
      { text: t('settings.cancel'), style: 'cancel' },
      {
        text: t('book.delete'),
        style: 'destructive',
        onPress: async () => {
          await deleteBook(book!.id);
          router.back();
        },
      },
    ]);
  }

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}
    >
      <Stack.Screen options={{ title: book.title, headerBackTitle: ' ' }} />

      <View style={{ flexDirection: 'row', gap: space.lg }}>
        <Pressable onPress={pickCover}>
          <Cover title={book.title} hue={book.cover_hue} width={104} path={book.cover_path} />
          <View style={[styles.coverBadge, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <Text style={{ fontSize: 11 }}>✎</Text>
          </View>
        </Pressable>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <InlineText
            value={book.title}
            placeholder={t('book.title')}
            onCommit={(value) => edit('title', value)}
            style={{ color: palette.text, fontSize: 21, fontWeight: '700' }}
            multiline
          />
          <InlineText
            value={book.author}
            placeholder={t('book.author')}
            onCommit={(value) => edit('author', value)}
            style={{ color: palette.dim, fontSize: 15, marginTop: 2 }}
          />
          <View style={{ flexDirection: 'row', gap: space.lg, marginTop: 2 }}>
            <InlineText
              value={book.year}
              placeholder={t('book.year')}
              onCommit={(value) => edit('year', value)}
              style={{ color: palette.dim, fontSize: 14 }}
            />
            <InlineText
              value={book.edition}
              placeholder={t('book.edition')}
              onCommit={(value) => edit('edition', value)}
              style={{ color: palette.dim, fontSize: 14 }}
            />
          </View>
          <Text style={{ color: palette.dim, fontSize: 13, marginTop: space.sm }}>
            {formatCount(book.word_count, book.language)} · {chapters.length} · {formatDuration(minutes)}
          </Text>
          <Text style={{ color: palette.faint, fontSize: 12, marginTop: 2 }}>
            {t('book.importedFrom', { name: book.source_name })}
          </Text>
          <Pressable onPress={openAnalyze} hitSlop={8} style={{ paddingVertical: space.xs }}>
            <Text style={{ color: palette.accent, fontSize: 13 }}>{t('book.analyze')}</Text>
          </Pressable>
        </View>
      </View>

      <View style={{ marginTop: space.md }}>
        <InlineText
          value={book.summary}
          placeholder={t('book.summaryPlaceholder')}
          onCommit={(value) => edit('summary', value)}
          style={{ color: palette.dim, fontSize: 14, lineHeight: 20 }}
          multiline
        />
      </View>

      <PrimaryAction
        label={current ? t('book.continue', { chapter: label(current, t) }) : t('book.start')}
        onPress={() => router.push(`/reader/${book.id}`)}
        style={{ marginTop: space.lg }}
      />

      <Section
        title={t('book.chapters')}
        action={
          chapters.length ? { label: t('book.jumpShort'), onPress: () => setJumpOpen(true) } : undefined
        }
      >
        {chapters.length === 0 ? (
          <Row label={t('book.noChapters')} last />
        ) : (
          <>
            <Row
              label={t('book.chapters')}
              value={`${chapters.length}  ›`}
              onPress={() => router.push(`/book/${book.id}/structure`)}
            />
            {supports(book.kind, 'scenes') && (
              <Row
                label={t('book.scenesRow')}
                value={`${scenes.length}  ›`}
                onPress={() => router.push(`/book/${book.id}/scenes`)}
              />
            )}
          </>
        )}
        <Row
          label={t('book.notesRow')}
          value={`${noteCount}  ›`}
          onPress={() => router.push(`/book/${book.id}/notes`)}
          last
        />
      </Section>

      {supports(book.kind, 'cast') && (
        <>
          <EntitySection
            title={t('book.characters')}
            entities={byFrequency(characters, mentions)}
            onAdd={() => addEntity('character')}
            extra={{
              label: t('book.cast'),
              value: `${characters.length}  ›`,
              onPress: () => router.push(`/book/${book.id}/cast`),
            }}
          />
          <EntitySection
            title={t('book.places')}
            entities={byFrequency(places, mentions)}
            onAdd={() => addEntity('place')}
          />
        </>
      )}

      <Section title={t('book.utilities')}>
        <Row
          label={t('book.translations')}
          value="›"
          onPress={() => router.push(`/book/${book.id}/translation`)}
        />
        {supports(book.kind, 'script') && (
          <Row
            label={t('book.script')}
            value="›"
            onPress={() => router.push(`/book/${book.id}/script`)}
          />
        )}
        {supports(book.kind, 'visuals') && (
          <>
            <Row label={t('book.illustrations')} value={t('book.comingSoon')} />
            <Row label={t('book.animations')} value={t('book.comingSoon')} />
          </>
        )}
        <Row
          label={t('book.kindRow')}
          detail={t(`kind.${book.kind}Hint`)}
          value={`${t(`kind.${book.kind}`)}  ›`}
          onPress={() => setKindOpen(true)}
          last
        />
      </Section>

      <Section>
        <Row
          label={t('book.export')}
          value="›"
          onPress={async () => {
            setText((await document.read()).text);
            setExportOpen(true);
          }}
        />
        <Row label={t('book.delete')} onPress={confirmDelete} danger last />
      </Section>

      <PickerSheet
        visible={kindOpen}
        title={t('book.kindRow')}
        selectedId={book.kind}
        options={bookKinds.map((entry) => ({
          id: entry.id,
          label: t(`kind.${entry.id}`),
          detail: t(`kind.${entry.id}Hint`),
        }))}
        onPick={async (kind) => {
          setKindOpen(false);
          await updateBook(book.id, { kind });
          load();
        }}
        onClose={() => setKindOpen(false)}
      />

      <AiRunSheet
        visible={summaryOpen}
        title={t('book.analyze')}
        description={t('book.analyzeWhat', { count: chapters.length })}
        estimate={summaryEstimate}
        hasKey={keyed}
        onRun={async () => {
          await queueChapterRun(book.id, 'deep-analyze', chapters);
          await queueBookSummary(book.id);
          return t('book.analyzeQueued', { count: chapters.length });
        }}
        onClose={() => setSummaryOpen(false)}
      />

      <ExportSheet
        visible={exportOpen}
        input={
          text
            ? {
                book,
                text,
                chapters,
                annotations,
                scenes,
                // Places belong in an export of what the book turned out to be.
                cast: { entities: [...characters, ...places], mentions, relations },
              }
            : null
        }
        onClose={() => setExportOpen(false)}
      />

      <ChapterJump
        visible={jumpOpen}
        chapters={chapters}
        currentId={current?.id}
        onClose={() => setJumpOpen(false)}
        onPick={(chapter) => {
          setJumpOpen(false);
          router.push(`/reader/${book.id}?chapter=${chapter.idx}`);
        }}
      />
    </ScrollView>
  );
}

function EntitySection({ title, entities, onAdd, extra }: {
  title: string;
  entities: Entity[];
  onAdd: () => void;
  extra?: { label: string; value: string; onPress: () => void };
}) {
  const { t } = useTranslation();
  const shown = entities.slice(0, 6);
  return (
    <Section title={title} action={{ label: '＋', onPress: onAdd }}>
      {entities.length === 0 ? (
        <Row label={t('book.none')} last={!extra} />
      ) : (
        shown.map((entity, index) => (
          <Row
            key={entity.id}
            label={entity.name}
            value={entity.alias ?? '›'}
            onPress={() =>
              router.push(entity.kind === 'place' ? `/place/${entity.id}` : `/entity/${entity.id}`)
            }
            last={!extra && index === shown.length - 1}
          />
        ))
      )}
      {extra ? <Row label={extra.label} value={extra.value} onPress={extra.onPress} last /> : null}
    </Section>
  );
}

/** A 500-chapter list is a picker, not a page section. */
/** Below this a search field is more work than scrolling the list. */
const SEARCHABLE_FROM = 8;

/**
 * Half the screen, not all of it: picking a chapter is a glance at a list, and
 * a full-height page sheet made a small choice look like leaving the book. The
 * number rides in its own badge so the eye can run down the column, and each
 * row carries its brief, which is the thing that actually tells them apart.
 */
function ChapterJump({ visible, chapters, currentId, onClose, onPick }: {
  visible: boolean;
  chapters: Chapter[];
  currentId?: string;
  onClose: () => void;
  onPick: (chapter: Chapter) => void;
}) {
  const { t } = useTranslation();
  const palette = usePalette();
  const { height } = useWindowDimensions();
  const [query, setQuery] = useState('');

  const needle = query.trim().toLowerCase();
  const shown = needle
    ? chapters.filter((chapter) =>
        `${chapter.idx + 1} ${chapter.title} ${chapter.brief ?? ''}`.toLowerCase().includes(needle)
      )
    : chapters;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={[styles.jumpScrim, { backgroundColor: palette.scrim }]} onPress={onClose}>
        <Pressable
          style={[
            styles.jumpSheet,
            { height: height * 0.6, backgroundColor: palette.bg, borderColor: palette.border },
          ]}
          onPress={(event) => event.stopPropagation()}
        >
          <View style={[styles.jumpGrabber, { backgroundColor: palette.faint }]} />

          <View style={styles.jumpHead}>
            <Text style={{ color: palette.text, fontSize: 17, fontWeight: '700' }}>
              {t('book.jumpTo')}
            </Text>
            <Text style={{ color: palette.dim, fontSize: 13 }}>
              {t('book.jumpCount', { count: chapters.length })}
            </Text>
          </View>

          {chapters.length >= SEARCHABLE_FROM && (
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t('book.jumpSearch')}
              placeholderTextColor={palette.faint}
              autoCapitalize="none"
              autoCorrect={false}
              style={[
                styles.jumpSearch,
                { color: palette.text, backgroundColor: palette.surface, borderColor: palette.border },
              ]}
            />
          )}

          <ScrollView
            style={{ marginTop: space.sm }}
            contentContainerStyle={{ paddingBottom: space.xxl }}
            keyboardShouldPersistTaps="handled"
          >
            {shown.length === 0 ? (
              <Text style={{ color: palette.dim, fontSize: 14, padding: space.lg }}>
                {t('book.jumpNone')}
              </Text>
            ) : (
              shown.map((chapter) => {
                const here = chapter.id === currentId;
                return (
                  <Pressable
                    key={chapter.id}
                    onPress={() => onPick(chapter)}
                    style={({ pressed }) => [
                      styles.jumpRow,
                      { backgroundColor: pressed ? palette.surface : 'transparent' },
                    ]}
                  >
                    <View
                      style={[
                        styles.jumpBadge,
                        {
                          backgroundColor: here ? palette.accent : palette.surface,
                          borderColor: palette.border,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color: here ? palette.onAccent : palette.dim,
                          fontSize: 13,
                          fontWeight: '600',
                        }}
                      >
                        {chapter.idx + 1}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        numberOfLines={1}
                        style={{
                          color: here ? palette.accent : palette.text,
                          fontSize: 15,
                          fontWeight: here ? '600' : '400',
                        }}
                      >
                        {chapter.title.trim() || '—'}
                        {chapter.confident ? '' : '  ⚠'}
                      </Text>
                      {chapter.brief?.trim() ? (
                        <Text numberOfLines={1} style={{ color: palette.dim, fontSize: 12, marginTop: 2 }}>
                          {chapter.brief.trim()}
                        </Text>
                      ) : null}
                    </View>
                    {here ? <Text style={{ color: palette.accent, fontSize: 15 }}>●</Text> : null}
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function label(chapter: Chapter, t: (key: string) => string): string {
  return chapter.title.trim() || `${chapter.idx + 1}`;
}

const styles = StyleSheet.create({
  jumpScrim: { flex: 1, justifyContent: 'flex-end' },
  jumpSheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.lg,
  },
  jumpGrabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: space.sm,
    marginBottom: space.md,
  },
  jumpHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: space.md,
  },
  jumpSearch: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    fontSize: 15,
  },
  jumpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
  },
  jumpBadge: {
    minWidth: 30,
    height: 30,
    borderRadius: 15,
    paddingHorizontal: space.xs,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverBadge: {
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
