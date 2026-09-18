import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type GestureResponderEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as Clipboard from 'expo-clipboard';

import {
  addAnnotation,
  getBook,
  getDocumentText,
  getProgress,
  listAnnotations,
  listChapters,
  listVerses,
  removeAnnotation,
  saveProgress,
  updateAnnotation,
  type Annotation,
  type Book,
  type Chapter,
  type Verse,
} from '../../src/db/repo';
import { annotationAt, layoutChapter } from '../../src/reader/model';
import { imageIn } from '../../src/reader/images';
import { sentenceAtLine, type Line } from '../../src/reader/lines';
import { codeBlockIn, runsIn } from '../../src/reader/rich';
import { ReaderImage } from '../../src/ui/ReaderImage';
import { supports } from '../../src/books/kinds';
import { quoteWithVerses } from '../../src/scripture/reference';
import { fingerprint, repairAll } from '../../src/reader/anchor';
import type { Span } from '../../src/text/segment';
import { scriptOf } from '../../src/text/language';
import { readingThemes, space, useScheme, type HighlightColor } from '../../src/theme';
import {
  defaultSettings,
  lineHeightFor,
  loadSettings,
  saveSettings,
  type ReadingSettings,
} from '../../src/reader/settings';
import { ReadingSettingsSheet } from '../../src/ui/ReadingSettingsSheet';
import { ActionMenu, type MenuAction } from '../../src/ui/ActionMenu';
import { SentenceMenu } from '../../src/ui/SentenceMenu';
import { NoteSheet } from '../../src/ui/NoteSheet';
import { Scrubber } from '../../src/ui/Scrubber';
import { PickerSheet } from '../../src/ui/PickerSheet';
import { ChapterSheet } from '../../src/ui/ChapterSheet';
import { shareQuoteCard, shareQuoteText } from '../../src/share/quote';
import { listTargets, listUnits } from '../../src/db/translation';
import { queueChapterRun } from '../../src/analysis/runs';

const CHROME_IDLE_MS = 2800;
/** Apple and Android both put the floor at 44pt / 48dp. */
const TOUCH = 44;

export default function Reader() {
  const { id, chapter: chapterParam, at } = useLocalSearchParams<{
    id: string;
    chapter?: string;
    at?: string;
  }>();
  const { t } = useTranslation();
  const { height, width } = useWindowDimensions();

  const [book, setBook] = useState<Book | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [text, setText] = useState('');
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [index, setIndex] = useState(0);
  const scheme = useScheme();
  /**
   * Seeded, not defaulted: `loadSettings` is a round trip to storage, and
   * rendering Paper for that one frame is a white flash in a dark room.
   */
  const [settings, setSettings] = useState<ReadingSettings>(() => ({
    ...defaultSettings,
    theme: scheme === 'dark' ? 'night' : 'paper',
  }));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [flashAt, setFlashAt] = useState<number | null>(null);
  /**
   * A selection is a pair, not a sentence: long-press anchors it, and tapping
   * another sentence moves the far end. A plain tap used to open the menu
   * outright, which fires on the touch-up that starts a scroll — the reader
   * kept selecting a line when it was meant to be turning the page.
   */
  const [selection, setSelection] = useState<{ anchor: Span; focus: Span; y: number } | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [noteFor, setNoteFor] = useState<Span | null>(null);
  const [shareFor, setShareFor] = useState<Span | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [targets, setTargets] = useState<string[]>([]);
  const [target, setTarget] = useState<string | null>(null);
  const [translated, setTranslated] = useState<Map<number, string>>(new Map());
  const [verses, setVerses] = useState<Verse[]>([]);
  /**
   * Long-press still works, but it misses on the white between sentences and
   * on a short word. The button is the way in that never misses.
   */
  const [selecting, setSelecting] = useState(false);

  /** Where each paragraph's lines ended up, so a tap that missed the words
   *  can still be answered by the line it landed on. */
  const linesOf = useRef(new Map<number, Line[]>());
  const scrollRef = useRef<ScrollView>(null);
  const viewport = useRef({ content: 0, layout: 0 });
  const pendingScroll = useRef<number | null>(null);
  const chrome = useRef(new Animated.Value(1)).current;
  const chromeShown = useRef(true);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setChrome = useCallback(
    (visible: boolean) => {
      chromeShown.current = visible;
      Animated.timing(chrome, { toValue: visible ? 1 : 0, duration: 180, useNativeDriver: true }).start();
      if (idleTimer.current) clearTimeout(idleTimer.current);
      // Chrome earns its place only while you're using it; reading gets the page.
      if (visible) idleTimer.current = setTimeout(() => setChrome(false), CHROME_IDLE_MS);
    },
    [chrome]
  );

  useEffect(() => {
    setChrome(true);
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [setChrome]);

  useEffect(() => {
    loadSettings(scheme).then(setSettings);
    // Deliberately once: re-reading on a scheme change would throw away the
    // theme picked for this session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Three loads, not one. The manuscript is megabytes and the annotations have
   * to be walked against all of it — waiting for both before drawing anything
   * left the page, and the bar at the bottom of it, blank for seconds on a
   * bible. What the chrome needs is three small queries, so it goes first.
   */
  useEffect(() => {
    if (!id) return;
    (async () => {
      const [loadedBook, loadedChapters, saved] = await Promise.all([
        getBook(id),
        listChapters(id),
        getProgress(id),
      ]);
      setBook(loadedBook);
      setChapters(loadedChapters);
      setOffset(saved);

      const target = at ? Number(at) : null;
      const requested = chapterParam ? Number(chapterParam) : null;
      const resumed = loadedChapters.findIndex((c) => saved >= c.start && saved < c.end);
      // A search result knows an offset but not a chapter; find it rather than
      // dropping the reader wherever they last were.
      const holding = target === null
        ? -1
        : loadedChapters.findIndex((c) => target >= c.start && target < c.end);
      setIndex(requested ?? (holding >= 0 ? holding : resumed >= 0 ? resumed : 0));

      if (target !== null) {
        const landing = loadedChapters[requested ?? (holding >= 0 ? holding : 0)];
        if (landing) {
          pendingScroll.current =
            (target - landing.start) / Math.max(1, landing.end - landing.start);
        }
        setFlashAt(target);
      }
    })();
  }, [id, chapterParam, at]);

  // The mark on the verse you were sent to only counts once it can be seen,
  // so it fades from when the words arrive rather than from when we asked.
  useEffect(() => {
    if (flashAt === null || !text) return;
    const timer = setTimeout(() => setFlashAt(null), 1600);
    return () => clearTimeout(timer);
  }, [flashAt, text]);

  /** The words themselves, behind the chrome that is already on screen. */
  useEffect(() => {
    if (!id) return;
    getDocumentText(id).then(setText);
  }, [id]);

  // Offsets drift when a book is re-split; the words are what find them. This
  // needs the whole text, so it waits for it rather than holding it up.
  useEffect(() => {
    if (!id || !text) return;
    listAnnotations(id).then((rows) => {
      const { placed } = repairAll(text, rows);
      setAnnotations(placed);
      for (const repaired of placed) {
        const before = rows.find((entry) => entry.id === repaired.id);
        if (before && (before.start !== repaired.start || before.end !== repaired.end)) {
          void updateAnnotation(repaired.id, { start: repaired.start, end: repaired.end });
        }
      }
    });
  }, [id, text]);

  useEffect(() => {
    if (!id) return;
    listTargets(id).then((rows) => {
      const codes = rows.filter((row) => row.done > 0).map((row) => row.target);
      setTargets(codes);
      setTarget((was) => was ?? codes[0] ?? null);
    });
  }, [id]);

  const chapter = chapters[index];
  const language = book?.language ?? 'en';

  // Only the chapter on screen is loaded: a whole translated novel is a second
  // copy of the book in memory, for no benefit past the visible page.
  useEffect(() => {
    if (!id || !target || settings.bilingual === 'off' || !chapter) {
      setTranslated(new Map());
      return;
    }
    listUnits(id, target, chapter.idx).then((rows) => {
      setTranslated(new Map(rows.map((row) => [row.start, row.edited ?? row.machine ?? ''])));
    });
  }, [id, target, chapter, settings.bilingual]);

  // A bible addresses itself by verse, so the numbers are part of the page —
  // and like the translated units, only the chapter on screen is loaded.
  useEffect(() => {
    if (!chapter || !supports(book?.kind, 'verses')) {
      setVerses([]);
      return;
    }
    listVerses(chapter.id).then(setVerses);
  }, [chapter, book?.kind]);

  /** Where a verse begins is where its number is printed. */
  const numberAt = useMemo(
    () => new Map(verses.map((verse) => [verse.start, verse.number] as const)),
    [verses]
  );

  const paragraphs = useMemo(
    () => (chapter && text ? layoutChapter(text, chapter, language) : []),
    [chapter, text, language]
  );

  const palette = readingThemes[settings.theme];
  const script = scriptOf(language);
  const lineHeight = lineHeightFor(settings, script);

  const flash = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 1200);
  }, []);

  const refreshAnnotations = useCallback(async () => {
    if (id) setAnnotations(await listAnnotations(id));
  }, [id]);

  /**
   * A tap on the white of a paragraph — the ragged edge, the space after a
   * full stop, the gap under a short last line. In select mode it means the
   * line it landed on; outside it, it is still just a tap on the page.
   */
  function pressParagraph(paragraph: { start: number; sentences: Span[] }, event: GestureResponderEvent) {
    if (!selecting && !selection) {
      setChrome(!chromeShown.current);
      return;
    }
    const found = sentenceAtLine(
      linesOf.current.get(paragraph.start) ?? [],
      paragraph.sentences,
      paragraph.start,
      event.nativeEvent.locationY
    );
    if (!found) return;
    if (selection) extendSelect(found, event);
    else beginSelect(found, event);
  }

  function beginSelect(span: Span, event: GestureResponderEvent) {
    setSelection({ anchor: span, focus: span, y: event.nativeEvent.pageY });
    setChrome(true);
    flash(t('reader.selectHint'));
  }

  /** One way out, so the mode and the selection never disagree. */
  function endSelection() {
    setSelection(null);
    setSelecting(false);
  }

  /** The far end moves; the anchor stays where the press landed. */
  function extendSelect(span: Span, event: GestureResponderEvent) {
    const y = event.nativeEvent.pageY;
    setSelection((current) => (current ? { ...current, focus: span, y } : current));
  }

  const range: Span | null = selection
    ? {
        start: Math.min(selection.anchor.start, selection.focus.start),
        end: Math.max(selection.anchor.end, selection.focus.end),
      }
    : null;

  const selected = range ? annotationAt(annotations, range) : undefined;

  async function onCopy() {
    if (!range) return;
    // "Hebrews 3:1-10. [1] … [2] …" — a bible quoted without its reference is
    // a quote nobody can look up.
    const cited = verses.length ? quoteWithVerses(text, range, verses, chapter.title) : null;
    await Clipboard.setStringAsync(cited ?? text.slice(range.start, range.end));
    endSelection();
    flash(t('reader.copied'));
  }

  /** The colour chosen last is the one the next highlight wants. */
  function remember(color: HighlightColor) {
    setSettings((was) => {
      const next = { ...was, highlight: color };
      void saveSettings(next);
      return next;
    });
  }

  async function onHighlight() {
    if (!range || !id) return;
    const existing = annotationAt(annotations, range);
    if (existing && existing.kind === 'highlight') await removeAnnotation(existing.id);
    else if (existing) await updateAnnotation(existing.id, { color: settings.highlight });
    else await save(range, { kind: 'highlight', color: settings.highlight });
    await refreshAnnotations();
    // Marking a line is the whole gesture: staying in select mode afterwards
    // only asks for a second decision nobody was making.
    endSelection();
  }

  async function onBookmark() {
    if (!range || !id) return;
    const existing = annotationAt(annotations, range);
    if (existing?.kind === 'bookmark') await removeAnnotation(existing.id);
    else if (existing) await updateAnnotation(existing.id, { kind: 'bookmark' });
    else await save(range, { kind: 'bookmark', color: null });
    await refreshAnnotations();
    endSelection();
    flash(t('reader.bookmarked'));
  }

  /** A swatch is the same gesture as Highlight, with the colour said out loud. */
  async function onColor(color: HighlightColor) {
    if (!range || !id) return;
    remember(color);
    const existing = annotationAt(annotations, range);
    if (existing) await updateAnnotation(existing.id, { color });
    else await save(range, { kind: 'highlight', color });
    await refreshAnnotations();
    endSelection();
  }

  async function saveNote(body: string) {
    if (!noteFor || !id) return;
    const existing = annotationAt(annotations, noteFor);
    if (existing) {
      await updateAnnotation(existing.id, { note: body || null, kind: body ? 'note' : 'highlight' });
    } else if (body) {
      await save(noteFor, { kind: 'note', color: settings.highlight, note: body });
    }
    await refreshAnnotations();
    setNoteFor(null);
  }

  function save(span: Span, extra: { kind: 'highlight' | 'note' | 'bookmark'; color: string | null; note?: string }) {
    return addAnnotation({
      bookId: id!,
      start: span.start,
      end: span.end,
      quote: text.slice(span.start, span.end),
      ...fingerprint(text, span.start, span.end),
      ...extra,
    });
  }

  /**
   * What this page can do that isn't reading it. Ordered by how often it is
   * wanted: move within the book, then mark it up, then leave for a page that
   * is about what you are looking at.
   */
  function moreActions(): MenuAction[] {
    if (!chapter) return [];
    const partIdx = chapter.part_idx;
    const actions: MenuAction[] = [
      {
        label: t('reader.jumpTo'),
        onPress: () => {
          setMoreOpen(false);
          setListOpen(true);
        },
      },
      {
        label: selecting || selection ? t('reader.selectDone') : t('reader.select'),
        onPress: () => {
          setMoreOpen(false);
          if (selecting || selection) return endSelection();
          setSelecting(true);
          setChrome(true);
          flash(t('reader.selectHint'));
        },
      },
      {
        label: t('reader.openChapter'),
        onPress: () => {
          setMoreOpen(false);
          router.push(`/chapter/${chapter.id}`);
        },
      },
    ];
    // A bible's Genesis, a novel's 卷 — named, because "the part" is not what
    // anyone calls the thing they are reading.
    if (partIdx !== null && partIdx !== undefined) {
      actions.push({
        label: t('reader.openPart', { name: chapter.part_title?.trim() || `${partIdx + 1}` }),
        onPress: () => {
          setMoreOpen(false);
          router.push(`/book/${id}/part/${partIdx}`);
        },
      });
    }
    actions.push(
      {
        label: t('reader.openBook', { name: book?.title ?? '' }),
        onPress: () => {
          setMoreOpen(false);
          router.push(`/book/${id}`);
        },
      },
      {
        label: t('reader.analyzeChapter'),
        onPress: async () => {
          setMoreOpen(false);
          if (!id) return;
          await queueChapterRun(id, 'deep-analyze', [chapter]);
          flash(t('work.queued', { count: 1 }));
        },
      }
    );
    return actions;
  }

  function quoteFor(span: Span) {
    return {
      text: text.slice(span.start, span.end),
      title: book?.title ?? '',
      author: book?.author,
      chapter: chapter?.title.trim() || null,
      note: annotationAt(annotations, span)?.note ?? null,
    };
  }

  function goToChapter(next: number, within = 0) {
    setIndex(next);
    setListOpen(false);
    endSelection();
    pendingScroll.current = within;
    const target = chapters[next];
    if (id && target) {
      const landing = target.start + Math.round(within * (target.end - target.start));
      setOffset(landing);
      saveProgress(id, landing);
    }
  }

  /** The scrubber addresses the whole book, so a seek is an offset, not a page. */
  function seek(fraction: number) {
    if (!text) return;
    const target = Math.round(fraction * Math.max(1, text.length));
    const next = chapters.findIndex((entry) => target >= entry.start && target < entry.end);
    const to = next >= 0 ? next : chapters.length - 1;
    const within = (target - chapters[to].start) / Math.max(1, chapters[to].end - chapters[to].start);
    goToChapter(to, within);
  }

  function pageBy(direction: -1 | 1) {
    const step = Math.max(120, viewport.current.layout - lineHeight * 2);
    const max = Math.max(0, viewport.current.content - viewport.current.layout);
    const current = scrolledY.current;
    const next = current + direction * step;
    if (next < 0 && index > 0) return goToChapter(index - 1, 0.98);
    if (next > max && index < chapters.length - 1) return goToChapter(index + 1, 0);
    scrollRef.current?.scrollTo({ y: Math.min(max, Math.max(0, next)), animated: true });
  }

  const scrolledY = useRef(0);

  if (!book || !chapter) {
    return (
      <View style={[styles.center, { backgroundColor: palette.bg }]}>
        <ActivityIndicator />
      </View>
    );
  }

  // char_count is the book's own length, known before its text is read — the
  // scrubber is in the right place on the first frame rather than at zero.
  const length = text.length || book.char_count;
  const bookFraction = Math.min(1, offset / Math.max(1, length));

  // The selection bar replaces the reading controls rather than stacking on
  // top of them: both at once is two rows of buttons over the same thumb.
  const chromeOpacity = selection ? 0 : chrome;

  const bodyStyle = {
    color: palette.text,
    fontSize: settings.fontSize,
    lineHeight,
    fontFamily: settings.serif ? (script === 'cjk' ? 'Songti SC' : 'Georgia') : undefined,
  };

  const targetOf = (spans: Span[]) =>
    spans.map((span) => translated.get(span.start) ?? '').join(' ').trim();

  function renderSentence(span: Span, useTarget: boolean) {
    const marked = annotationAt(annotations, span);
    const active = range !== null && span.start >= range.start && span.end <= range.end;
    const flashing = flashAt !== null && flashAt >= span.start && flashAt < span.end;
    const body = useTarget ? translated.get(span.start) : undefined;
    return (
      <Text
        key={span.start}
        // iOS paints its own grey box under a pressed Text. On a page made of
        // sentences that reads as a highlight the reader didn't ask for, and
        // in select mode as a second, competing selection colour.
        suppressHighlighting
        onLongPress={(event) => beginSelect(span, event)}
        onPress={(event) => {
          if (selection) return extendSelect(span, event);
          // In select mode a tap is the anchor the long-press would have been.
          if (selecting) return beginSelect(span, event);
          setChrome(!chromeShown.current);
        }}
        style={{
          backgroundColor: active || flashing ? palette.tint : marked?.color ?? 'transparent',
          textDecorationLine: marked?.kind === 'bookmark' ? 'underline' : 'none',
          // An untranslated sentence still reads, just visibly unfinished.
          color: useTarget && !body ? palette.dim : palette.text,
        }}
      >
        {runsIn(body || text.slice(span.start, span.end)).map((run, at) => (
          <Text
            key={at}
            style={{
              fontWeight: run.bold ? '700' : undefined,
              fontStyle: run.italic ? 'italic' : undefined,
              textDecorationLine: run.strike ? 'line-through' : undefined,
              backgroundColor: run.mark ? palette.tint : undefined,
              fontFamily: run.code ? 'Menlo' : undefined,
              fontSize: run.code ? settings.fontSize * 0.92 : undefined,
            }}
          >
            {run.text}
          </Text>
        ))}{' '}
      </Text>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.bg }}>
      <Animated.View style={[styles.bar, { opacity: chrome }]} pointerEvents="box-none">
        {/* The way out of every other page, drawn the same way here: the
            accent chevron at the header's own size, not a grey hint of one. */}
        <Pressable onPress={() => router.back()} style={styles.backButton} hitSlop={8}>
          <Text style={{ color: palette.accent, fontSize: 36, lineHeight: 40, fontWeight: '500' }}>
            ‹
          </Text>
        </Pressable>
        <Text numberOfLines={1} style={{ color: palette.dim, fontSize: 13, flex: 1, textAlign: 'center' }}>
          {chapter.title.trim() || `${index + 1}`}
        </Text>
        <View style={{ width: TOUCH }} />
      </Animated.View>

      <View style={{ flex: 1 }}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ paddingHorizontal: settings.margin, paddingBottom: space.xxl * 3 }}
          onScroll={(event) => {
            const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
            scrolledY.current = contentOffset.y;
            viewport.current = { content: contentSize.height, layout: layoutMeasurement.height };
            const ratio = contentOffset.y / Math.max(1, contentSize.height - layoutMeasurement.height);
            const at = chapter.start + Math.round(Math.min(1, Math.max(0, ratio)) * (chapter.end - chapter.start));
            setOffset(at);
            if (id) saveProgress(id, at);
          }}
          scrollEventThrottle={200}
          onContentSizeChange={(_, contentHeight) => {
            viewport.current.content = contentHeight;
            // The spinner's height is not the chapter's: landing on a verse
            // has to wait for the words, or it lands at the top of nothing.
            if (!text) return;
            const within = pendingScroll.current;
            pendingScroll.current = null;
            const max = Math.max(0, contentHeight - viewport.current.layout);
            scrollRef.current?.scrollTo({ y: within ? within * max : 0, animated: false });
          }}
        >
          {/* A selection ends when you say so. The gaps between paragraphs are
              most of the page, and losing a two-paragraph selection to a thumb
              that landed in one of them is the whole reason this isn't a tap
              to cancel — the menu carries its own ✕. */}
          <Pressable
            onPress={() => {
              if (!selection) setChrome(!chromeShown.current);
            }}
          >
            {!text ? (
              <ActivityIndicator style={{ marginTop: space.xxl }} />
            ) : paragraphs.length === 0 ? (
              <Text style={{ color: palette.dim, marginTop: space.xxl }}>{t('reader.empty')}</Text>
            ) : (
              paragraphs.map((paragraph) => {
                const body = text.slice(
                  paragraph.start,
                  paragraph.sentences.at(-1)?.end ?? paragraph.start
                );
                const figure = imageIn(body);
                const code = figure ? null : codeBlockIn(body);
                if (code) {
                  return (
                    <Pressable
                      key={paragraph.start}
                      onPress={(event) => pressParagraph(paragraph, event)}
                      style={[styles.code, { borderColor: palette.dim, marginBottom: lineHeight }]}
                    >
                      <Text
                        style={{
                          color: palette.text,
                          fontFamily: 'Menlo',
                          fontSize: settings.fontSize * 0.82,
                          lineHeight: settings.fontSize * 1.25,
                        }}
                      >
                        {code}
                      </Text>
                    </Pressable>
                  );
                }
                if (figure) {
                  // `![$x^2$](…)` is a formula; anything else is a picture.
                  const formula = /^\$[\s\S]*\$$/.test(figure.alt);
                  return (
                    <View key={paragraph.start} style={{ marginBottom: lineHeight }}>
                      <ReaderImage
                        uri={figure.uri}
                        alt={figure.alt}
                        width={width - settings.margin * 2}
                        cap={formula ? lineHeight * 6 : height * 0.7}
                        tint={palette.dim}
                        ink={palette.text}
                        formula={formula}
                      />
                    </View>
                  );
                }
                return (
                <Pressable
                  key={paragraph.start}
                  onPress={(event) => pressParagraph(paragraph, event)}
                  style={{ marginBottom: lineHeight * 0.6 }}
                >
                  <Text
                    style={bodyStyle}
                    onTextLayout={(event) =>
                      linesOf.current.set(
                        paragraph.start,
                        event.nativeEvent.lines.map((line) => ({
                          y: line.y,
                          height: line.height,
                          length: line.text.length,
                        }))
                      )
                    }
                  >
                    {/* Raised, small and dim: a number to find a verse by, not
                        a word in the sentence it opens. */}
                    {numberAt.has(paragraph.start) ? (
                      <Text
                        style={{
                          color: palette.dim,
                          fontSize: Math.round(settings.fontSize * 0.62),
                          lineHeight,
                        }}
                      >
                        {numberAt.get(paragraph.start)}{' '}
                      </Text>
                    ) : null}
                    {paragraph.sentences.map((span) =>
                      renderSentence(span, settings.bilingual === 'target')
                    )}
                  </Text>
                  {/* Both languages read as two paragraphs, the way a bilingual
                      edition prints them — not as alternating lines. */}
                  {settings.bilingual === 'both' && targetOf(paragraph.sentences) ? (
                    <Text
                      style={[
                        bodyStyle,
                        {
                          color: palette.dim,
                          fontSize: settings.fontSize - 1,
                          marginTop: lineHeight * 0.25,
                        },
                      ]}
                    >
                      {targetOf(paragraph.sentences)}
                    </Text>
                  ) : null}
                </Pressable>
                );
              })
            )}
          </Pressable>
        </ScrollView>

        {/* The margin is the tap zone: it never sits over a word. */}
        <Pressable
          style={[styles.zone, { left: 0, width: settings.margin }]}
          onPress={() => pageBy(-1)}
        />
        <Pressable
          style={[styles.zone, { right: 0, width: settings.margin }]}
          onPress={() => pageBy(1)}
        />
      </View>

      {selection && (
        <SentenceMenu
          dark={settings.theme === 'night'}
          dismissLabel={t('reader.done')}
          activeColor={
            selected && selected.kind !== 'bookmark' ? selected.color : settings.highlight
          }
          onColor={onColor}
          onDismiss={endSelection}
          actions={[
            { key: 'copy', label: t('reader.copy'), onPress: onCopy },
            {
              key: 'highlight',
              label: selected?.kind === 'highlight' ? t('reader.unhighlight') : t('reader.highlight'),
              onPress: onHighlight,
            },
            {
              key: 'note',
              label: t('reader.note'),
              onPress: () => {
                setNoteFor(range!);
                endSelection();
              },
            },
            {
              key: 'bookmark',
              label: selected?.kind === 'bookmark' ? t('reader.unbookmark') : t('reader.bookmark'),
              onPress: onBookmark,
            },
            {
              key: 'share',
              label: t('reader.share'),
              onPress: () => {
                setShareFor(range!);
                endSelection();
              },
            },
          ]}
        />
      )}

      <Animated.View
        style={[styles.footer, { opacity: chromeOpacity }]}
        pointerEvents={selection ? 'none' : 'box-none'}
      >
        <View style={{ paddingHorizontal: space.lg }}>
          <Scrubber
            value={bookFraction}
            tint={palette.text}
            dim={palette.dim}
            onCommit={seek}
            label={(fraction) =>
              t('reader.scrub', {
                percent: Math.round(fraction * 100),
                chapter: chapterAt(chapters, fraction * length) + 1,
                total: chapters.length,
              })
            }
          />
        </View>

        <View style={styles.controls}>
          {/* Chapter by chapter is the move this bar is for, so its arrows are
              the widest targets on it and heavy enough to read at a glance. */}
          <Pressable
            onPress={() => index > 0 && goToChapter(index - 1)}
            style={styles.arrowButton}
            disabled={index === 0}
          >
            <Text style={[styles.arrow, { color: index > 0 ? palette.text : palette.dim }]}>‹</Text>
          </Pressable>
          <Pressable onPress={() => setSettingsOpen(true)} style={styles.barButton}>
            <Text style={{ color: palette.text, fontSize: 20 }}>Aa</Text>
          </Pressable>
          {/* One button for everything that isn't turning a page or resizing
              the type. The bar had five; the two it kept are the two a thumb
              reaches for without looking, and the rest are a list that can say
              what they do in words. Accent while selecting, because that is a
              mode the page is in and the bar has to admit it. */}
          <Pressable onPress={() => setMoreOpen(true)} style={styles.barButton}>
            <Text
              style={{
                color: selecting ? palette.accent : palette.text,
                fontSize: 26,
                lineHeight: 30,
              }}
            >
              ⋯
            </Text>
          </Pressable>
          <Pressable
            onPress={() => index < chapters.length - 1 && goToChapter(index + 1)}
            style={styles.arrowButton}
            disabled={index >= chapters.length - 1}
          >
            <Text
              style={[
                styles.arrow,
                { color: index < chapters.length - 1 ? palette.text : palette.dim },
              ]}
            >
              ›
            </Text>
          </Pressable>
        </View>
      </Animated.View>

      <ReadingSettingsSheet
        visible={settingsOpen}
        settings={settings}
        targets={targets}
        target={target}
        onTarget={setTarget}
        onChange={(next) => {
          setSettings(next);
          saveSettings(next);
        }}
        onClose={() => setSettingsOpen(false)}
      />

      <NoteSheet
        visible={noteFor !== null}
        quote={noteFor ? text.slice(noteFor.start, noteFor.end) : ''}
        note={noteFor ? annotationAt(annotations, noteFor)?.note ?? null : null}
        onSave={saveNote}
        onClose={() => setNoteFor(null)}
      />

      <PickerSheet
        visible={shareFor !== null}
        title={t('reader.share')}
        options={[
          { id: 'text', label: t('reader.shareText') },
          { id: 'card', label: t('reader.shareCard'), detail: t('reader.shareCardHint') },
        ]}
        onPick={async (choice) => {
          const span = shareFor;
          setShareFor(null);
          if (!span) return;
          try {
            if (choice === 'text') await shareQuoteText(quoteFor(span));
            else await shareQuoteCard(quoteFor(span), settings.theme, settings.serif);
          } catch (error) {
            flash(String(error));
          }
        }}
        onClose={() => setShareFor(null)}
      />

      <ActionMenu
        visible={moreOpen}
        title={chapter.title.trim() || `${index + 1}`}
        actions={moreActions()}
        onClose={() => setMoreOpen(false)}
      />

      <ChapterSheet
        visible={listOpen}
        chapters={chapters}
        current={index}
        palette={palette}
        onPick={(idx) => goToChapter(idx)}
        onClose={() => setListOpen(false)}
      />

      {toast && (
        <View style={styles.toast}>
          <Text style={{ color: '#FFFFFF', fontSize: 13 }}>{toast}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

function chapterAt(chapters: Chapter[], offset: number): number {
  const at = chapters.findIndex((chapter) => offset >= chapter.start && offset < chapter.end);
  return at >= 0 ? at : Math.max(0, chapters.length - 1);
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  /**
   * Every control in the bar is a full touch target, not a glyph with hitSlop
   * around it: a 44pt square is the size a thumb actually hits, and on a bar
   * that fades while you read there is no second chance at a near miss.
   */
  barButton: { width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center' },
  /** The back chevron carries a header's worth of weight, so it gets the room. */
  backButton: { width: TOUCH + 8, height: TOUCH + 8, alignItems: 'center', justifyContent: 'center' },
  arrowButton: { width: TOUCH + 28, height: TOUCH, alignItems: 'center', justifyContent: 'center' },
  arrow: { fontSize: 34, lineHeight: 38, fontWeight: '700' },
  zone: { position: 'absolute', top: 0, bottom: 0 },
  /** Code is set apart by a rule, not a box: a box on a reading page is a form. */
  code: { borderLeftWidth: 2, paddingLeft: space.md, paddingVertical: space.xs },
  footer: { paddingBottom: space.xs },
  /** Evenly spread, outermost first: the arrows fall under either thumb. */
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: space.lg,
  },
  toast: {
    position: 'absolute',
    bottom: 80,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: 16,
  },
});
