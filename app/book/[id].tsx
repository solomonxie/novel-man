import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, Stack, useFocusEffect, useLocalSearchParams } from '../../src/navigation/router';
import { useTranslation } from 'react-i18next';

import {
  countEntities,
  listParts,
  listScenes,
  createEntity,
  deleteBook,
  getBook,
  getProgress,
  lastReadAt,
  listAnnotations,
  listChapters,
  listEntities,
  listMentions,
  listRelations,
  rateBook,
  updateBook,
  type Annotation,
  type Book,
  type Chapter,
  type Part,
  type Scene,
  type Entity,
  type EntityKind,
  type Mention,
  type Relation,
} from '../../src/db/repo';
import { Cover, PrimaryAction, Row, Section } from '../../src/ui/primitives';
import { Action, Badge, Block, Chip, ChipRow, Empty, Fact, Hero, Item, Writable } from '../../src/ui/detail';
import { hueFrom } from '../../src/ui/fields';
import { ExportSheet } from '../../src/ui/ExportSheet';
import { byFrequency } from '../../src/cast/mentions';
import { AiRunSheet } from '../../src/ui/AiRunSheet';
import {
  estimateBookSummary,
  estimateLookup,
  estimateOutline,
  queueBookCorrection,
  queueBookLookup,
  queueBookOutline,
  queueBookSummary,
} from '../../src/analysis/runs';
import { hasAnyKey } from '../../src/ai/keys';
import { useDocument } from '../../src/ui/useDocument';
import type { Estimate } from '../../src/ai/cost';
import { pickImage } from '../../src/ui/fields';
import { adoptImage } from '../../src/storage/files';
import { InlineText } from '../../src/ui/inline';
import { radius, space, usePalette } from '../../src/theme';
import { useWorkRefresh } from '../../src/work/refresh';
import { KindList } from '../../src/ui/KindList';
import { kindOf, shows, supports, unitOf } from '../../src/books/kinds';
import { isRecord, statusOf, STATUSES } from '../../src/books/record';
import { Stars } from '../../src/ui/Stars';
import { IdentifySheet } from '../../src/ui/IdentifySheet';
import { TagsBlock } from '../../src/ui/Shelving';
import { ListPicker } from '../../src/ui/ListPicker';
import { CoverViewer } from '../../src/ui/CoverViewer';
import { CoverDrawer } from '../../src/ui/CoverDrawer';
import { isFavorite, setFavorite } from '../../src/db/shelves';
import { ESV_SOURCE } from '../../src/sources/esvBook';
import { EsvKeyRows } from '../../src/settings/EsvKey';
import { timed, trace } from '../../src/dev/trace';

/** One line of anything written on this page, and how many lines each box gets. */
const LINE = 22;
const BLURB_LINES = 3;
const IMPRESSION_LINES = 3;

export default function BookPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const palette = usePalette();
  const [book, setBook] = useState<Book | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [characters, setCharacters] = useState<Entity[]>([]);
  const [places, setPlaces] = useState<Entity[]>([]);
  const [terms, setTerms] = useState<Entity[]>([]);
  const [offset, setOffset] = useState(0);
  const [readAt, setReadAt] = useState<number | null>(null);
  const [noteCount, setNoteCount] = useState(0);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [parts, setParts] = useState<Part[]>([]);
  const [kindOpen, setKindOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryEstimate, setSummaryEstimate] = useState<Estimate | null>(null);
  /** The two passes a book with no words can have — see `analysis/runs`. */
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [correctOpen, setCorrectOpen] = useState(false);
  const [esvOpen, setEsvOpen] = useState(false);
  const [drawOpen, setDrawOpen] = useState(false);
  const [identifyOpen, setIdentifyOpen] = useState(false);
  const [listsOpen, setListsOpen] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);
  const [askEstimate, setAskEstimate] = useState<Estimate | null>(null);
  const [favorite, setFavorited] = useState(false);
  /** The blurb is three lines until somebody asks for the rest of it. */
  const [blurbOpen, setBlurbOpen] = useState(false);
  const [summaryLines, setSummaryLines] = useState(0);
  const [writingSummary, setWritingSummary] = useState(false);
  const [reviewDraft, setReviewDraft] = useState('');
  const reviewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [summaryDraft, setSummaryDraft] = useState('');
  /** The page scrolls itself to the stars when the count of them is tapped. */
  const page = useRef<ScrollView>(null);
  const ratingY = useRef(0);
  const notesY = useRef(0);
  const scenesY = useRef(0);
  const [openScenes, setOpenScenes] = useState<string | null>(null);
  /** One chapter's notes at a time: a book's worth at once is a page nobody reads. */
  const [openNotes, setOpenNotes] = useState<string | null>(null);
  const [keyed, setKeyed] = useState(false);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [text, setText] = useState('');
  const document = useDocument(id);
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [relations, setRelations] = useState<Relation[]>([]);

  const load = useCallback(() => {
    if (!id) return;
    trace('load fired');
    timed('getBook', getBook(id)).then((found) => {
      setBook(found);
      // Only while nothing is being typed: a reload mid-sentence must not
      // replace the sentence with what was last saved.
      if (found && !reviewTimer.current) setReviewDraft(found.review ?? '');
    });
    timed('listChapters', listChapters(id)).then(setChapters);
    timed('characters', listEntities(id, 'character')).then(setCharacters);
    timed('places', listEntities(id, 'place')).then(setPlaces);
    timed('terms', listEntities(id, 'term')).then(setTerms);
    timed('getProgress', getProgress(id)).then(setOffset);
    timed('lastReadAt', lastReadAt(id)).then(setReadAt);
    timed('listAnnotations', listAnnotations(id)).then((rows) => {
      setAnnotations(rows);
      setNoteCount(rows.length);
    });
    timed('listMentions', listMentions(id)).then(setMentions);
    timed('listRelations', listRelations(id)).then(setRelations);
    timed('isFavorite', isFavorite(id)).then(setFavorited).catch(() => undefined);
    timed('listScenes', listScenes(id)).then(setScenes);
    timed('listParts', listParts(id)).then(setParts);
  }, [id]);

  useFocusEffect(load);
  // A pass that lands while this page is open has to show up on it.
  useWorkRefresh(load);

  useEffect(() => {
    hasAnyKey().then(setKeyed);
  }, []);

  /**
   * The review, saved without being told to. A write per keystroke would be a
   * row rewritten thirty times a sentence — and every one of those is a change
   * the backup layer notices — so it waits for the typing to stop.
   */
  function writeReview(next: string) {
    setReviewDraft(next);
    if (reviewTimer.current) clearTimeout(reviewTimer.current);
    reviewTimer.current = setTimeout(() => {
      if (id) void rateBook(id, { review: next });
    }, 600);
  }

  /** One tap, and the shelf it lands on is the one that was always there. */
  async function toggleFavorite() {
    if (!id) return;
    await setFavorite(id, !favorite);
    setFavorited(!favorite);
  }



  /**
   * Notes under the chapter they were made in, in reading order — which is
   * how anybody looks for one. A note that quotes nothing and names no
   * chapter is about the book itself, so it goes first, before chapter one.
   */
  const noteGroups = useMemo(() => {
    const byChapter = new Map<string, { key: string; title: string; notes: Annotation[] }>();
    for (const note of annotations) {
      const chapter = note.chapter_id
        ? chapters.find((entry) => entry.id === note.chapter_id)
        : note.standalone
          ? undefined
          : chapters.find((entry) => note.start >= entry.start && note.start < entry.end);
      const key = chapter?.id ?? 'book';
      const title = chapter
        ? `${chapter.idx + 1}. ${chapter.title.trim() || t('structure.untitled')}`
        : t('book.notesAboutBook');
      if (!byChapter.has(key)) byChapter.set(key, { key, title, notes: [] });
      byChapter.get(key)!.notes.push(note);
    }
    const order = new Map(chapters.map((chapter, at) => [chapter.id, at]));
    return [...byChapter.values()].sort(
      (a, b) => (order.get(a.key) ?? -1) - (order.get(b.key) ?? -1)
    );
  }, [annotations, chapters, t]);

  /** The same fold as the notes: a chapter, and what it was split into. */
  const sceneGroups = useMemo(() => {
    const byChapter = new Map<string, { key: string; title: string; scenes: Scene[] }>();
    for (const scene of scenes) {
      const chapter = chapters.find((entry) => entry.id === scene.chapter_id);
      if (!chapter) continue;
      const key = chapter.id;
      if (!byChapter.has(key)) {
        byChapter.set(key, {
          key,
          title: `${chapter.idx + 1}. ${chapter.title.trim() || t('structure.untitled')}`,
          scenes: [],
        });
      }
      byChapter.get(key)!.scenes.push(scene);
    }
    const order = new Map(chapters.map((chapter, at) => [chapter.id, at]));
    return [...byChapter.values()].sort(
      (a, b) => (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0)
    );
  }, [chapters, scenes, t]);

  trace(`render book=${book ? 'yes' : 'no'} chapters=${chapters.length}`);

  if (!book) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.bg }}>
        <ActivityIndicator />
      </View>
    );
  }

  /**
   * Where the reading got to. What is saved depends on what there is to save:
   * a book this app holds keeps a character offset, and one whose text is
   * fetched a chapter at a time keeps the chapter — its chapters all begin and
   * end at zero, so an offset could never point into one. Comparing offsets
   * against those zeroes is why a bible always said "Start reading".
   *
   * And a row written when the book was added is not a reading: the state is
   * only a resumption once it has been touched after the book itself.
   */
  const started = readAt !== null && readAt > book.created_at + 1000;
  const current = !started
    ? undefined
    : book.text_source
      ? chapters.find((chapter) => chapter.idx === offset)
      : chapters.find((chapter) => offset >= chapter.start && offset < chapter.end);
  // A book with no words behind it: no reader to open, no text to export, and
  // everything the app knows about it either typed or asked for. See
  // `books/record`.
  const record = isRecord(book);

  /**
   * The counts in the head, as one list rather than an arrangement per kind of
   * book. Every book is asked the same questions in the same order and answers
   * the ones it can: a record has no length, a paper has no parts, a manual has
   * no scenes. Four fit across, so the first four that apply are the ones shown
   * — which is what keeps a bible, a novel and a book somebody typed the name
   * of looking like the same page.
   */
  const scrollTo = (where: { current: number }) => () =>
    page.current?.scrollTo({ y: Math.max(0, where.current - space.lg), animated: true });

  type HeadFact = { value: string | number; label: string; onPress?: () => void };

  /**
   * Four boxes, always, and the same four questions of every book: what it is
   * divided into, what it is made of, what you wrote in it, and what you
   * thought of it. The rating is the one on the right whatever happens.
   *
   * A book with parts spends its third box on them. One without has a box
   * going spare, so it goes to whatever that book actually has — scenes for a
   * novel, people for a history, terms for a manual — which is how four fixed
   * positions still say something on every kind of book.
   */
  const spare: HeadFact | null =
    !record && supports(book.kind, 'scenes')
      ? { value: scenes.length, label: t('units.unit_scenes'), onPress: scrollTo(scenesY) }
      : supports(book.kind, 'cast')
        ? {
            value: characters.length,
            label: t('units.unit_cast'),
            onPress: () => router.push(`/book/${book.id}/cast`),
          }
        : supports(book.kind, 'terms')
          ? {
              value: terms.length,
              label: t('book.terms').toLowerCase(),
              onPress: () => router.push(`/book/${book.id}/terms`),
            }
          : null;

  const facts: HeadFact[] = [
    ...([
      parts.length > 0 && {
        value: parts.length,
        label: t(`units.unit_${kindOf(book.kind).part ?? 'volume'}s`),
        onPress: () => router.push(`/book/${book.id}/parts`),
      },
      {
        value: chapters.length,
        label: t(`units.unit_${unitOf(book.kind)}s`),
        onPress: () => router.push(`/book/${book.id}/structure`),
      },
      { value: noteCount, label: t('units.unit_notes'), onPress: scrollTo(notesY) },
      parts.length === 0 && spare,
    ] as (HeadFact | false | null)[])
      .filter((fact): fact is HeadFact => Boolean(fact))
      .slice(0, 3),
    {
      value: book.stars ? '★'.repeat(book.stars) : '—',
      label: t('book.ratingShort'),
      onPress: scrollTo(ratingY),
    },
  ];

  /**
   * The blurb, written by a model. Two passes behind one ✨, because from the
   * reader's side it is one question: once the chapters have briefs it is
   * built from those and costs a single small request; before that there is
   * nothing to build from, so the title is asked instead. Neither of them
   * reads the book — see `docs/design/DESIGN.md`.
   */
  const briefed = chapters.some((chapter) => chapter.brief?.trim());

  function openSummary() {
    setSummaryOpen(true);
    setSummaryEstimate(null);
    const priced = briefed
      ? estimateBookSummary(book!, chapters, '')
      : estimateLookup(book!);
    priced.then(setSummaryEstimate).catch(() => undefined);
  }

  /** The details as they should read. Priced like a lookup: it is the same ask. */
  function openCorrect() {
    setCorrectOpen(true);
    setAskEstimate(null);
    estimateLookup(book!).then(setAskEstimate).catch(() => undefined);
  }

  /**
   * Its contents page, likewise. Asked once and replacing what is there, so a
   * list somebody has already corrected is not overwritten without being told.
   */
  function openOutline() {
    if (!chapters.length) return startOutline();
    Alert.alert(t('book.outlineRow'), t('book.outlineReplace', { count: chapters.length }), [
      { text: t('settings.cancel'), style: 'cancel' },
      { text: t('book.outlineAgain'), onPress: startOutline },
    ]);
  }

  function startOutline() {
    setOutlineOpen(true);
    setAskEstimate(null);
    estimateOutline(book!).then(setAskEstimate).catch(() => undefined);
  }

  async function edit(
    field: 'title' | 'author' | 'year' | 'edition' | 'summary' | 'impressions' | 'isbn',
    value: string
  ) {
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
  /** Every kind of thing a book names has a page; which one is the kind. */
  const PAGES: Record<EntityKind, string> = {
    character: 'entity',
    place: 'place',
    term: 'term',
  };

  async function addEntity(kind: EntityKind) {
    const entityId = await createEntity(book!.id, kind, '');
    router.push(`/${PAGES[kind]}/${entityId}`);
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
      ref={page}
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}
    >
      <Stack.Screen options={{ title: book.title, headerBackTitle: ' ' }} />

      <Hero
        // Nothing sits on the cover any more. It is a picture, so tapping it
        // shows the picture; what you can *do* to it is written underneath in
        // words, where a 24px glyph was a guess either way.
        avatar={
          <View style={{ alignItems: 'center', gap: space.xs }}>
            <Pressable onPress={() => setCoverOpen(true)}>
              <Cover title={book.title} hue={book.cover_hue} width={92} path={book.cover_path} />
            </Pressable>
            {/* One word, and it is always the one that applies: a cover is
                taken off, and then a cover is added. Two links side by side
                asked the reader to pick between them every time. */}
            <Text
              onPress={async () => {
                if (!book.cover_path) return pickCover();
                await updateBook(book.id, { cover_path: null });
                load();
              }}
              suppressHighlighting
              style={{ color: book.cover_path ? palette.dim : palette.accent, fontSize: 11 }}
            >
              {t(book.cover_path ? 'book.removePhoto' : 'book.addPhoto')}
            </Text>
          </View>
        }
        facts={facts.map((fact) => (
          <Fact key={fact.label} value={fact.value} label={fact.label} onPress={fact.onPress} />
        ))}
        // One row for every book: where the reading is, where the chapters
        // are, and the two glyphs. A record has no reading, so its row starts
        // at the chapters — which is also where its contents are asked for,
        // so there is no button here for that either.
        actions={
          <View style={{ flex: 1, gap: space.sm }}>
            {/* A record has nothing to read, so it has no first row at all. */}
            {record ? null : (
              <View style={{ flexDirection: 'row' }}>
                <Action
                  // Where it resumes, said on the button rather than in a line
                  // under it: a note that only ever repeats the button is a
                  // line of type doing nothing.
                  label={
                    current
                      ? `${t('book.continue')} · ${shorten(label(current, t))}`
                      : t('book.start')
                  }
                  tone="loud"
                  onPress={() =>
                    router.push(current ? `/chapter/${current.id}` : `/reader/${book.id}`)
                  }
                />
              </View>
            )}
            {/* The chapters have a tile of their own under Inside; a second
                door to them in the hero was the same door twice. */}
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              {/* Named, not just drawn. Three share the row, so each label is
                  one short word — a glyph alone is a guess, and a guess on the
                  button that rewrites the title is an expensive one. */}
              <Action
                label={`${favorite ? '♥' : '♡'}  ${t('book.favorite')}`}
                onPress={toggleFavorite}
              />
              <Action label={`🔍  ${t('identify.title')}`} onPress={() => setIdentifyOpen(true)} />
              {/* A plus inside a circle: "put this into something". The bars
                  it replaces drew a list, which is where it *goes* rather than
                  what the button does — and lists are read from the shelf. */}
              <Action label="⊕" onPress={() => setListsOpen(true)} compact />
            </View>
          </View>
        }
      >
        <InlineText
          value={book.title}
          placeholder={t('book.title')}
          onCommit={(value) => edit('title', value)}
          style={{ color: palette.text, fontSize: 22, fontWeight: '700' }}
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
        {/* Rarely read and rarely typed, but it is the only field here that
            names one printing — which is what makes a catalog answerable. */}
        <InlineText
          value={book.isbn}
          placeholder={t('book.isbn')}
          onCommit={(value) => edit('isbn', value)}
          style={{ color: palette.faint, fontSize: 13, marginTop: 2 }}
        />
        <Text style={{ color: palette.faint, fontSize: 12, marginTop: space.xs }}>
          {t(record ? 'book.recordedFrom' : 'book.importedFrom', { name: book.source_name })}
        </Text>
      </Hero>

      {/* What the book is, in its own voice rather than the reader's — italic
          and grey for that reason, and three lines tall, because a blurb that
          pushes everything the reader wrote off the screen has the page the
          wrong way round. */}
      <View style={{ marginTop: space.lg }}>
        <Writable empty={!book.summary?.trim()}>
          {/* Read, not edited by touching it. A blurb is the one thing on this
              page nobody writes by hand, so a stray tap opening a keyboard
              over it was all cost and no use — it is edited from a button,
              and only once it is open far enough to see what you are editing. */}
          {writingSummary ? (
            <TextInput
              value={summaryDraft}
              onChangeText={setSummaryDraft}
              placeholder={t('book.summaryPlaceholder')}
              placeholderTextColor={palette.faint}
              multiline
              autoFocus
              style={{
                color: palette.dim,
                fontSize: 15,
                lineHeight: LINE,
                fontStyle: 'italic',
                padding: 0,
              }}
            />
          ) : (
            <Text
              // Touching it opens it. It still does not edit: that is the one
              // thing a stray tap must not start.
              onPress={() => setBlurbOpen((was) => !was)}
              suppressHighlighting
              numberOfLines={blurbOpen ? undefined : BLURB_LINES}
              onTextLayout={(event) => setSummaryLines(event.nativeEvent.lines.length)}
              style={{
                color: book.summary?.trim() ? palette.dim : palette.faint,
                fontSize: 15,
                lineHeight: LINE,
                fontStyle: 'italic',
              }}
            >
              {book.summary?.trim() || t('book.summaryPlaceholder')}
            </Text>
          )}

          {/* More, then Edit — and the ✨, which is the other way a blurb gets
              written: from the briefs where there are any, from the title
              where there are none. See `openSummary`. */}
          <View style={styles.summaryFoot}>
            <View style={{ flexDirection: 'row', gap: space.lg }}>
              {summaryLines >= BLURB_LINES && !writingSummary ? (
                <Text
                  onPress={() => setBlurbOpen((was) => !was)}
                  suppressHighlighting
                  style={[styles.link, { color: palette.accent }]}
                >
                  {t(blurbOpen ? 'book.less' : 'book.more')}
                </Text>
              ) : null}
              {writingSummary ? (
                <Text
                  onPress={async () => {
                    setWritingSummary(false);
                    await edit('summary', summaryDraft);
                  }}
                  suppressHighlighting
                  style={[styles.link, { color: palette.accent }]}
                >
                  {t('settings.save')}
                </Text>
              ) : blurbOpen || !book.summary?.trim() ? (
                <Text
                  onPress={() => {
                    setSummaryDraft(book.summary ?? '');
                    setWritingSummary(true);
                  }}
                  suppressHighlighting
                  style={[styles.link, { color: palette.accent }]}
                >
                  {t('book.editSummary')}
                </Text>
              ) : null}
            </View>
            <Pressable onPress={openSummary} hitSlop={10}>
              <Text style={{ color: palette.accent, fontSize: 15 }}>✨</Text>
            </Pressable>
          </View>
        </Writable>
      </View>

      {/* The reader's own overview, and the first thing on the page that is
          theirs. Above the stars because it is what they would actually say
          about the book — the rating is the shorthand for it. */}
      <Block title={t('book.impressions')}>
        <Writable empty={!book.impressions?.trim()}>
          <InlineText
            value={book.impressions}
            placeholder={t('book.impressionsPlaceholder')}
            onCommit={(value) => edit('impressions', value)}
            style={{
              color: palette.text,
              fontSize: 15,
              lineHeight: LINE,
              minHeight: LINE * IMPRESSION_LINES,
            }}
            multiline
          />
        </Writable>
      </Block>

      {supports(book.kind, 'cast') && (
        <>
          <EntitySection
            title={t('book.people')}
            entities={byFrequency(characters, mentions)}
            onAdd={() => addEntity('character')}
            extra={{
              label: t('book.peopleAll'),
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

      {/* Neither people nor places: what the book names and keeps using. */}
      {supports(book.kind, 'terms') && (
        <EntitySection
          title={t('book.terms')}
          entities={byFrequency(terms, mentions)}
          onAdd={() => addEntity('term')}
          extra={{
            label: t('book.termsAll'),
            value: `${terms.length}  ›`,
            onPress: () => router.push(`/book/${book.id}/terms`),
          }}
        />
      )}

      {/* What the reader made of it. Every book gets this, not only the ones
          with no words: a shelf is kept for what you thought of what is on it,
          and a rating that only records books read on paper is half a shelf. */}
      <View onLayout={(event) => { ratingY.current = event.nativeEvent.layout.y; }}>
      <Block title={t('book.rating')}>
        {/* Nothing folded. Three questions, all of them one tap or one line:
            how many stars, where you are in it, and what you thought. The
            review saves itself — a Save button on a field nobody leaves open
            is a button that gets forgotten with the text still in it. */}
        <Section flush>
          <View style={[styles.rating, { borderColor: palette.border }]}>
            <Stars
              value={book.stars}
              size={30}
              onSet={async (stars) => {
                await rateBook(book.id, { stars });
                load();
              }}
            />
            <Text style={{ color: palette.faint, fontSize: 12 }}>
              {book.stars
                ? t('book.ratedOn', {
                    date: new Date(book.rated_at ?? book.created_at).toLocaleDateString(),
                  })
                : t('book.notRated')}
            </Text>
          </View>

          <View style={styles.stands}>
            <Text style={{ color: palette.dim, fontSize: 13 }}>{t('book.statusRow')}</Text>
            <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.sm }}>
              {STATUSES.map((entry) => {
                const on = statusOf(book.status) === entry;
                return (
                  <Pressable
                    key={entry}
                    // Tapping the one you are on clears it, the same way a star does.
                    onPress={async () => {
                      await updateBook(book.id, { status: on ? null : entry });
                      load();
                    }}
                    style={({ pressed }) => [
                      styles.stand,
                      {
                        backgroundColor: on ? palette.accent : palette.soft,
                        opacity: pressed ? 0.75 : 1,
                      },
                    ]}
                  >
                    <Text
                      numberOfLines={1}
                      style={{
                        color: on ? palette.onAccent : palette.accent,
                        fontSize: 14,
                        fontWeight: '600',
                      }}
                    >
                      {t(`status.${entry}`)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={{ paddingHorizontal: space.lg, paddingVertical: space.md }}>
            <TextInput
              value={reviewDraft}
              onChangeText={writeReview}
              placeholder={t('book.reviewPlaceholder')}
              placeholderTextColor={palette.faint}
              multiline
              style={{
                color: palette.text,
                fontSize: 15,
                lineHeight: LINE,
                minHeight: LINE * IMPRESSION_LINES,
                padding: 0,
              }}
            />
          </View>
        </Section>
      </Block>
      </View>

      {/* Everything written in this book, folded into the chapters it was
          written in. The page behind the heading is where a note is edited,
          searched or deleted; this is for finding one. */}
      <View onLayout={(event) => { notesY.current = event.nativeEvent.layout.y; }}>
        <Block
          title={t('book.notes')}
          count={noteCount || undefined}
          onOpen={() => router.push(`/book/${book.id}/notes`)}
        >
          {noteGroups.length === 0 ? (
            <Empty text={t(record ? 'notes.emptyRecord' : 'notes.empty')} />
          ) : (
            <Section flush>
              {noteGroups.map((group, index) => (
                <Fragment key={group.key}>
                  <Row
                    label={group.title}
                    value={`${group.notes.length}  ${openNotes === group.key ? '⌃' : '⌄'}`}
                    onPress={() => setOpenNotes((was) => (was === group.key ? null : group.key))}
                    last={index === noteGroups.length - 1 && openNotes !== group.key}
                  />
                  {openNotes === group.key
                    ? group.notes.map((note, at) => (
                        <Item
                          key={note.id}
                          title={note.note?.trim() || note.quote}
                          detail={note.note?.trim() ? note.quote || undefined : undefined}
                          quiet={!note.note?.trim()}
                          onPress={() => router.push(`/book/${book.id}/notes`)}
                          last={at === group.notes.length - 1}
                        />
                      ))
                    : null}
                </Fragment>
              ))}
            </Section>
          )}
        </Block>
      </View>

      {/* What the chapters were cut into, folded the same way the notes are. */}
      {supports(book.kind, 'scenes') && !record ? (
        <View onLayout={(event) => { scenesY.current = event.nativeEvent.layout.y; }}>
          <Block
            title={t('book.scenes')}
            count={scenes.length || undefined}
            onOpen={() => router.push(`/book/${book.id}/scenes`)}
          >
            {sceneGroups.length === 0 ? (
              <Empty text={t('book.noScenes')} />
            ) : (
              <Section flush>
                {sceneGroups.map((group, index) => (
                  <Fragment key={group.key}>
                    <Row
                      label={group.title}
                      value={`${group.scenes.length}  ${openScenes === group.key ? '⌃' : '⌄'}`}
                      onPress={() =>
                        setOpenScenes((was) => (was === group.key ? null : group.key))
                      }
                      last={index === sceneGroups.length - 1 && openScenes !== group.key}
                    />
                    {openScenes === group.key
                      ? group.scenes.map((scene, at) => (
                          <Item
                            key={scene.id}
                            badge={<Badge n={at + 1} />}
                            title={scene.title?.trim() || t('book.sceneUnnamed', { n: at + 1 })}
                            detail={scene.summary?.trim() || undefined}
                            onPress={() => router.push(`/scene/${scene.id}`)}
                            last={at === group.scenes.length - 1}
                          />
                        ))
                      : null}
                  </Fragment>
                ))}
              </Section>
            )}
          </Block>
        </View>
      ) : null}

      {/* Tags stay on the page because they are said *about* the book. Which
          lists it is in is not — that is read from the shelf, so from here it
          is only the ☰ above. */}
      <TagsBlock bookId={book.id} />

      <Block title={t('book.utilities')}>
        <Section flush>
        {record ? (
          <Row
            label={t('book.outlineRow')}
            detail={t('book.outlineHint')}
            value={chapters.length ? t('book.outlineAgain') : t('book.outlineAsk')}
            onPress={openOutline}
          />
        ) : null}
        <Row
          label={t('book.kindRow')}
          detail={t(`kind.${book.kind}Hint`)}
          value={`${t(`kind.${book.kind}`)}  ${kindOpen ? '⌃' : '⌄'}`}
          onPress={() => setKindOpen((was) => !was)}
          last={!kindOpen}
        />
        {kindOpen ? (
          <KindList
            selectedId={book.kind}
            onPick={async (picked) => {
              setKindOpen(false);
              await updateBook(book.id, { kind: picked });
              load();
            }}
          />
        ) : null}
        </Section>
      </Block>

      <Section>
        {/* Nothing to export from a book whose words are not here — its notes
            leave with a backup, which is where they were always going. */}
        {record ? null : (
          <Row
            label={t('book.export')}
            value="›"
            onPress={async () => {
              setText((await document.read()).text);
              setExportOpen(true);
            }}
          />
        )}
        <Row label={t('book.delete')} onPress={confirmDelete} danger last />
      </Section>

      <AiRunSheet
        visible={summaryOpen}
        title={t('book.summarize')}
        description={t(briefed ? 'book.summarizeWhat' : 'book.lookUpWhat')}
        estimate={summaryEstimate}
        hasKey={keyed}
        onRun={async () => {
          if (briefed) await queueBookSummary(book.id);
          else await queueBookLookup(book.id, book.title);
          return t('book.summarizeQueued');
        }}
        onClose={() => setSummaryOpen(false)}
      />

      <CoverViewer
        visible={coverOpen}
        title={book.title}
        hue={book.cover_hue}
        path={book.cover_path}
        onClose={() => setCoverOpen(false)}
      />

      <ListPicker
        visible={listsOpen}
        bookId={book.id}
        onClose={() => setListsOpen(false)}
        onChanged={() => isFavorite(book.id).then(setFavorited).catch(() => undefined)}
      />

      <IdentifySheet
        visible={identifyOpen}
        book={book}
        onClose={() => setIdentifyOpen(false)}
        onFilled={load}
      />

      <AiRunSheet
        visible={correctOpen}
        title={t('book.correct')}
        description={t('book.correctWhat')}
        estimate={askEstimate}
        hasKey={keyed}
        onRun={async () => {
          await queueBookCorrection(book.id, book.title);
          return t('book.correctQueued');
        }}
        onClose={() => setCorrectOpen(false)}
      />

      <AiRunSheet
        visible={outlineOpen}
        title={t('book.outlineRow')}
        description={t('book.outlineWhat')}
        estimate={askEstimate}
        hasKey={keyed}
        onRun={async () => {
          await queueBookOutline(book.id, book.title);
          return t('book.outlineQueued');
        }}
        onClose={() => setOutlineOpen(false)}
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
  // Sideways, because a cast is a set of faces to recognize rather than a list
  // to read down — and because six names down the page pushed everything else
  // below the fold.
  const shown = entities.slice(0, 10);
  return (
    <Block
      title={title}
      count={entities.length || undefined}
      onOpen={extra?.onPress}
      action={{ label: '＋', onPress: onAdd }}
    >
      {entities.length === 0 ? (
        <Empty text={t('book.none')} action={{ label: t('book.addOne'), onPress: onAdd }} />
      ) : (
        <ChipRow>
          {shown.map((entity) => (
            <Chip
              key={entity.id}
              // The name alone: a row of chips is scanned for who is in the
              // book, and a second line under some of them and not others
              // makes the row ragged for information nobody came here for.
              label={entity.name}
              hue={hueFrom(entity.name)}
              onPress={() =>
                router.push(entity.kind === 'place' ? `/place/${entity.id}` : `/entity/${entity.id}`)
              }
            />
          ))}
        </ChipRow>
      )}
    </Block>
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
function label(chapter: Chapter, t: (key: string) => string): string {
  return chapter.title.trim() || `${chapter.idx + 1}`;
}

/** A button is one line wide, and some chapters are named a whole sentence. */
const CAP = 32;

function shorten(text: string): string {
  return text.length > CAP ? `${text.slice(0, CAP - 1).trimEnd()}…` : text;
}

const styles = StyleSheet.create({
  stands: { paddingHorizontal: space.lg, paddingVertical: space.md },
  stand: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: space.sm + 2,
    borderRadius: radius.md,
  },
  rating: {
    alignItems: 'center',
    gap: space.xs,
    paddingVertical: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  link: { fontSize: 13, fontWeight: '600' },
  summaryFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.xs,
  },
});
