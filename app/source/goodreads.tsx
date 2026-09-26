import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from '../../src/navigation/router';
import { useTranslation } from 'react-i18next';

import { booksFromExport, fetchShelf, parseFeedUrl, type Shelved } from '../../src/sources/goodreads';
import {
  feedUrlFor,
  forgetShelf,
  rememberShelf,
  savedShelves,
  type SavedShelf,
} from '../../src/sources/goodreadsProfiles';
import { keepShelved, type KeptCount } from '../../src/books/save';
import { pickSpreadsheet } from '../../src/import/sources/picker';
import { File } from '../../src/storage/fs';
import { DEFAULT_KIND } from '../../src/books/kinds';
import { Hint, Row, Section } from '../../src/ui/primitives';
import { radius, space, usePalette } from '../../src/theme';

/**
 * Bringing a library over from Goodreads. Their API was retired in 2020, so
 * there is no live sync to offer and no point pretending otherwise — what they
 * still hand their own users is an export of everything and an RSS feed per
 * shelf, and between them those carry the ratings, the reviews and the shelves,
 * which is the whole of what this app wants and no catalog has.
 *
 * Nothing is added until the file has been read and counted. An import that
 * says "912 books, 460 rated" before it runs is one somebody can say no to.
 */
export default function ImportFromGoodreads() {
  const { kind } = useLocalSearchParams<{ kind?: string }>();
  const { t, i18n } = useTranslation();
  const palette = usePalette();
  const [books, setBooks] = useState<Shelved[] | null>(null);
  const [from, setFrom] = useState<string>('');
  const [feed, setFeed] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedShelf[]>([]);
  const page = useRef<ScrollView>(null);
  /** Where the count lands, so reading a shelf can put it in front of you. */
  const foundY = useRef(0);

  /**
   * A result three screens below a keyboard is a result nobody sees. Reading a
   * shelf is the end of the typing, so the keyboard goes and the page moves to
   * what it found.
   */
  function reveal() {
    requestAnimationFrame(() =>
      page.current?.scrollTo({ y: Math.max(0, foundY.current - space.lg), animated: true })
    );
  }
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [kept, setKept] = useState<KeptCount | null>(null);

  async function readExport() {
    Keyboard.dismiss();
    setError(null);
    try {
      const picked = await pickSpreadsheet();
      if (!picked) return;
      setBusy(true);
      const csv = await new File(picked.uri).text();
      const found = booksFromExport(csv);
      if (!found.length) {
        setError(t('gr.notAnExport'));
        return;
      }
      setBooks(found);
      setFrom(picked.name);
      setKept(null);
      reveal();
    } catch (problem) {
      setError(String(problem));
    } finally {
      setBusy(false);
    }
  }

  const loadSaved = useCallback(() => {
    savedShelves().then(setSaved).catch(() => undefined);
  }, []);

  useFocusEffect(loadSaved);

  async function readFeed(address = feed) {
    Keyboard.dismiss();
    setError(null);
    const parsed = parseFeedUrl(address);
    if (!parsed) {
      setError(t('gr.notAFeed'));
      return;
    }
    setBusy(true);
    try {
      const { books: found, owner } = await fetchShelf(address, (count) =>
        setProgress({ done: count, total: count })
      );
      if (!found.length) {
        setError(t('gr.emptyFeed'));
        return;
      }
      setBooks(found);
      setFrom(owner ?? t('gr.fromFeed'));
      setKept(null);
      // Remembered once it has actually answered, and by number rather than by
      // the address that was pasted — see `goodreadsProfiles`.
      await rememberShelf({
        id: parsed.id,
        name: owner ?? parsed.id,
        shelf: parsed.shelf,
        books: found.length,
        at: Date.now(),
      });
      loadSaved();
      reveal();
    } catch {
      setError(t('gr.feedFailed'));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function bringOver() {
    if (!books) return;
    setBusy(true);
    setError(null);
    try {
      const count = await keepShelved(books, kind ?? DEFAULT_KIND, (done, total) =>
        setProgress({ done, total })
      );
      setKept(count);
    } catch (problem) {
      setError(String(problem));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  const rated = books?.filter((book) => book.stars !== null).length ?? 0;
  const reviewed = books?.filter((book) => book.review).length ?? 0;
  const read = books?.filter((book) => book.status === 'read').length ?? 0;
  const wanted = books?.filter((book) => book.status === 'wishlist').length ?? 0;

  return (
    <ScrollView
      ref={page}
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      <Stack.Screen options={{ title: t('source.goodreads'), headerBackTitle: ' ' }} />

      <Hint>{t('gr.noApi')}</Hint>

      {/* The link first. It is the one people already have — copied out of the
          address bar of the profile they are looking at — and it can be read
          again every time the shelves change. */}
      <Section title={t('gr.feedTitle')}>
        <Row label={t('gr.feedRow')} detail={t('gr.feedWhy')} last />
        <View style={[styles.box, { borderColor: palette.border }]}>
          <TextInput
            value={feed}
            onChangeText={setFeed}
            placeholder="https://www.goodreads.com/user/show/…"
            placeholderTextColor={palette.faint}
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.input, { color: palette.text, borderColor: palette.border }]}
          />
          <Text style={{ color: palette.dim, fontSize: 12 }}>{t('gr.feedHint')}</Text>
          <Pressable onPress={busy ? undefined : () => void readFeed()} style={styles.act}>
            {busy ? (
              <ActivityIndicator />
            ) : (
              <Text style={{ color: palette.accent, fontSize: 16 }}>{t('gr.readFeed')}</Text>
            )}
          </Pressable>
        </View>
      </Section>

      {/* Read once, offered forever after. The shelves someone actually
          keeps are a short list, and finding the link again is the only hard
          part of a job they will do more than once. */}
      {saved.length > 0 ? (
        <Section title={t('gr.savedTitle')}>
          {saved.map((entry, index) => (
            <Row
              key={`${entry.id}-${entry.shelf ?? ''}`}
              label={entry.name}
              detail={t('gr.savedWhen', {
                count: entry.books,
                date: new Date(entry.at).toLocaleDateString(i18n.language),
              })}
              value={busy ? undefined : t('gr.savedRead')}
              busy={busy && from === entry.name}
              onPress={
                busy
                  ? undefined
                  : () => {
                      const url = feedUrlFor(entry);
                      setFeed(url);
                      void readFeed(url);
                    }
              }
              onLongPress={() => {
                Alert.alert(entry.name, t('gr.savedForget'), [
                  { text: t('settings.cancel'), style: 'cancel' },
                  {
                    text: t('settings.delete'),
                    style: 'destructive',
                    onPress: () => void forgetShelf(entry).then(loadSaved),
                  },
                ]);
              }}
              last={index === saved.length - 1}
            />
          ))}
        </Section>
      ) : null}

      {/* The export file second, because it is the fallback: a download, an
          email and an attachment. It is what answers a private profile, and it
          carries the couple of things the feed leaves out. A card would say it
          weighs the same as the link above it, which it does not. */}
      <Pressable onPress={busy ? undefined : readExport} style={styles.link}>
        {busy && !progress ? (
          <ActivityIndicator />
        ) : (
          <Text style={{ color: palette.accent, fontSize: 17 }}>{t('gr.exportTitle')}</Text>
        )}
      </Pressable>
      <Hint>{t('gr.how1')}</Hint>

      {error ? (
        <Text style={{ color: palette.danger, fontSize: 14, marginTop: space.md }}>{error}</Text>
      ) : null}

      {/* What was found, before anything is written. */}
      {books ? (
        <View onLayout={(event) => { foundY.current = event.nativeEvent.layout.y; }}>
        <Section title={t('gr.found', { count: books.length })}>
          {from ? <Row label={t('gr.foundFrom', { name: from })} /> : null}
          <Row label={t('gr.rated')} value={`${rated}`} />
          <Row label={t('gr.reviewed')} value={`${reviewed}`} />
          <Row label={t('gr.shelfRead')} value={`${read}`} />
          <Row label={t('gr.shelfWanted')} value={`${wanted}`} last />
        </Section>
        </View>
      ) : null}

      {books && !kept ? (
        <>
          <Pressable
            onPress={busy ? undefined : bringOver}
            style={[styles.commit, { backgroundColor: busy ? palette.sunken : palette.accent }]}
          >
            <Text
              style={{
                color: busy ? palette.faint : palette.onAccent,
                fontSize: 17,
                fontWeight: '600',
              }}
            >
              {progress
                ? t('gr.bringingOver', { done: progress.done, total: progress.total })
                : t('gr.bringOver', { count: books.length })}
            </Text>
          </Pressable>
          <Hint>{t('gr.whatHappens')}</Hint>
        </>
      ) : null}

      {kept ? (
        <>
          <Section title={t('gr.doneTitle')}>
            <Row label={t('gr.added')} value={`${kept.added}`} />
            <Row label={t('gr.filled')} detail={t('gr.filledHint')} value={`${kept.filled}`} />
            <Row label={t('gr.untouched')} value={`${kept.untouched}`} last />
          </Section>
          <Pressable
            onPress={() => router.replace('/')}
            style={[styles.commit, { backgroundColor: palette.accent }]}
          >
            <Text style={{ color: palette.onAccent, fontSize: 17, fontWeight: '600' }}>
              {t('gr.toShelf')}
            </Text>
          </Pressable>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  box: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
  },
  input: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: space.sm,
    fontSize: 16,
    marginBottom: space.sm,
  },
  act: { paddingVertical: space.md, alignItems: 'center' },
  link: { marginTop: space.xl, paddingVertical: space.sm, alignItems: 'center' },
  commit: {
    marginTop: space.xl,
    paddingVertical: space.lg,
    borderRadius: radius.md,
    alignItems: 'center',
  },
});
