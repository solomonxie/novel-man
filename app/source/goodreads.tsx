import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, Stack, useLocalSearchParams } from '../../src/navigation/router';
import { useTranslation } from 'react-i18next';

import { booksFromExport, fetchShelf, parseFeedUrl, type Shelved } from '../../src/sources/goodreads';
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
  const { t } = useTranslation();
  const palette = usePalette();
  const [books, setBooks] = useState<Shelved[] | null>(null);
  const [from, setFrom] = useState<string>('');
  const [feedOpen, setFeedOpen] = useState(false);
  const [feed, setFeed] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [kept, setKept] = useState<KeptCount | null>(null);

  async function readExport() {
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
    } catch (problem) {
      setError(String(problem));
    } finally {
      setBusy(false);
    }
  }

  async function readFeed() {
    setError(null);
    if (!parseFeedUrl(feed)) {
      setError(t('gr.notAFeed'));
      return;
    }
    setBusy(true);
    try {
      const found = await fetchShelf(feed, (count) => setProgress({ done: count, total: count }));
      if (!found.length) {
        setError(t('gr.emptyFeed'));
        return;
      }
      setBooks(found);
      setFrom(t('gr.fromFeed'));
      setKept(null);
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
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      <Stack.Screen options={{ title: t('source.goodreads'), headerBackTitle: ' ' }} />

      <Hint>{t('gr.noApi')}</Hint>

      <Section title={t('gr.exportTitle')}>
        <Row label={t('gr.how1')} detail={t('gr.how1Detail')} />
        <Row
          label={t('gr.chooseFile')}
          detail={books && from ? from : t('gr.chooseFileHint')}
          value={busy && !progress ? undefined : books ? t('gr.chosen') : t('gr.choose')}
          onPress={busy ? undefined : readExport}
          last
        />
      </Section>

      <Section title={t('gr.feedTitle')}>
        <Row
          label={t('gr.feedRow')}
          detail={t('gr.feedWhy')}
          value={feedOpen ? '▴' : '▾'}
          onPress={() => setFeedOpen((was) => !was)}
          last={!feedOpen}
        />
        {feedOpen ? (
          <View style={[styles.box, { borderColor: palette.border }]}>
            <TextInput
              value={feed}
              onChangeText={setFeed}
              placeholder="https://www.goodreads.com/review/list_rss/…"
              placeholderTextColor={palette.faint}
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.input, { color: palette.text, borderColor: palette.border }]}
            />
            <Text style={{ color: palette.dim, fontSize: 12 }}>{t('gr.feedHint')}</Text>
            <Pressable onPress={busy ? undefined : readFeed} style={styles.act}>
              {busy ? (
                <ActivityIndicator />
              ) : (
                <Text style={{ color: palette.accent, fontSize: 16 }}>{t('gr.readFeed')}</Text>
              )}
            </Pressable>
          </View>
        ) : null}
      </Section>

      {error ? (
        <Text style={{ color: palette.danger, fontSize: 14, marginTop: space.md }}>{error}</Text>
      ) : null}

      {/* What was found, before anything is written. */}
      {books ? (
        <Section title={t('gr.found', { count: books.length })}>
          <Row label={t('gr.rated')} value={`${rated}`} />
          <Row label={t('gr.reviewed')} value={`${reviewed}`} />
          <Row label={t('gr.shelfRead')} value={`${read}`} />
          <Row label={t('gr.shelfWanted')} value={`${wanted}`} last />
        </Section>
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
  commit: {
    marginTop: space.xl,
    paddingVertical: space.lg,
    borderRadius: radius.md,
    alignItems: 'center',
  },
});
