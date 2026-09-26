import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, Stack, useLocalSearchParams } from '../../src/navigation/router';
import { useTranslation } from 'react-i18next';

import { COLUMNS, booksFromCsv } from '../../src/sources/douban';
import type { Shelved } from '../../src/sources/goodreads';
import { DOUBAN, keepShelved, type KeptCount } from '../../src/books/save';
import { pickSpreadsheet } from '../../src/import/sources/picker';
import { File } from '../../src/storage/fs';
import { DEFAULT_KIND } from '../../src/books/kinds';
import { Hint, Row, Section } from '../../src/ui/primitives';
import { radius, space, usePalette } from '../../src/theme';

/**
 * A Douban library, brought over as a file.
 *
 * The Goodreads page offers a link first because a link can be read again.
 * Douban has no equivalent — no API, no export of its own, and an RSS feed of
 * ten mixed items that does not page — so there is one door here, and the page
 * says what the file has to hold rather than pretending at a second.
 */
export default function ImportFromDouban() {
  const { kind } = useLocalSearchParams<{ kind?: string }>();
  const { t } = useTranslation();
  const palette = usePalette();
  const [books, setBooks] = useState<Shelved[] | null>(null);
  const [from, setFrom] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [kept, setKept] = useState<KeptCount | null>(null);
  const page = useRef<ScrollView>(null);
  const foundY = useRef(0);

  function reveal() {
    requestAnimationFrame(() =>
      page.current?.scrollTo({ y: Math.max(0, foundY.current - space.lg), animated: true })
    );
  }

  async function readCsv() {
    setError(null);
    try {
      const picked = await pickSpreadsheet();
      if (!picked) return;
      setBusy(true);
      const found = booksFromCsv(await new File(picked.uri).text());
      if (!found.length) {
        setError(t('db.notACsv'));
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

  async function bringOver() {
    if (!books) return;
    setBusy(true);
    setError(null);
    try {
      setKept(
        await keepShelved(
          books,
          kind ?? DEFAULT_KIND,
          (done, total) => setProgress({ done, total }),
          DOUBAN
        )
      );
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
    >
      <Stack.Screen options={{ title: t('source.douban'), headerBackTitle: ' ' }} />

      <Hint>{t('db.why')}</Hint>

      <Pressable onPress={busy ? undefined : readCsv} style={styles.link}>
        {busy && !progress ? (
          <ActivityIndicator />
        ) : (
          <Text style={{ color: palette.accent, fontSize: 17 }}>{t('db.chooseCsv')}</Text>
        )}
      </Pressable>
      <Hint>{t('db.how')}</Hint>

      {/* What the file has to hold. A CSV that is nearly right fails silently —
          a column named otherwise is simply a book with no rating — so the
          names are on the page rather than in a document nobody opens. */}
      <Section title={t('db.columnsTitle')}>
        {COLUMNS.map((column, index) => (
          <Row
            key={column.name}
            label={column.name}
            detail={t(`db.col.${column.fills}`)}
            value={column.required ? t('db.required') : undefined}
            last={index === COLUMNS.length - 1}
          />
        ))}
      </Section>

      {error ? (
        <Text style={{ color: palette.danger, fontSize: 14, marginTop: space.md }}>{error}</Text>
      ) : null}

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
  link: { marginTop: space.xl, paddingVertical: space.sm, alignItems: 'center' },
  commit: {
    marginTop: space.xl,
    paddingVertical: space.lg,
    borderRadius: radius.md,
    alignItems: 'center',
  },
});
