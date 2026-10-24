import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from '../../src/navigation/router';
import { useTranslation } from 'react-i18next';

import { COLUMNS, booksFromCsv } from '../../src/sources/shelfCsv';
import type { Shelved } from '../../src/sources/goodreads';
import { CSV_FILE, keepShelved, planShelved, type KeptCount } from '../../src/books/save';
import { pickSpreadsheet, type PickedFile } from '../../src/import/sources/picker';
import { readText } from '../../src/storage/text';
import { shelfBooks, type Planned } from '../../src/books/imports';
import { recordRun } from '../../src/books/importRuns';
import type { BookListItem } from '../../src/db/repo';
import { LastImport, OntoSheet, PlanRow, planCounts } from '../../src/ui/ImportPlan';
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
  const { kind, uri, name } = useLocalSearchParams<{ kind?: string; uri?: string; name?: string }>();
  const { t } = useTranslation();
  const palette = usePalette();
  const [plan, setPlan] = useState<Planned<Shelved>[] | null>(null);
  const [shelf, setShelf] = useState<BookListItem[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [recorded, setRecorded] = useState(0);
  const books = plan?.map((entry) => entry.item) ?? null;
  const [from, setFrom] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [kept, setKept] = useState<KeptCount | null>(null);

  // Opened from another app: the file is already chosen.
  useEffect(() => {
    if (uri) void readFrom({ uri, name: name ?? '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uri]);

  async function readCsv() {
    setError(null);
    try {
      const picked = await pickSpreadsheet();
      if (picked) await readFrom(picked);
    } catch (problem) {
      setError(String(problem));
    }
  }

  async function readFrom(picked: PickedFile) {
    setError(null);
    try {
      // Named before it is read: a file that turns out to hold no books still
      // has to show which file that was.
      setFrom(picked.name);
      setPlan(null);
      setKept(null);
      setBusy(true);
      const found = booksFromCsv(await readText(picked.uri));
      if (!found.length) {
        setError(t('csv.notACsv'));
        return;
      }
      setPlan(await planShelved(found, CSV_FILE));
      setShelf(await shelfBooks());
    } catch (problem) {
      setError(String(problem));
    } finally {
      setBusy(false);
    }
  }

  async function bringOver() {
    if (!plan) return;
    setBusy(true);
    setError(null);
    try {
      const done = await keepShelved(
        plan,
        kind ?? DEFAULT_KIND,
        (at, total) => setProgress({ done: at, total }),
        CSV_FILE
      );
      await recordRun({ source: 'csv', from, created: done.created, notes: [], was: done.was });
      setRecorded((was) => was + 1);
      setKept(done);
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
  const counts = planCounts(plan ?? []);

  const header = (
    <View>
      <Hint>{t('csv.why')}</Hint>
      <LastImport source="csv" refresh={recorded} />

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
                : t('gr.bringOver', { count: books.length - counts.skipped })}
            </Text>
          </Pressable>
          <Hint>{t('importPlan.summary', counts)}</Hint>
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
      {plan ? (
        <Text style={[styles.heading, { color: palette.dim }]}>
          {kept ? t('importPlan.where') : t('importPlan.tapToChange')}
        </Text>
      ) : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <Stack.Screen options={{ title: t('source.csv'), headerBackTitle: ' ' }} />
      <FlatList
        data={plan ?? []}
        keyExtractor={(_, index) => `${index}`}
        ListHeaderComponent={header}
        contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}
        renderItem={({ item, index }) => (
          <PlanRow
            entry={item}
            title={item.item.author ? `${item.item.title} · ${item.item.author}` : item.item.title}
            onPress={() => (kept || busy ? undefined : setEditing(index))}
          />
        )}
      />
      <OntoSheet
        shelf={shelf}
        entry={editing !== null && plan ? plan[editing] : null}
        title={editing !== null && plan ? plan[editing].item.title : ''}
        onChange={(onto, skip) => {
          setPlan((was) => was && was.map((entry, at) => (at === editing ? { ...entry, onto, skip } : entry)));
          setEditing(null);
        }}
        onClose={() => setEditing(null)}
      />
    </View>
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
  heading: { marginTop: space.xl, marginBottom: space.sm, fontSize: 13, textTransform: 'uppercase' },
});
