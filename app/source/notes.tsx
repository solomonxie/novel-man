import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from '../../src/navigation/router';
import { useTranslation } from 'react-i18next';

import { notedBooksFrom } from '../../src/sources/notesFile';
import { keepNotes, planNotes, type KeptNotes, type NotesPlan } from '../../src/books/notes';
import { pickNotesFile } from '../../src/import/sources/picker';
import { File } from '../../src/storage/fs';
import { DEFAULT_KIND } from '../../src/books/kinds';
import { Hint, Row, Section } from '../../src/ui/primitives';
import { radius, space, usePalette } from '../../src/theme';

/**
 * Notes from elsewhere onto the books already here. Which book each set goes
 * to is shown before anything is written, because a wrong match puts somebody's
 * notes on a book they never read.
 */
export default function ImportNotes() {
  const { kind } = useLocalSearchParams<{ kind?: string }>();
  const { t } = useTranslation();
  const palette = usePalette();
  const [plan, setPlan] = useState<NotesPlan | null>(null);
  const [from, setFrom] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [kept, setKept] = useState<KeptNotes | null>(null);

  async function readFile() {
    setError(null);
    try {
      const picked = await pickNotesFile();
      if (!picked) return;
      setFrom(picked.name);
      setPlan(null);
      setKept(null);
      setBusy(true);
      const books = notedBooksFrom(await new File(picked.uri).text());
      if (!books.length) {
        setError(t('notesImport.notNotes'));
        return;
      }
      setPlan(await planNotes(books));
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
      setKept(await keepNotes(plan, kind ?? DEFAULT_KIND, (done, total) => setProgress({ done, total })));
    } catch (problem) {
      setError(String(problem));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  const notes = plan?.reduce((sum, entry) => sum + entry.book.notes.length, 0) ?? 0;
  const matched = plan?.filter((entry) => entry.onto).length ?? 0;

  const header = (
    <View>
      <Hint>{t('notesImport.why')}</Hint>
      <Pressable onPress={busy ? undefined : readFile} style={styles.link}>
        {busy && !progress ? (
          <ActivityIndicator />
        ) : (
          <Text style={{ color: palette.accent, fontSize: 17 }}>
            {from ? t('csv.chooseAnother') : t('notesImport.choose')}
          </Text>
        )}
      </Pressable>
      {from ? (
        <Text numberOfLines={2} style={{ color: palette.dim, fontSize: 14, textAlign: 'center' }}>
          {from}
        </Text>
      ) : null}
      {error ? (
        <Text style={{ color: palette.danger, fontSize: 14, marginTop: space.md }}>{error}</Text>
      ) : null}
      {plan && !kept ? (
        <>
          <Pressable
            onPress={busy ? undefined : bringOver}
            style={[styles.commit, { backgroundColor: busy ? palette.sunken : palette.accent }]}
          >
            <Text style={{ color: busy ? palette.faint : palette.onAccent, fontSize: 17, fontWeight: '600' }}>
              {progress
                ? t('gr.bringingOver', { done: progress.done, total: progress.total })
                : t('notesImport.add', { count: notes })}
            </Text>
          </Pressable>
          <Hint>
            {t('notesImport.summary', { books: plan.length, matched, created: plan.length - matched })}
          </Hint>
        </>
      ) : null}
      {kept ? (
        <>
          <Section title={t('gr.doneTitle')}>
            <Row label={t('notesImport.added')} value={`${kept.added}`} />
            <Row label={t('notesImport.already')} value={`${kept.already}`} />
            <Row label={t('notesImport.newBooks')} value={`${kept.created}`} last />
          </Section>
          <Pressable
            onPress={() => router.replace('/')}
            style={[styles.commit, { backgroundColor: palette.accent }]}
          >
            <Text style={{ color: palette.onAccent, fontSize: 17, fontWeight: '600' }}>{t('gr.toShelf')}</Text>
          </Pressable>
        </>
      ) : null}
      {plan ? (
        <Text style={[styles.heading, { color: palette.dim }]}>{t('notesImport.where')}</Text>
      ) : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <Stack.Screen options={{ title: t('source.notes'), headerBackTitle: ' ' }} />
      <FlatList
        data={plan ?? []}
        keyExtractor={(_, index) => `${index}`}
        ListHeaderComponent={header}
        contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}
        renderItem={({ item }) => (
          <View style={[styles.item, { borderColor: palette.border }]}>
            <Text style={{ color: palette.text, fontSize: 16 }}>{item.book.title}</Text>
            <Text style={{ color: item.onto ? palette.dim : palette.accent, fontSize: 13, marginTop: 2 }}>
              {item.onto
                ? t('notesImport.onto', { title: item.onto.title, count: item.book.notes.length })
                : t('notesImport.asNew', { count: item.book.notes.length })}
            </Text>
          </View>
        )}
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
  item: { paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth },
});
