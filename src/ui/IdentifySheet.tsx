import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { updateBook, type Book } from '../db/repo';
import { keepCoverFrom } from '../books/save';
import { CatalogsUnreachable, findBook, fillFromEdition, type Candidate } from '../sources/identify';
import { useKeyboardHeight } from './keyboard';
import { useDragDismiss } from './dismiss';
import { Grabber } from './primitives';
import { radius, space, usePalette } from '../theme';

/** Ten is what fits in a glance without becoming a list to read. */
const LIMIT = 10;
const PER_ROW = 3;
/** Every cover ever printed is about this shape. */
const COVER_RATIO = 1.5;

/**
 * Which book this is, answered by the catalogs rather than by a model. The
 * covers are the point of the grid — a cover is recognised in a way a title
 * and a year are not, so the row somebody wants is found by looking rather
 * than by reading — but choosing one fills the record: the title as it is
 * printed, the author, the year, the ISBN, and the picture.
 *
 * It searches on whatever is there. A title alone is a search; an ISBN is a
 * lookup with one right answer; an author narrows it and is never required,
 * because the book somebody half-remembers is exactly the one with no author
 * typed in yet.
 */
export function IdentifySheet({ visible, book, onClose, onFilled }: {
  visible: boolean;
  book: Book;
  onClose: () => void;
  onFilled: () => void;
}) {
  const { t } = useTranslation();
  const palette = usePalette();
  const { width, height } = useWindowDimensions();
  const keyboard = useKeyboardHeight();
  const drag = useDragDismiss(() => leave(onClose));
  const appear = useRef(new Animated.Value(0)).current;

  const [query, setQuery] = useState('');
  const [found, setFound] = useState<Candidate[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [filling, setFilling] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const search = useCallback(async (asked: string) => {
    if (!asked.trim()) return;
    Keyboard.dismiss();
    setBusy(true);
    setFailure(null);
    try {
      setFound(await findBook(asked, LIMIT));
    } catch (problem) {
      setFailure(problem instanceof CatalogsUnreachable ? t('identify.unreachable') : String(problem));
      setFound([]);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    appear.setValue(0);
    Animated.timing(appear, {
      toValue: 1,
      duration: 140,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
    // What the shelf already knows is the best question it can ask. The ISBN
    // where there is one, because that is the only form of this question with
    // a single right answer.
    const opening = book.isbn?.trim() || [book.title, book.author].filter(Boolean).join(' ');
    setQuery(opening);
    setFound(null);
    setFailure(null);
    void search(opening);
  }, [appear, book.author, book.isbn, book.title, search, visible]);

  if (!visible) return null;

  function leave(then?: () => void) {
    Keyboard.dismiss();
    Animated.timing(appear, {
      toValue: 0,
      duration: 120,
      easing: Easing.in(Easing.quad),
      useNativeDriver: false,
    }).start(() => then?.());
  }

  /**
   * What a pick writes. Everything the catalog is sure of, because picking a
   * row *is* the confirmation — the reader looked at the cover and said that
   * one. The summary is the exception: a blurb replaces nothing somebody wrote
   * themselves, so it only fills an empty field.
   */
  async function choose(candidate: Candidate) {
    setFilling(candidate.id);
    try {
      const full = await fillFromEdition(candidate);
      // The big one, then the one that was already on screen. Google serves
      // its sizes off one address and not every book has every size, so a
      // large that 404s must not cost the cover the reader just pointed at.
      const key = `${book.id}-${Date.now().toString(36)}`;
      const path =
        (full.cover ? await keepCoverFrom(full.cover, key) : null) ??
        (full.thumb && full.thumb !== full.cover ? await keepCoverFrom(full.thumb, key) : null);
      await updateBook(book.id, {
        title: full.title,
        ...(full.author ? { author: full.author } : {}),
        ...(full.year ? { year: full.year } : {}),
        ...(full.isbn ? { isbn: full.isbn } : {}),
        ...(path ? { cover_path: path } : {}),
        ...(full.summary && !book.summary?.trim() ? { summary: full.summary } : {}),
      });
      onFilled();
      leave(onClose);
    } catch (problem) {
      setFailure(String(problem));
    } finally {
      setFilling(null);
    }
  }

  const tile = Math.floor((width - space.lg * 2 - space.md * (PER_ROW - 1)) / PER_ROW);

  return (
    <Modal visible transparent animationType="none" onRequestClose={() => leave(onClose)}>
      <View style={StyleSheet.absoluteFill}>
        <Animated.View
          style={[StyleSheet.absoluteFill, { backgroundColor: palette.scrim, opacity: appear }]}
        />
        <Pressable style={StyleSheet.absoluteFill} onPress={() => leave(onClose)} />

        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: palette.surface,
              borderColor: palette.border,
              maxHeight: height * 0.82,
              // It stays put and shortens instead: a sheet this tall, lifted
              // by a keyboard, leaves the screen at the top.
              paddingBottom: keyboard ? keyboard + space.md : space.xxl,
              opacity: appear,
              transform: [
                {
                  translateY: Animated.add(
                    appear.interpolate({ inputRange: [0, 1], outputRange: [28, 0] }),
                    drag.translateY
                  ),
                },
              ],
            },
          ]}
        >
          <View {...drag.handlers}>
            <Grabber />
            <View style={styles.head}>
            <Pressable onPress={() => leave(onClose)} hitSlop={12}>
              <Text style={{ color: palette.accent, fontSize: 16 }}>{t('settings.cancel')}</Text>
            </Pressable>
            <Text style={{ color: palette.text, fontSize: 15, fontWeight: '600' }}>
              {t('identify.title')}
            </Text>
            {/* The row that balances Cancel. Searching again is the same
                button as searching, so there is nothing else to put here. */}
            <Pressable onPress={() => search(query)} hitSlop={12} disabled={!query.trim()}>
              <Text style={{ color: query.trim() ? palette.accent : palette.faint, fontSize: 16 }}>
                {t('identify.search')}
              </Text>
            </Pressable>
            </View>
          </View>

          <View style={[styles.field, { borderColor: palette.border, backgroundColor: palette.bg }]}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t('identify.placeholder')}
              placeholderTextColor={palette.faint}
              style={{ flex: 1, color: palette.text, fontSize: 16 }}
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={() => search(query)}
            />
          </View>

          <Text style={{ color: palette.faint, fontSize: 12, marginTop: space.sm }}>
            {t('identify.what')}
          </Text>

          {busy ? (
            <View style={styles.center}><ActivityIndicator /></View>
          ) : failure ? (
            <Text style={{ color: palette.danger, fontSize: 14, marginTop: space.lg }}>
              {t('identify.failed', { error: failure })}
            </Text>
          ) : found && found.length === 0 ? (
            <Text style={{ color: palette.dim, fontSize: 14, marginTop: space.lg }}>
              {t('identify.none')}
            </Text>
          ) : (
            <ScrollView
              style={{ marginTop: space.md }}
              contentContainerStyle={styles.grid}
              keyboardShouldPersistTaps="handled"
            >
              {/* Ten rows, by definition — a `.map` with a ceiling. */}
              {(found ?? []).map((candidate) => (
                <Pressable
                  key={candidate.id}
                  onPress={() => choose(candidate)}
                  disabled={filling !== null}
                  style={{ width: tile, opacity: filling && filling !== candidate.id ? 0.4 : 1 }}
                >
                  <View
                    style={[
                      styles.thumb,
                      {
                        width: tile,
                        height: Math.round(tile * COVER_RATIO),
                        backgroundColor: palette.sunken,
                        borderColor: palette.border,
                      },
                    ]}
                  >
                    {candidate.thumb ? (
                      <Image
                        source={{ uri: candidate.thumb }}
                        style={{ width: tile, height: Math.round(tile * COVER_RATIO) }}
                        resizeMode="cover"
                      />
                    ) : (
                      <Text style={{ color: palette.faint, fontSize: 11, padding: space.sm }}>
                        {t('identify.noCover')}
                      </Text>
                    )}
                    {filling === candidate.id ? (
                      <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: palette.scrim }]}>
                        <ActivityIndicator />
                      </View>
                    ) : null}
                  </View>
                  <Text numberOfLines={2} style={{ color: palette.text, fontSize: 12, marginTop: space.xs }}>
                    {candidate.title}
                  </Text>
                  <Text numberOfLines={1} style={{ color: palette.dim, fontSize: 11 }}>
                    {[candidate.author, candidate.year].filter(Boolean).join(' · ') || ' '}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: space.lg,
    paddingBottom: space.xxl,
  },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, paddingBottom: space.lg },
  thumb: {
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { alignItems: 'center', justifyContent: 'center', padding: space.xl },
});
