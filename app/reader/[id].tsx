import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type GestureResponderEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type TextInputSelectionChangeEventData,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from '../../src/navigation/router';
import { useTranslation } from 'react-i18next';
import Clipboard from '@react-native-clipboard/clipboard';

import {
  addAnnotation,
  addExcerpt,
  createEntity,
  findEntityNamed,
  getBook,
  getDocumentText,
  getProgress,
  listAnnotations,
  listChapters,
  listPages,
  listEntities,
  listVerses,
  removeAnnotation,
  saveProgress,
  touchRead,
  updateAnnotation,
  type Annotation,
  type Book,
  type Chapter,
  type Entity,
  type Verse,
} from '../../src/db/repo';
import { annotationAt, layoutChapter } from '../../src/reader/model';
import { documentRange, originsOf } from '../../src/reader/selection';
import { OriginalPage } from '../../src/ui/OriginalPage';
import { imageIn } from '../../src/reader/images';
import { sentenceAtLine, type Line } from '../../src/reader/lines';
import { esvChapterText } from '../../src/sources/esvBook';
import { neighbouringChapters } from '../../src/scripture/canon';
import { esvKey } from '../../src/sources/esvKey';
import { EsvError } from '../../src/sources/esv';
import { codeBlockIn, runsIn } from '../../src/reader/rich';
import { ReaderImage } from '../../src/ui/ReaderImage';
import { supports } from '../../src/books/kinds';
import { quoteWithVerses } from '../../src/scripture/reference';
import { fingerprint, repairAll } from '../../src/reader/anchor';
import type { Span } from '../../src/text/segment';
import { scriptOf } from '../../src/text/language';
import { markOn, radius, readingThemes, space, useScheme, type HighlightColor } from '../../src/theme';
import {
  defaultSettings,
  lineHeightFor,
  loadSettings,
  saveSettings,
  type ReadingSettings,
} from '../../src/reader/settings';
import { ReadingSettingsSheet } from '../../src/ui/ReadingSettingsSheet';
import { labelFor } from '../../src/translate/languages';
import { SentenceMenu } from '../../src/ui/SentenceMenu';
import { NoteSheet } from '../../src/ui/NoteSheet';
import { Toast, useFlash } from '../../src/ui/primitives';
import { PickerSheet } from '../../src/ui/PickerSheet';
import { JumpWheel } from '../../src/ui/JumpWheel';
import { shareQuoteCard, shareQuoteText } from '../../src/share/quote';
import {
  listTargets,
  listUnits,
  targetsInChapter,
  type TranslationUnit,
} from '../../src/db/translation';
import { endsTight, placeTranslation } from '../../src/translate/layout';
import { ensureUnitsCurrent } from '../../src/translate/repair';

/**
 * Long enough to decide and reach. At under three seconds the bar was gone
 * before a thumb had crossed the screen, which turns every use of it into two
 * taps: one to bring it back, one to press what you wanted.
 */
const CHROME_IDLE_MS = 10000;
/** Apple and Android both put the floor at 44pt / 48dp. */
const TOUCH = 44;

/** A chosen id, or a request to make the thing first: `new:card`. */
const NEW = 'new:';

export default function Reader() {
  const { id, chapter: chapterParam, at } = useLocalSearchParams<{
    id: string;
    chapter?: string;
    at?: string;
  }>();
  const { t } = useTranslation();
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

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
  /**
   * A range the reader dragged, which is any range at all and so cannot be
   * described as a pair of sentences. Held beside `selection` rather than
   * inside it: the tap model's anchor-and-focus is what lets a tap walk the
   * far end back, and a dragged range has no such thing to walk.
   */
  const [dragged, setDragged] = useState<Span | null>(null);
  /**
   * Where the pages of the original fall, for a book converted from one. Held
   * whole rather than queried: the alternative is a round trip every time the
   * words move, which is five times a second while somebody flicks.
   */
  const [pages, setPages] = useState<{ number: number; start: number; end: number }[]>([]);
  const [showingOriginal, setShowingOriginal] = useState(false);
  /** The title's own menu, unfolded under the bar it belongs to. */
  const [jumpOpen, setJumpOpen] = useState(false);
  const [noteFor, setNoteFor] = useState<Span | null>(null);
  const [shareFor, setShareFor] = useState<Span | null>(null);
  /**
   * What a passage can be added to: the book's own terms and, for a
   * textbook, its flash cards. Read once with the book — the sheet has to open
   * on a tap, and a query at that moment is a sheet that opens empty and fills
   * in.
   */
  const [filable, setFilable] = useState<Entity[]>([]);
  const [addingTo, setAddingTo] = useState<Span | null>(null);
  const [offset, setOffset] = useState(0);
  const [targets, setTargets] = useState<string[]>([]);
  /** Of those, the ones this chapter has actually been translated into. */
  const [ready, setReady] = useState<string[]>([]);
  const [target, setTarget] = useState<string | null>(null);
  const [units, setUnits] = useState<TranslationUnit[]>([]);
  const [verses, setVerses] = useState<Verse[]>([]);
  /** A chapter of a book whose words are not here: fetched, then kept. */
  const [remoteText, setRemoteText] = useState('');
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  /**
   * Long-press still works, but it misses on the white between sentences and
   * on a short word. The button is the way in that never misses.
   */

  /** Where each paragraph's lines ended up, so a tap that missed the words
   *  can still be answered by the line it landed on. */
  const linesOf = useRef(new Map<number, Line[]>());
  const scrollRef = useRef<ScrollView>(null);
  const viewport = useRef({ content: 0, layout: 0 });
  /** Driven by the scroll itself, so the thumb keeps up without JavaScript. */
  const scrollY = useRef(new Animated.Value(0)).current;
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
  const loadFilable = useCallback(async (kind: string | undefined) => {
    if (!id) return;
    const wanted = (['term', 'card'] as const).filter((each) =>
      supports(kind, each === 'term' ? 'terms' : 'cards')
    );
    const lists = await Promise.all(wanted.map((each) => listEntities(id, each)));
    setFilable(lists.flat());
  }, [id]);

  useEffect(() => {
    if (!id) return;
    // The shelf orders by this, and it is true the moment the page opens.
    void touchRead(id);
    (async () => {
      const [loadedBook, loadedChapters, saved] = await Promise.all([
        getBook(id),
        listChapters(id),
        getProgress(id),
      ]);
      setBook(loadedBook);
      setChapters(loadedChapters);
      setOffset(saved);
      void loadFilable(loadedBook?.kind);

      const target = at ? Number(at) : null;
      const requested = chapterParam ? Number(chapterParam) : null;
      // A book with no text has no offsets either, so where it was left is a
      // chapter rather than a position inside one.
      if (loadedBook?.text_source) {
        setIndex(requested ?? Math.min(Math.max(0, saved), loadedChapters.length - 1));
        return;
      }
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
    if (!id || book?.text_source) return;
    getDocumentText(id).then(setText);
  }, [id, book?.text_source]);

  // A fetched book has nothing to re-anchor against and nothing that drifts:
  // its chapters are asked for by name and come back the same every time.
  useEffect(() => {
    if (!id || !book?.text_source) return;
    listAnnotations(id).then(setAnnotations);
  }, [id, book?.text_source]);

  // Offsets drift when a book is re-split; the words are what find them. This
  // needs the whole text, so it waits for it rather than holding it up.
  useEffect(() => {
    if (!id || !text || book?.text_source) return;
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
      setUnits([]);
      return;
    }
    // Rows seeded by an older splitter are put right once, before anything
    // asks them where a sentence is.
    ensureUnitsCurrent(id)
      .then(() => listUnits(id, target, chapter.idx))
      .then(setUnits);
  }, [id, target, chapter, settings.bilingual]);

  /**
   * Which languages this chapter can be read in, asked again at every chapter.
   *
   * A book is "translated" as soon as one chapter is, so reading on past the
   * last translated chapter used to hand over a page of empty places. The
   * setting is not touched — walk back into a chapter that has the language
   * and it is in that language again.
   */
  useEffect(() => {
    if (!id || !chapter) {
      setReady([]);
      return;
    }
    targetsInChapter(id, chapter.idx).then(setReady);
  }, [id, chapter]);

  // A bible addresses itself by verse, so the numbers are part of the page —
  // and like the translated units, only the chapter on screen is loaded.
  useEffect(() => {
    if (!chapter || !supports(book?.kind, 'verses')) {
      setVerses([]);
      return;
    }
    listVerses(chapter.id).then(setVerses);
  }, [chapter, book?.kind]);

  const remote = Boolean(book?.text_source);
  /**
   * What the page is drawn from. A manuscript for an ordinary book; the
   * chapter just fetched for one whose words are not kept here. Everything
   * that reads a span reads it from this, or it reads from the wrong string.
   */
  const source = remote ? remoteText : text;

  /** The marks that belong to what is on screen. */
  const marks = useMemo(
    () => (remote ? annotations.filter((entry) => entry.chapter_id === chapter?.id) : annotations),
    [remote, annotations, chapter?.id]
  );

  /**
   * One chapter of a licensed edition: from the device if it has been read
   * before, from the source if not, and kept either way. A chapter already
   * here needs no signal, which is the whole point of keeping it.
   */
  useEffect(() => {
    if (!remote || !chapter) return;
    let live = true;
    setFetching(true);
    setRemoteError(null);
    (async () => {
      try {
        const token = await esvKey();
        const passage = await esvChapterText(chapter.title, token);
        if (!live) return;
        setRemoteText(passage.text);
        // The way a reader goes next is nearly always one of these two, and
        // having them already here is the difference between a page and a wait.
        void (async () => {
          for (const next of neighbouringChapters(chapter.title)) {
            try {
              await esvChapterText(next, token);
            } catch {
              return;
            }
          }
        })();
      } catch (problem) {
        if (!live) return;
        setRemoteText('');
        setRemoteError(problem instanceof EsvError ? problem.code : 'offline');
      } finally {
        if (live) setFetching(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [remote, chapter?.id]);

  /** Where a verse begins is where its number is printed. */
  const numberAt = useMemo(
    () => new Map(verses.map((verse) => [verse.start, verse.number] as const)),
    [verses]
  );

  const paragraphs = useMemo(() => {
    // A fetched chapter is its own document: it starts at nothing and ends at
    // its own length, which is all the layout ever needed.
    if (remote) {
      return remoteText
        ? layoutChapter(remoteText, { start: 0, end: remoteText.length } as Chapter, language)
        : [];
    }
    return chapter && text ? layoutChapter(text, chapter, language) : [];
  }, [remote, remoteText, chapter, text, language]);

  /** Every sentence on the page in reading order — what walking the far end
   *  of a selection back by one needs. */
  const spans = useMemo(
    () => paragraphs.flatMap((paragraph) => paragraph.sentences),
    [paragraphs]
  );

  /**
   * Where each translated sentence lands on the page — and which paragraphs
   * must not print themselves, because a neighbour's unit already printed
   * them. See `placeTranslation`; the work is offsets, not rendering.
   */
  const page = useMemo(
    () => placeTranslation(paragraphs, units, source),
    [paragraphs, units, source]
  );

  const palette = readingThemes[settings.theme];
  const script = scriptOf(language);
  const lineHeight = lineHeightFor(settings, script);

  /**
   * Which page of the original the reader is on. A walk rather than a search,
   * because the answer almost always sits at or beside the last one — reading
   * moves forward a page at a time.
   */
  const onPage = useMemo(() => {
    if (!pages.length) return null;
    const found = pages.find((page) => offset >= page.start && offset < page.end);
    return found?.number ?? null;
  }, [pages, offset]);

  const { message: toast, flash } = useFlash();

  useEffect(() => {
    if (!id) return;
    listPages(id).then(setPages).catch(() => undefined);
  }, [id]);

  const refreshAnnotations = useCallback(async () => {
    if (id) setAnnotations(await listAnnotations(id));
  }, [id]);

  /**
   * A tap on the white of a paragraph — the ragged edge, the space after a
   * full stop, the gap under a short last line. In select mode it means the
   * line it landed on; outside it, it is still just a tap on the page.
   */
  function pressParagraph(paragraph: { start: number; sentences: Span[] }, event: GestureResponderEvent) {
    if (!selection) {
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

  /**
   * A long press on that same white space starts a selection, rather than
   * doing nothing at all.
   *
   * The press only ever reached a sentence by landing on its glyphs, and most
   * of a paragraph is not glyphs — the ragged right edge, the space after a
   * full stop, the gap under a short last line. A press there fell through to
   * the paragraph, which outside select mode only toggled the chrome, so
   * selecting a phrase was a matter of hitting the letters. It reads as
   * selection being broken; it was a near miss.
   */
  function holdParagraph(paragraph: { start: number; sentences: Span[] }, event: GestureResponderEvent) {
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
    setDragged(null);
  }

  /**
   * The far end moves; the anchor stays where the press landed. Tapping the
   * far end itself takes it back rather than doing nothing — the selection
   * gives up that sentence and ends at the one before it, so a tap too far is
   * undone by the same tap that made it.
   *
   * Forwards only. A tap *above* the anchor used to drag the selection
   * backwards over it, which is how a careful quote became the wrong quote
   * with one misplaced thumb: the passage you were building vanished and a
   * different one appeared behind you. A tap before the range now does
   * nothing at all, which is what a miss should cost.
   */
  function extendSelect(span: Span, event: GestureResponderEvent) {
    const y = event.nativeEvent.pageY;
    setSelection((current) => {
      if (!current) return current;
      if (span.end <= current.anchor.start) return current;
      if (span.start !== current.focus.start) return { ...current, focus: span, y };
      const back = stepBack(current.anchor, current.focus);
      // Nothing left to give back: the one sentence was the whole selection,
      // so tapping it again is done with it.
      if (!back) {
        endSelection();
        return null;
      }
      return { ...current, focus: back, y };
    });
  }

  /** One sentence back towards the anchor; null when the far end is the anchor. */
  function stepBack(anchor: Span, focus: Span): Span | null {
    const at = spans.findIndex((entry) => entry.start === focus.start);
    const anchorAt = spans.findIndex((entry) => entry.start === anchor.start);
    if (at < 0 || anchorAt < 0 || at === anchorAt) return null;
    return spans[at + (at > anchorAt ? -1 : 1)] ?? null;
  }

  const range: Span | null =
    dragged ??
    (selection
      ? {
          start: Math.min(selection.anchor.start, selection.focus.start),
          end: Math.max(selection.anchor.end, selection.focus.end),
        }
      : null);

  const selected = range ? annotationAt(marks, range) : undefined;
  /** Somewhere for a passage to go: this kind of book has terms, or cards, or both. */
  const canAdd = supports(book?.kind, 'terms') || supports(book?.kind, 'cards');
  /**
   * Short enough to be a word rather than a passage. Measured in characters
   * and not in words, because the languages this is read in do not all put
   * spaces between them: `天龙八部` is four characters and no spaces, and a
   * line of English prose is sixty characters and nine.
   */
  const canKeepWord =
    supports(book?.kind, 'words') && range !== null && Boolean(wordIn(source.slice(range.start, range.end)));

  async function onCopy() {
    if (!range) return;
    // "Hebrews 3:1-10 [1] … [2] …" — a bible quoted without its reference is
    // a quote nobody can look up.
    const cited = verses.length ? quoteWithVerses(text, range, verses, chapter.title) : null;
    const plain = source.slice(range.start, range.end);
    // A fetched edition is quoted the way its licence asks: with the reference
    // and the edition, so what was copied can always be looked up again.
    const attributed = remote ? `${plain}\n\n— ${chapter.title} (${t('reader.esvShort')})` : plain;
    await Clipboard.setString(cited ?? attributed);
    endSelection();
    flash(t('reader.copied'));
  }

  /**
   * The passage, added to the thing it is about — a term it explains, or a
   * flash card it is the evidence for. A highlight marks the sentence; this
   * says what the sentence is for, and turns up on that thing's own page.
   *
   * `at` is the offset in what is being read. For a fetched edition that is an
   * offset inside the chapter rather than the book, which is why the chapter
   * travels with it and is what the link back uses.
   */
  async function addInto(choice: string) {
    const span = addingTo;
    if (!span || !id) return;
    setAddingTo(null);
    const quote = source.slice(span.start, span.end).replace(/\s+/g, ' ').trim();
    const chapterIdx =
      chapters.find((entry) => span.start >= entry.start && span.start < entry.end)?.idx ?? index;
    const made = choice.startsWith(NEW);
    const kind = made ? (choice.slice(NEW.length) as 'term' | 'card') : null;
    try {
      const entityId = kind ? await createEntity(id, kind, '') : choice;
      await addExcerpt({ bookId: id, entityId, quote, at: span.start, chapterIdx });
      endSelection();
      if (kind) {
        // Nothing is named yet, so the page it lands on is where it gets its
        // name — with the passage already under it.
        await loadFilable(book?.kind);
        router.push(`/${kind}/${entityId}`);
        return;
      }
      flash(t('reader.added', { name: filable.find((one) => one.id === choice)?.name ?? '' }));
    } catch (error) {
      flash(String(error));
    }
  }

  /**
   * Keeping the selection as a word.
   *
   * The same word selected twice is the one entry, so an existing row is
   * opened rather than a second one written — a reader who marks a word in
   * chapter two and again in chapter forty means the one word, and two rows
   * would split its appearances and its notes between them.
   *
   * Punctuation comes off the ends. A selection almost always catches the
   * comma after the word or the quote mark before it, and `觥筹交错，` is not
   * a word the dictionary has heard of.
   */
  async function keepWord() {
    if (!range || !id) return;
    const wanted = wordIn(source.slice(range.start, range.end));
    if (!wanted) return;
    try {
      const already = await findEntityNamed(id, 'word', wanted);
      const wordId = already?.id ?? (await createEntity(id, 'word', wanted));
      endSelection();
      router.push(`/word/${wordId}`);
    } catch (error) {
      flash(String(error));
    }
  }

  /** The colour chosen last is the one the next highlight wants. */
  function remember(color: HighlightColor) {
    setSettings((was) => {
      const next = { ...was, highlight: color };
      void saveSettings(next);
      return next;
    });
  }

  /**
   * The swatches are the whole of highlighting now. Tapping one marks the
   * passage; tapping the colour it already carries takes the mark off, which
   * is what the Highlight button used to be for.
   */
  async function onColor(color: HighlightColor) {
    if (!range || !id) return;
    remember(color);
    const existing = annotationAt(marks, range);
    if (existing?.kind === 'highlight' && existing.color === color) {
      await removeAnnotation(existing.id);
    } else if (existing) await updateAnnotation(existing.id, { color });
    else await save(range, { kind: 'highlight', color });
    await refreshAnnotations();
    endSelection();
  }

  async function saveNote(body: string) {
    if (!noteFor || !id) return;
    const existing = annotationAt(marks, noteFor);
    if (existing) {
      await updateAnnotation(existing.id, { note: body || null, kind: body ? 'note' : 'highlight' });
    } else if (body) {
      await save(noteFor, { kind: 'note', color: settings.highlight, note: body });
    }
    await refreshAnnotations();
    setNoteFor(null);
    endSelection();
  }

  /** Takes the whole mark off — the highlight and whatever was written on it. */
  function confirmRemoveMark(span: Span) {
    const existing = annotationAt(marks, span);
    if (!existing) return;
    Alert.alert(t('notes.deleteConfirm'), undefined, [
      { text: t('settings.cancel'), style: 'cancel' },
      {
        text: t('settings.delete'),
        style: 'destructive',
        onPress: async () => {
          await removeAnnotation(existing.id);
          await refreshAnnotations();
          setNoteFor(null);
          endSelection();
        },
      },
    ]);
  }

  function save(span: Span, extra: { kind: 'highlight' | 'note'; color: string | null; note?: string }) {
    return addAnnotation({
      bookId: id!,
      chapterId: remote ? chapter?.id ?? null : null,
      start: span.start,
      end: span.end,
      quote: source.slice(span.start, span.end),
      ...fingerprint(text, span.start, span.end),
      ...extra,
    });
  }

  /**
   * What this page can do that isn't reading it. Ordered by how often it is
   * wanted: move within the book, then mark it up, then leave for a page that
   * is about what you are looking at.
   */
  function quoteFor(span: Span) {
    return {
      text: source.slice(span.start, span.end),
      title: book?.title ?? '',
      author: book?.author,
      chapter: chapter?.title.trim() || null,
      note: annotationAt(marks, span)?.note ?? null,
    };
  }

  function goToChapter(next: number, within = 0) {
    setIndex(next);
    endSelection();
    pendingScroll.current = within;
    const target = chapters[next];
    if (!id || !target) return;
    if (remote) {
      // Where you were is which chapter you were in; there is nothing finer.
      setOffset(next);
      saveProgress(id, next);
      return;
    }
    const landing = target.start + Math.round(within * (target.end - target.start));
    setOffset(landing);
    saveProgress(id, landing);
  }

  function pageBy(direction: -1 | 1) {
    const step = Math.max(120, viewport.current.layout - lineHeight * 2);
    const max = Math.max(0, viewport.current.content - viewport.current.layout);
    const current = scrolledY.current;
    const next = current + direction * step;
    // Stops at the chapter's own ends: changing chapter is a decision, not
    // something a tap near the margin does on your behalf.
    scrollRef.current?.scrollTo({ y: Math.min(max, Math.max(0, next)), animated: true });
  }

  const scrolledY = useRef(0);
  const whereScrolled = useCallback(() => scrolledY.current, []);
  const scrollPageTo = useCallback((y: number) => {
    scrollRef.current?.scrollTo({ y, animated: false });
  }, []);

  if (!book || !chapter) {
    return (
      <View style={[styles.center, { backgroundColor: palette.bg }]}>
        <ActivityIndicator />
      </View>
    );
  }


  // The selection bar replaces the reading controls rather than stacking on
  // top of them: both at once is two rows of buttons over the same thumb.
  const chromeOpacity = range ? 0 : chrome;

  const bodyStyle = {
    color: palette.text,
    fontSize: settings.fontSize,
    lineHeight,
    fontFamily: settings.serif ? (script === 'cjk' ? 'Songti SC' : 'Georgia') : undefined,
  };

  /** What this chapter is called, or the only thing left to call it by. */
  const heading = chapter.title.trim() || `${index + 1}`;

  /** In this chapter, in this language — or the words the book was written in. */
  const showing = !!target && ready.includes(target);


  function renderSentence(span: Span, useTarget: boolean) {
    const marked = annotationAt(marks, span);
    const active = range !== null && span.start >= range.start && span.end <= range.end;
    const flashing = flashAt !== null && flashAt >= span.start && flashAt < span.end;
    /**
     * A chapter is translated or it is not — that decision is made once, for
     * the whole chapter, before anything is drawn. So a sentence here never
     * has to stand in for a missing one: if a line somehow has no translation
     * it keeps its own words rather than a row of dots.
     */
    const body = useTarget ? page.sentences.get(span.start) : undefined;
    const shown = body || source.slice(span.start, span.end);
    const mark = marked?.color ? markOn(marked.color, settings.theme) : null;
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
          setChrome(!chromeShown.current);
        }}
        style={{
          backgroundColor: active || flashing ? palette.tint : mark?.bg ?? 'transparent',
          color: mark?.ink ?? palette.text,
        }}
      >
        {runsIn(shown).map((run, at) => (
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
        ))}
        {/* A full stop in Chinese is already a space wide; one more is a hole. */}
        {endsTight(shown) ? '' : ' '}
      </Text>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.bg }}>
      <View style={[styles.top, { paddingTop: insets.top }]} pointerEvents="box-none">
      <Animated.View
        style={[styles.bar, { opacity: chrome, backgroundColor: palette.bg }]}
        pointerEvents="box-none"
      >
        {/* The way out of every other page, drawn the same way here: the
            accent chevron at the header's own size, not a grey hint of one. */}
        <Pressable onPress={() => router.back()} style={styles.backButton} hitSlop={8}>
          <Text style={{ color: palette.accent, fontSize: 36, lineHeight: 40, fontWeight: '500' }}>
            ‹
          </Text>
        </Pressable>
        {/* The chapter's name is also the way out of it: tapping unfolds the
            wheels, so the bar answers "where am I" and "where to" in one place. */}
        <Pressable onPress={() => setJumpOpen((was) => !was)} style={styles.title} hitSlop={8}>
          <Text numberOfLines={1} style={{ color: palette.text, fontSize: 17, fontWeight: '600' }}>
            {heading}
          </Text>
          <Text style={{ color: palette.accent, fontSize: 24, lineHeight: 26 }}>
            {jumpOpen ? ' ▴' : ' ▾'}
          </Text>
        </Pressable>
        <View style={{ width: TOUCH }} />
      </Animated.View>

      {jumpOpen && !range ? (
        <JumpWheel
          chapters={chapters}
          index={index}
          palette={palette}
          onGo={(toIdx) => {
            setJumpOpen(false);
            goToChapter(toIdx, 0);
          }}
          onClose={() => setJumpOpen(false)}
        />
      ) : null}
      </View>

      <View
        style={{ flex: 1 }}
        onLayout={(event) => {
          const height = event.nativeEvent.layout.height;
          viewport.current.layout = height;
        }}
      >
        <Animated.ScrollView
          ref={scrollRef}
          /**
           * The system's own, after an attempt at a better one.
           *
           * The argument for drawing our own was that iOS would not let a
           * finger near the indicator. That has not been true for years: press
           * and hold it and it becomes a scrubber, which is the whole feature
           * the handle existed to provide — and the system's knows how to fade
           * itself, size itself to the content and flash on the way in without
           * any of it being written here.
           *
           * `white` on a night page: the default indicator is black, and black
           * on #121212 is a scroll bar nobody can see.
           */
          showsVerticalScrollIndicator
          indicatorStyle={settings.theme === 'night' ? 'white' : 'black'}
          contentContainerStyle={{
            paddingHorizontal: settings.margin,
            paddingTop: TOUCH + space.lg,
            paddingBottom: space.xxl * 3,
          }}
          // The thumb follows natively at every frame; the listener still only
          // runs as often as it did, which is all the saving needs.
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
            useNativeDriver: true,
            listener: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
              const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
              scrolledY.current = contentOffset.y;
              viewport.current = { content: contentSize.height, layout: layoutMeasurement.height };
              if (remote) return;
              const ratio = contentOffset.y / Math.max(1, contentSize.height - layoutMeasurement.height);
              const at = chapter.start + Math.round(Math.min(1, Math.max(0, ratio)) * (chapter.end - chapter.start));
              setOffset(at);
              if (id) saveProgress(id, at);
            },
          })}
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
            {/* The chapter's name where a printed book puts it: at the head
                of its own page, large, with air under it, scrolling away
                with the words. The bar carries it too and still should —
                that answers "where am I" from the middle of a chapter. This
                answers where the chapter begins, which is the question a
                book has always answered by setting the title and then
                leaving a gap. */}
            {paragraphs.length > 0 ? (
              <Text
                style={{
                  color: palette.text,
                  fontFamily: bodyStyle.fontFamily,
                  fontSize: Math.round(settings.fontSize * 1.7),
                  lineHeight: Math.round(settings.fontSize * 2.1),
                  fontWeight: '600',
                  marginBottom: lineHeight * 1.4,
                }}
              >
                {heading}
              </Text>
            ) : null}
            {/* A chapter nobody has translated yet, while the page is set to
                a language: it is shown in its own words, and says so rather
                than pretending the original is the translation. */}
            {settings.bilingual !== 'off' && !!target && !showing ? (
              <Text style={{ color: palette.dim, fontSize: settings.fontSize - 3, marginBottom: space.md }}>
                {t('reader.notTranslated', { language: labelFor(target) })}
              </Text>
            ) : null}
            {remote && fetching ? (
              <ActivityIndicator style={{ marginTop: space.xxl }} />
            ) : remote && remoteError ? (
              <Text style={{ color: palette.dim, marginTop: space.xxl, lineHeight: 24 }}>
                {t(`lookup.${remoteError}`)}
              </Text>
            ) : !remote && !text ? (
              <ActivityIndicator style={{ marginTop: space.xxl }} />
            ) : paragraphs.length === 0 ? (
              <Text style={{ color: palette.dim, marginTop: space.xxl }}>{t('reader.empty')}</Text>
            ) : (
              paragraphs.map((paragraph) => {
                const body = source.slice(
                  paragraph.start,
                  paragraph.sentences.at(-1)?.end ?? paragraph.start
                );
                const figure = imageIn(body);
                const inTarget = showing && settings.bilingual === 'target';
                const place = page.paragraphs.get(paragraph.start);
                const asParagraph = place?.text ?? '';
                // Its words are in the paragraph above, in the other language:
                // printing them here too is the same paragraph twice.
                if (inTarget && place?.kind === 'absorbed') return null;
                const code = figure ? null : codeBlockIn(body);
                if (code) {
                  return (
                    <Pressable
                      key={paragraph.start}
                      onPress={(event) => pressParagraph(paragraph, event)}
                      onLongPress={(event) => holdParagraph(paragraph, event)}
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
                /**
                 * Dragged selection, where the page is showing the book's own
                 * words. Not on a translated paragraph: what is drawn there is
                 * not what is in the file, so an offset into the glass is an
                 * offset into nothing.
                 *
                 * A read-only `TextInput` rather than a `Text`, because a
                 * `Text` will not tell JavaScript what was selected — iOS
                 * draws the handles and the menu and reports none of it. A
                 * `TextInput` reports `onSelectionChange`, keeps its nested
                 * `Text` children (so the bold, the code spans and the
                 * highlight colours all survive), and with `editable={false}`
                 * never raises the keyboard.
                 */
                const free = settings.freeSelect && !inTarget;
                if (free) {
                  const prefix = numberAt.has(paragraph.start)
                    ? `${numberAt.get(paragraph.start)}  `.length
                    : 0;
                  return (
                    <View key={paragraph.start} style={{ marginBottom: lineHeight * 0.6 }}>
                      <TextInput
                        editable={false}
                        multiline
                        scrollEnabled={false}
                        // The page scrolls; this must not try to.
                        textAlignVertical="top"
                        style={[bodyStyle, styles.freeText]}
                        onSelectionChange={(event: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
                          const { start, end } = event.nativeEvent.selection;
                          const origins = originsOf(prefix, paragraph.sentences, (span: Span) =>
                            source.slice(span.start, span.end)
                          );
                          const found = documentRange(origins, start, end);
                          // A caret is not a selection — see `documentRange`.
                          // Clearing on one is what makes a tap on the page
                          // put the menu away again.
                          setSelection(null);
                          setDragged(found);
                        }}
                      >
                        {numberAt.has(paragraph.start) ? (
                          <Text
                            style={{
                              color: palette.dim,
                              fontSize: Math.round(settings.fontSize * 0.62),
                              lineHeight,
                            }}
                          >
                            {numberAt.get(paragraph.start)}
                            {'  '}
                          </Text>
                        ) : null}
                        {paragraph.sentences.map((span) => renderSentence(span, false))}
                      </TextInput>
                    </View>
                  );
                }

                return (
                <Pressable
                  key={paragraph.start}
                  onPress={(event) => pressParagraph(paragraph, event)}
                  onLongPress={(event) => holdParagraph(paragraph, event)}
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
                        a word in the sentence it opens — so it is set off by
                        more than the space between two words. */}
                    {numberAt.has(paragraph.start) ? (
                      <Text
                        style={{
                          color: palette.dim,
                          fontSize: Math.round(settings.fontSize * 0.62),
                          lineHeight,
                        }}
                      >
                        {numberAt.get(paragraph.start)}
                        {'  '}
                      </Text>
                    ) : null}
                    {inTarget && place?.kind === 'paragraph'
                      ? asParagraph
                      : paragraph.sentences.map((span) => renderSentence(span, inTarget))}
                  </Text>
                  {/* Both languages read as two paragraphs, the way a bilingual
                      edition prints them — not as alternating lines. */}
                  {showing && settings.bilingual === 'both' && asParagraph ? (
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
                      {asParagraph}
                    </Text>
                  ) : null}
                </Pressable>
                );
              })
            )}
          </Pressable>

          {/* The end of the words is where the next chapter belongs — reached
              by finishing this one, not by a thumb near an edge. Part of the
              page, so it scrolls away with the text rather than hovering. */}
          {paragraphs.length > 0 ? (
            <View style={styles.ends}>
              <Text style={{ color: palette.dim, fontSize: 13, textAlign: 'center' }}>
                {t('reader.endOfChapter', { name: heading })}
              </Text>
              <View style={styles.endButtons}>
                {index > 0 ? (
                  <Pressable
                    onPress={() => goToChapter(index - 1, 0)}
                    style={[styles.endButton, { borderColor: palette.tint }]}
                  >
                    <Text numberOfLines={1} style={{ color: palette.accent, fontSize: 15 }}>
                      ‹  {t('reader.prevChapter')}
                    </Text>
                  </Pressable>
                ) : null}
                {index < chapters.length - 1 ? (
                  <Pressable
                    onPress={() => goToChapter(index + 1, 0)}
                    style={[styles.endButton, { borderColor: palette.tint, backgroundColor: palette.tint }]}
                  >
                    <Text numberOfLines={1} style={{ color: palette.accent, fontSize: 15, fontWeight: '600' }}>
                      {t('reader.nextChapter')}  ›
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ) : null}
        </Animated.ScrollView>

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

      {range ? null : (
      <Animated.View
        style={[
          styles.footer,
          {
            opacity: chromeOpacity,
            backgroundColor: palette.bg,
            // Clear of the home indicator, the way the selection bar is.
            paddingBottom: Math.max(insets.bottom, space.md),
          },
        ]}
        pointerEvents={range ? 'none' : 'box-none'}
      >
        <View style={styles.controls}>
          {/* Turning a chapter lives on the bar after all. It was at the end of
              the words and on the title's wheel, which is right when you have
              finished reading one and wrong when you have not — a book read a
              chapter at a time is turned far more often than its type is
              resized. The two of them take the outer columns, where either
              thumb already rests; the ends of the book keep their place in the
              row rather than letting the others slide sideways. */}
          <Pressable
            onPress={() => index > 0 && goToChapter(index - 1, 0)}
            disabled={index === 0}
            style={[styles.barItem, { opacity: index === 0 ? 0.25 : 1 }]}
          >
            <Text style={[styles.arrow, { color: palette.text }]}>←</Text>
            <Text style={[styles.barLabel, { color: palette.dim }]}>{t('reader.prevShort')}</Text>
          </Pressable>
          <Pressable onPress={() => setSettingsOpen(true)} style={styles.barItem}>
            <Text style={{ color: palette.text, fontSize: 19, lineHeight: 23 }}>Aa</Text>
            <Text style={[styles.barLabel, { color: palette.dim }]}>{t('reader.textSettings')}</Text>
          </Pressable>
          {/* The page of the original, where the book came from one and the
              reader has linked it. Greyed until then rather than hidden: it
              is the only place that says the original can be linked at all,
              and a book converted from a PDF is exactly the book somebody
              will want it for. */}
          {onPage !== null ? (
            <Pressable
              onPress={() => book.origin_path && setShowingOriginal(true)}
              disabled={!book.origin_path}
              style={[styles.barItem, { opacity: book.origin_path ? 1 : 0.35 }]}
            >
              <Text style={{ color: palette.text, fontSize: 15, lineHeight: 23 }}>
                {onPage}
              </Text>
              <Text style={[styles.barLabel, { color: palette.dim }]}>
                {t('reader.originalShort')}
              </Text>
            </Pressable>
          ) : null}
          {/* This chapter's own page: its brief, who is in it, its notes and
              everything that can be made of it — and the way to the book, now
              that no menu holds one. */}
          {chapter ? (
            <Pressable
              onPress={() => router.push(`/chapter/${chapter.id}`)}
              style={styles.barItem}
            >
              <Text
                style={{
                  color: palette.text,
                  fontSize: 19,
                  lineHeight: 23,
                }}
              >
                ▤
              </Text>
              <Text style={[styles.barLabel, { color: palette.dim }]}>
                {t('reader.thisChapter')}
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => index < chapters.length - 1 && goToChapter(index + 1, 0)}
            disabled={index >= chapters.length - 1}
            style={[styles.barItem, { opacity: index >= chapters.length - 1 ? 0.25 : 1 }]}
          >
            <Text style={[styles.arrow, { color: palette.text }]}>→</Text>
            <Text style={[styles.barLabel, { color: palette.dim }]}>{t('reader.nextShort')}</Text>
          </Pressable>
        </View>
      </Animated.View>
      )}

      {range && (
        <SentenceMenu
          dark={settings.theme === 'night'}
          dismissLabel={t('reader.done')}
          activeColor={selected?.color ?? settings.highlight}
          onColor={onColor}
          onDismiss={endSelection}
          actions={[
            { key: 'copy', label: t('reader.copy'), onPress: onCopy },
            {
              key: 'note',
              label: t('reader.note'),
              // The selection stays while the sheet is open: backing out of a
              // note is a change of mind about the note, not about the words.
              onPress: () => setNoteFor(range!),
            },
            ...(canKeepWord
              ? [
                  {
                    key: 'word',
                    // Short selections only. The option is for a word, a
                    // phrase or a turn of speech; offered over two paragraphs
                    // it is a promise the word page cannot keep.
                    label: t('reader.word'),
                    onPress: () => void keepWord(),
                  },
                ]
              : []),
            ...(canAdd
              ? [
                  {
                    key: 'add',
                    label: t('reader.addTo'),
                    // The selection stays while the sheet is open, the way it
                    // does for a note: backing out is a change of mind about
                    // where it goes, not about the words.
                    onPress: () => setAddingTo(range!),
                  },
                ]
              : []),
          ]}
        />
      )}

      <PickerSheet
        visible={addingTo !== null}
        title={t('reader.addTitle')}
        searchPlaceholder={t('reader.addSearch')}
        options={[
          ...(supports(book?.kind, 'cards')
            ? [{ id: `${NEW}card`, label: t('reader.newCard') }]
            : []),
          ...(supports(book?.kind, 'terms')
            ? [{ id: `${NEW}term`, label: t('reader.newTerm') }]
            : []),
          ...filable.map((one) => ({
            id: one.id,
            label: one.name || t(one.kind === 'card' ? 'card.frontPlaceholder' : 'term.name'),
            detail: t(one.kind === 'card' ? 'card.eyebrow' : 'term.eyebrow'),
          })),
        ]}
        onPick={addInto}
        onClose={() => setAddingTo(null)}
      />

      {showingOriginal && book.origin_path && onPage !== null ? (
        <OriginalPage
          file={book.origin_path}
          page={onPage}
          onClose={() => setShowingOriginal(false)}
        />
      ) : null}

      <ReadingSettingsSheet
        visible={settingsOpen}
        settings={settings}
        targets={targets}
        ready={ready}
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
        quote={noteFor ? source.slice(noteFor.start, noteFor.end) : ''}
        note={noteFor ? annotationAt(marks, noteFor)?.note ?? null : null}
        onSave={saveNote}
        // Nothing to delete on a passage that has never been marked.
        onDelete={
          noteFor && annotationAt(marks, noteFor) ? () => confirmRemoveMark(noteFor) : undefined
        }
        onClose={() => setNoteFor(null)}
      />

      <PickerSheet
        visible={shareFor !== null}
        title={t('reader.share')}
        options={[
          { id: 'copy', label: t('reader.copy'), detail: t('reader.copyHint') },
          { id: 'text', label: t('reader.shareText') },
          { id: 'card', label: t('reader.shareCard'), detail: t('reader.shareCardHint') },
        ]}
        onPick={async (choice) => {
          const span = shareFor;
          setShareFor(null);
          if (!span) return;
          try {
            if (choice === 'copy') await onCopy();
            else if (choice === 'text') await shareQuoteText(quoteFor(span));
            else await shareQuoteCard(quoteFor(span), settings.theme, settings.serif);
          } catch (error) {
            flash(String(error));
          }
          // Done with the words, whichever way they left.
          endSelection();
        }}
        onClose={() => setShareFor(null)}
      />


      <Toast message={toast} />
    </SafeAreaView>
  );
}


const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  /**
   * Over the page, not above it. As a row in the column its height stayed
   * reserved at zero opacity, leaving a band of bare background across the top
   * that read as a bar which had not quite gone — the same fault the footer
   * had.
   */
  top: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2 },

  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
  },
  /** The widest thing on the bar, because it is the one you read and the one
   *  you press — a chapter's name is long and deserves the room. */
  title: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: TOUCH,
  },
  /**
   * Every control in the bar is a full touch target, not a glyph with hitSlop
   * around it: a 44pt square is the size a thumb actually hits, and on a bar
   * that fades while you read there is no second chance at a near miss.
   */
  barButton: { width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center' },
  /** The back chevron carries a header's worth of weight, so it gets the room. */
  backButton: { width: TOUCH + 8, height: TOUCH + 8, alignItems: 'center', justifyContent: 'center' },
  /**
   * A control on the reading bar is a glyph with its name under it, the way a
   * tab bar is: three of them share the width evenly, so each is a wide target
   * rather than a 44pt square with a symbol to be interpreted.
   */
  barItem: { flex: 1, minHeight: TOUCH, alignItems: 'center', justifyContent: 'center' },
  /** An arrow, not the header's chevron: leaving the reader and turning a
   *  chapter inside it are different moves and should not wear one mark. Set
   *  at the weight `Aa` is drawn at, or a hairline stroke beside two solid
   *  glyphs reads as the one that is switched off. */
  arrow: { fontSize: 23, lineHeight: 23, fontWeight: '600' },
  barLabel: { fontSize: 11, marginTop: 1 },
  zone: { position: 'absolute', top: 0, bottom: 0 },
  /** Set well below the last line: a button touching the text is a button hit
   *  by the scroll that was meant to read the end of it. */
  ends: { marginTop: space.xxl * 2, gap: space.md },
  endButtons: { flexDirection: 'row', gap: space.md, justifyContent: 'center' },
  endButton: {
    flex: 1,
    maxWidth: 220,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingVertical: space.md + 2,
    alignItems: 'center',
  },
  /** Code is set apart by a rule, not a box: a box on a reading page is a form. */
  code: { borderLeftWidth: 2, paddingLeft: space.md, paddingVertical: space.xs },
  /**
   * Over the page, not beside it. As a row in the column its height stayed
   * reserved even at zero opacity, leaving a strip of bare background under
   * the text that read as a bar that had not quite gone.
   */
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: space.sm },
  /** A `TextInput` brings padding and a minimum height of its own; a
      paragraph of a book wants neither. */
  freeText: { padding: 0, margin: 0 },
  /** Three equal columns: the outer two fall under either thumb. */
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.sm,
  },
});

/** How long a thing can be and still be a word, a phrase or an expression. */
const LONGEST_WORD = 48;

/**
 * The word inside a selection, or nothing if the selection is a passage.
 *
 * Quotation marks, brackets and the comma that ends the clause come off both
 * ends; what is inside is left alone, because a hyphen, an apostrophe and a
 * full stop are all parts of words — `well-meaning`, `don't`, `std::vector`.
 */
function wordIn(selected: string): string {
  const once = selected.replace(/\s+/g, ' ').trim();
  const trimmed = once
    .replace(/^[\s"'“”‘’（(「『【\[—–-]+/u, '')
    .replace(/[\s"'“”‘’）)」』】\].,;:!?。，、；：！？…—–]+$/u, '')
    .trim();
  if (!trimmed || trimmed.length > LONGEST_WORD) return '';
  // A sentence is not a phrase, however short. A full stop in the middle of
  // what was selected is the clearest sign one was.
  if (/[.。!！?？;；]\s*\S/u.test(trimmed)) return '';
  return trimmed;
}
