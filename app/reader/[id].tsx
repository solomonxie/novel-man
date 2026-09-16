import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
  addHighlight,
  getBook,
  getDocumentText,
  getProgress,
  listAnnotations,
  listChapters,
  removeAnnotation,
  saveProgress,
  type Annotation,
  type Book,
  type Chapter,
} from '../../src/db/repo';
import { annotationAt, layoutChapter, progressWithin } from '../../src/reader/model';
import type { Span } from '../../src/text/segment';
import { scriptOf } from '../../src/text/language';
import { highlightColors, lineHeightFor, readingThemes, space, type ReadingTheme } from '../../src/theme';

const FONT_SIZE = 18;
const MENU_HEIGHT = 46;

export default function Reader() {
  const { id, chapter: chapterParam } = useLocalSearchParams<{ id: string; chapter?: string }>();
  const { t } = useTranslation();
  const { height } = useWindowDimensions();

  const [book, setBook] = useState<Book | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [text, setText] = useState('');
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [index, setIndex] = useState(0);
  const [theme, setTheme] = useState<ReadingTheme>('paper');
  const [selection, setSelection] = useState<{ span: Span; y: number } | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [loadedBook, loadedChapters, loadedText, loadedAnnotations, offset] = await Promise.all([
        getBook(id),
        listChapters(id),
        getDocumentText(id),
        listAnnotations(id),
        getProgress(id),
      ]);
      setBook(loadedBook);
      setChapters(loadedChapters);
      setText(loadedText);
      setAnnotations(loadedAnnotations);
      const requested = chapterParam ? Number(chapterParam) : null;
      const resumed = loadedChapters.findIndex((c) => offset >= c.start && offset < c.end);
      setIndex(requested ?? (resumed >= 0 ? resumed : 0));
    })();
  }, [id, chapterParam]);

  const chapter = chapters[index];
  const language = book?.language ?? 'en';
  const paragraphs = useMemo(
    () => (chapter && text ? layoutChapter(text, chapter, language) : []),
    [chapter, text, language]
  );

  const palette = readingThemes[theme];
  const lineHeight = lineHeightFor(scriptOf(language), FONT_SIZE);

  const flash = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 1200);
  }, []);

  function openMenu(span: Span, event: GestureResponderEvent) {
    setSelection({ span, y: event.nativeEvent.pageY });
  }

  async function onCopy() {
    if (!selection) return;
    await Clipboard.setStringAsync(text.slice(selection.span.start, selection.span.end));
    setSelection(null);
    flash(t('reader.copied'));
  }

  async function onHighlight() {
    if (!selection || !id) return;
    const existing = annotationAt(annotations, selection.span);
    if (existing) {
      await removeAnnotation(existing.id);
    } else {
      await addHighlight({
        bookId: id,
        start: selection.span.start,
        end: selection.span.end,
        quote: text.slice(selection.span.start, selection.span.end),
        color: highlightColors[0],
      });
    }
    setAnnotations(await listAnnotations(id));
    setSelection(null);
  }

  function goToChapter(next: number) {
    setIndex(next);
    setListOpen(false);
    setSelection(null);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    const target = chapters[next];
    if (id && target) saveProgress(id, target.start);
  }

  if (!book || !chapter) {
    return (
      <View style={[styles.centre, { backgroundColor: palette.bg }]}>
        <ActivityIndicator />
      </View>
    );
  }

  const menuAbove = selection ? selection.y - MENU_HEIGHT - 12 : 0;
  const menuFlipped = menuAbove < 80;
  const existing = selection ? annotationAt(annotations, selection.span) : undefined;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.bg }}>
      <View style={styles.bar}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={{ color: palette.dim, fontSize: 20 }}>‹</Text>
        </Pressable>
        <Text numberOfLines={1} style={{ color: palette.dim, fontSize: 13, flex: 1, textAlign: 'center' }}>
          {chapter.title.trim() || `${index + 1}`}
        </Text>
        <Pressable onPress={() => setTheme(nextTheme(theme))} hitSlop={12}>
          <Text style={{ color: palette.dim, fontSize: 16 }}>{theme === 'night' ? '☾' : '☀'}</Text>
        </Pressable>
        <Pressable onPress={() => setListOpen(true)} hitSlop={12} style={{ marginLeft: space.lg }}>
          <Text style={{ color: palette.dim, fontSize: 16 }}>≡</Text>
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingHorizontal: space.xl, paddingBottom: space.xxl * 2 }}
        onScroll={(event) => {
          const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
          const ratio = contentOffset.y / Math.max(1, contentSize.height - layoutMeasurement.height);
          if (id) {
            saveProgress(id, chapter.start + Math.round(ratio * (chapter.end - chapter.start)));
          }
        }}
        scrollEventThrottle={400}
      >
        {paragraphs.length === 0 ? (
          <Text style={{ color: palette.dim, marginTop: space.xxl }}>{t('reader.empty')}</Text>
        ) : (
          paragraphs.map((paragraph) => (
            <Text
              key={paragraph.start}
              style={{ color: palette.text, fontSize: FONT_SIZE, lineHeight, marginBottom: lineHeight * 0.6 }}
            >
              {paragraph.sentences.map((span) => {
                const highlighted = annotationAt(annotations, span);
                const active = selection?.span.start === span.start;
                return (
                  <Text
                    key={span.start}
                    onPress={(event) => openMenu(span, event)}
                    style={{
                      backgroundColor: active
                        ? palette.tint
                        : highlighted?.color ?? 'transparent',
                    }}
                  >
                    {text.slice(span.start, span.end)}{' '}
                  </Text>
                );
              })}
            </Text>
          ))
        )}
      </ScrollView>

      {selection && (
        <>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSelection(null)} />
          <View
            style={[
              styles.menu,
              {
                backgroundColor: theme === 'night' ? '#2A2A2E' : '#2B2B2F',
                top: menuFlipped ? Math.min(selection.y + 28, height - 120) : menuAbove,
              },
            ]}
          >
            <MenuItem label={t('reader.copy')} onPress={onCopy} />
            <MenuItem
              label={existing ? t('reader.unhighlight') : t('reader.highlight')}
              onPress={onHighlight}
            />
            <MenuItem label={t('reader.note')} onPress={() => flash(t('settings.notBuilt'))} />
            <MenuItem label={t('reader.share')} onPress={() => flash(t('settings.notBuilt'))} />
          </View>
        </>
      )}

      <View style={styles.footer}>
        <Text style={{ color: palette.dim, fontSize: 11 }}>
          {chapter.title.trim() || `${index + 1}`}
        </Text>
        <Text style={{ color: palette.dim, fontSize: 11 }}>
          {t('reader.progress', {
            percent: Math.round(((index + progressWithin(chapter, chapter.start)) / chapters.length) * 100),
          })}
        </Text>
      </View>

      <Modal visible={listOpen} animationType="slide" onRequestClose={() => setListOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: palette.bg }}>
          <View style={styles.bar}>
            <Pressable onPress={() => setListOpen(false)} hitSlop={12}>
              <Text style={{ color: palette.dim, fontSize: 20 }}>✕</Text>
            </Pressable>
            <Text style={{ color: palette.text, fontSize: 15, flex: 1, textAlign: 'center' }}>
              {t('reader.chapterList')}
            </Text>
            <View style={{ width: 20 }} />
          </View>
          <ScrollView>
            {chapters.map((entry) => (
              <Pressable
                key={entry.id}
                onPress={() => goToChapter(entry.idx)}
                style={{ paddingHorizontal: space.xl, paddingVertical: space.md }}
              >
                <Text style={{ color: entry.idx === index ? palette.text : palette.dim, fontSize: 15 }}>
                  {entry.idx + 1}  {entry.title.trim() || '—'}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
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

function MenuItem({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ paddingHorizontal: space.md, paddingVertical: space.sm }}>
      <Text style={{ color: '#FFFFFF', fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

function nextTheme(theme: ReadingTheme): ReadingTheme {
  const order: ReadingTheme[] = ['paper', 'sepia', 'grey', 'night'];
  return order[(order.indexOf(theme) + 1) % order.length];
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  menu: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    borderRadius: 10,
    height: MENU_HEIGHT,
    alignItems: 'center',
    paddingHorizontal: space.xs,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: space.xl,
    paddingBottom: space.xs,
  },
  toast: {
    position: 'absolute',
    bottom: 64,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: 16,
  },
});
