import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Modal,
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
  removeAnnotation,
  saveProgress,
  updateAnnotation,
  type Annotation,
  type Book,
  type Chapter,
} from '../../src/db/repo';
import { annotationAt, layoutChapter } from '../../src/reader/model';
import { fingerprint, repairAll } from '../../src/reader/anchor';
import type { Span } from '../../src/text/segment';
import { scriptOf } from '../../src/text/language';
import { highlightColors, readingThemes, space, useScheme, type HighlightColor } from '../../src/theme';
import {
  defaultSettings,
  lineHeightFor,
  loadSettings,
  saveSettings,
  type ReadingSettings,
} from '../../src/reader/settings';
import { ReadingSettingsSheet } from '../../src/ui/ReadingSettingsSheet';
import { SentenceMenu } from '../../src/ui/SentenceMenu';
import { NoteSheet } from '../../src/ui/NoteSheet';
import { Scrubber } from '../../src/ui/Scrubber';
import { PickerSheet } from '../../src/ui/PickerSheet';
import { shareQuoteCard, shareQuoteText } from '../../src/share/quote';
import { listTargets, listUnits } from '../../src/db/translation';

const CHROME_IDLE_MS = 2800;
/** Apple and Android both put the floor at 44pt / 48dp. */
const TOUCH = 44;
/** Fixed so the list can jump straight to the chapter being read. */
const ROW = 48;

export default function Reader() {
  const { id, chapter: chapterParam, at } = useLocalSearchParams<{
    id: string;
    chapter?: string;
    at?: string;
  }>();
  const { t } = useTranslation();
  const { height } = useWindowDimensions();

  const [book, setBook] = useState<Book | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [text, setText] = useState('');
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [index, setIndex] = useState(0);
  const [settings, setSettings] = useState<ReadingSettings>(defaultSettings);
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
  const [noteFor, setNoteFor] = useState<Span | null>(null);
  const [shareFor, setShareFor] = useState<Span | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [targets, setTargets] = useState<string[]>([]);
  const [target, setTarget] = useState<string | null>(null);
  const [translated, setTranslated] = useState<Map<number, string>>(new Map());

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

  const scheme = useScheme();
  useEffect(() => {
    loadSettings(scheme).then(setSettings);
    // Deliberately once: re-reading on a scheme change would throw away the
    // theme picked for this session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [loadedBook, loadedChapters, loadedText, loadedAnnotations, saved] = await Promise.all([
        getBook(id),
        listChapters(id),
        getDocumentText(id),
        listAnnotations(id),
        getProgress(id),
      ]);
      setBook(loadedBook);
      setChapters(loadedChapters);
      setText(loadedText);
      setOffset(saved);

      // Offsets drift when a book is re-split; the words are what find them.
      const { placed } = repairAll(loadedText, loadedAnnotations);
      setAnnotations(placed);
      for (const repaired of placed) {
        const before = loadedAnnotations.find((entry) => entry.id === repaired.id);
        if (before && (before.start !== repaired.start || before.end !== repaired.end)) {
          void updateAnnotation(repaired.id, { start: repaired.start, end: repaired.end });
        }
      }

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
        setTimeout(() => setFlashAt(null), 1600);
      }
    })();
  }, [id, chapterParam, at]);

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

  function beginSelect(span: Span, event: GestureResponderEvent) {
    setSelection({ anchor: span, focus: span, y: event.nativeEvent.pageY });
    setChrome(true);
    flash(t('reader.selectHint'));
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
    await Clipboard.setStringAsync(text.slice(range.start, range.end));
    setSelection(null);
    flash(t('reader.copied'));
  }

  async function onHighlight() {
    if (!range || !id) return;
    const existing = annotationAt(annotations, range);
    if (existing && existing.kind === 'highlight') {
      await removeAnnotation(existing.id);
      setSelection(null);
    } else if (existing) {
      await updateAnnotation(existing.id, { color: highlightColors[0] });
    } else {
      await save(range, { kind: 'highlight', color: highlightColors[0] });
    }
    await refreshAnnotations();
  }

  async function onBookmark() {
    if (!range || !id) return;
    const existing = annotationAt(annotations, range);
    if (existing?.kind === 'bookmark') await removeAnnotation(existing.id);
    else if (existing) await updateAnnotation(existing.id, { kind: 'bookmark' });
    else await save(range, { kind: 'bookmark', color: null });
    await refreshAnnotations();
    setSelection(null);
    flash(t('reader.bookmarked'));
  }

  async function onColor(color: HighlightColor) {
    if (!selected) return;
    await updateAnnotation(selected.id, { color });
    await refreshAnnotations();
  }

  async function saveNote(body: string) {
    if (!noteFor || !id) return;
    const existing = annotationAt(annotations, noteFor);
    if (existing) {
      await updateAnnotation(existing.id, { note: body || null, kind: body ? 'note' : 'highlight' });
    } else if (body) {
      await save(noteFor, { kind: 'note', color: highlightColors[0], note: body });
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
    setSelection(null);
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

  const bookFraction = Math.min(1, offset / Math.max(1, text.length));

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
        onLongPress={(event) => beginSelect(span, event)}
        onPress={(event) =>
          selection ? extendSelect(span, event) : setChrome(!chromeShown.current)
        }
        style={{
          backgroundColor: active || flashing ? palette.tint : marked?.color ?? 'transparent',
          textDecorationLine: marked?.kind === 'bookmark' ? 'underline' : 'none',
          // An untranslated sentence still reads, just visibly unfinished.
          color: useTarget && !body ? palette.dim : palette.text,
        }}
      >
        {body || text.slice(span.start, span.end)}{' '}
      </Text>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.bg }}>
      <Animated.View style={[styles.bar, { opacity: chrome }]} pointerEvents="box-none">
        <Pressable onPress={() => router.back()} style={styles.barButton} hitSlop={8}>
          <Text style={{ color: palette.dim, fontSize: 30, lineHeight: 34 }}>‹</Text>
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
            const within = pendingScroll.current;
            pendingScroll.current = null;
            const max = Math.max(0, contentHeight - viewport.current.layout);
            scrollRef.current?.scrollTo({ y: within ? within * max : 0, animated: false });
          }}
        >
          <Pressable
            onPress={() => (selection ? setSelection(null) : setChrome(!chromeShown.current))}
          >
            {paragraphs.length === 0 ? (
              <Text style={{ color: palette.dim, marginTop: space.xxl }}>{t('reader.empty')}</Text>
            ) : (
              paragraphs.map((paragraph) => (
                <View key={paragraph.start} style={{ marginBottom: lineHeight * 0.6 }}>
                  <Text style={bodyStyle}>
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
                </View>
              ))
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
          y={selection.y}
          screenHeight={height}
          dark={settings.theme === 'night'}
          activeColor={selected && selected.kind !== 'bookmark' ? selected.color : null}
          onColor={onColor}
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
                setSelection(null);
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
                setSelection(null);
              },
            },
          ]}
        />
      )}

      <Animated.View style={[styles.footer, { opacity: chrome }]} pointerEvents="box-none">
        <View style={{ paddingHorizontal: space.lg }}>
          <Scrubber
            value={bookFraction}
            tint={palette.text}
            dim={palette.dim}
            onCommit={seek}
            label={(fraction) =>
              t('reader.scrub', {
                percent: Math.round(fraction * 100),
                chapter: chapterAt(chapters, fraction * text.length) + 1,
                total: chapters.length,
              })
            }
          />
        </View>

        <View style={styles.controls}>
          <Pressable
            onPress={() => index > 0 && goToChapter(index - 1)}
            style={styles.barButton}
            disabled={index === 0}
          >
            <Text style={{ color: index > 0 ? palette.text : palette.dim, fontSize: 30, lineHeight: 34 }}>
              ‹
            </Text>
          </Pressable>
          <Pressable onPress={() => setSettingsOpen(true)} style={styles.barButton}>
            <Text style={{ color: palette.text, fontSize: 20 }}>Aa</Text>
          </Pressable>
          <Pressable onPress={() => setListOpen(true)} style={styles.barButton}>
            <Text style={{ color: palette.text, fontSize: 26, lineHeight: 30 }}>≡</Text>
          </Pressable>
          <Pressable
            onPress={() => index < chapters.length - 1 && goToChapter(index + 1)}
            style={styles.barButton}
            disabled={index >= chapters.length - 1}
          >
            <Text
              style={{
                color: index < chapters.length - 1 ? palette.text : palette.dim,
                fontSize: 30,
                lineHeight: 34,
              }}
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

      <Modal
        visible={listOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setListOpen(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: palette.bg }}>
          <View style={styles.bar}>
            <Pressable onPress={() => setListOpen(false)} style={styles.barButton} hitSlop={8}>
              <Text style={{ color: palette.dim, fontSize: 22 }}>✕</Text>
            </Pressable>
            <Text style={{ color: palette.text, fontSize: 15, flex: 1, textAlign: 'center' }}>
              {t('reader.chapterList')}
            </Text>
            <View style={{ width: TOUCH }} />
          </View>
          <FlatList
            data={chapters}
            keyExtractor={(entry) => entry.id}
            initialNumToRender={20}
            windowSize={9}
            // Land on where you are, not on chapter one.
            initialScrollIndex={Math.max(0, index - 4)}
            getItemLayout={(_, at) => ({ length: ROW, offset: ROW * at, index: at })}
            renderItem={({ item: entry }) => (
              <Pressable
                onPress={() => goToChapter(entry.idx)}
                style={{ paddingHorizontal: space.xl, justifyContent: 'center', height: ROW }}
              >
                <Text
                  numberOfLines={1}
                  style={{ color: entry.idx === index ? palette.text : palette.dim, fontSize: 15 }}
                >
                  {entry.idx + 1}  {entry.title.trim() || '—'}
                </Text>
              </Pressable>
            )}
          />
        </SafeAreaView>
      </Modal>

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
  zone: { position: 'absolute', top: 0, bottom: 0 },
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
