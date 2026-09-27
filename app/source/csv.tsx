import { useState } from 'react';
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

import { COLUMNS, booksFromCsv } from '../../src/sources/shelfCsv';
import type { Shelved } from '../../src/sources/goodreads';
import { CSV_FILE, keepShelved, type KeptCount } from '../../src/books/save';
import { pickSpreadsheet } from '../../src/import/sources/picker';
import { File } from '../../src/storage/fs';
import { DEFAULT_KIND } from '../../src/books/kinds';
import { Hint, Row, Section } from '../../src/ui/primitives';
import { radius, space, usePalette } from '../../src/theme';

/**
 * A library from anywhere, brought over as a CSV.
 *
 * Nothing here is about one site. Goodreads' own export is read as it stands,
 * and so is any other file whose header row carries the same columns — which is
 * the whole door for a site that publishes no export at all.
 *
 * What the file chose and what was found in it sit directly under the button,
 * above the column list rather than below it: the answer to a tap belongs where
 * the tap was, not a screenful further down.
 */
export default function ImportFromCsv() {
  const { kind } = useLocalSearchParams<{ kind?: string }>();
  const { t } = useTranslation();
  const palette = usePalette();
  const [books, setBooks] = useState<Shelved[] | null>(null);
  const [from, setFrom] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [kept, setKept] = useState<KeptCount | null>(null);

  async function readCsv() {
    setError(null);
    try {
      const picked = await pickSpreadsheet();
      if (!picked) return;
      // Named before it is read: a file that turns out to hold no books still
      // has to show which file that was.
      setFrom(picked.name);
      setBooks(null);
      setKept(null);
      setBusy(true);
      const found = booksFromCsv(await new File(picked.uri).text());
      if (!found.length) {
        setError(t('csv.notACsv'));
        return;
      }
      setBooks(found);
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
          CSV_FILE
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
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}
    >
      <Stack.Screen options={{ title: t('source.csv'), headerBackTitle: ' ' }} />

      <Hint>{t('csv.why')}</Hint>

      <Pressable onPress={busy ? undefined : readCsv} style={styles.link}>
        {busy && !progress ? (
          <ActivityIndicator />
        ) : (
          <Text style={{ color: palette.accent, fontSize: 17 }}>
            {from ? t('csv.chooseAnother') : t('csv.chooseCsv')}
          </Text>
        )}
      </Pressable>

      {from ? (
        <Text
          numberOfLines={2}
          style={{ color: palette.dim, fontSize: 14, textAlign: 'center' }}
        >
          {t('csv.chosen', { name: from })}
        </Text>
      ) : null}

      {error ? (
        <Text style={{ color: palette.danger, fontSize: 14, marginTop: space.md }}>{error}</Text>
      ) : null}

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

      {/* What the file has to hold. A CSV that is nearly right fails silently —
          a column named otherwise is simply a book with no rating — so the
          names are on the page rather than in a document nobody opens. It
          drops below the result once there is one, and goes away once the
          import has run. */}
      {kept ? null : (
        <View>
          <Section title={t('csv.columnsTitle')}>
            {COLUMNS.map((column, index) => (
              <Row
                key={column.name}
                label={column.name}
                detail={t(`csv.col.${column.fills}`)}
                value={column.required ? t('csv.required') : undefined}
                last={index === COLUMNS.length - 1}
              />
            ))}
          </Section>
          <Hint>{t('csv.how')}</Hint>
        </View>
      )}
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
