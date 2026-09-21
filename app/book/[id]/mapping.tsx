import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams } from '../../../src/navigation/router';
import { useTranslation } from 'react-i18next';

import { getBook, getDocumentText, listEntities, type Book, type Entity } from '../../../src/db/repo';
import {
  deleteTerm,
  listTerms,
  markStaleContaining,
  setTermLocked,
  upsertTerm,
  type Term,
} from '../../../src/db/translation';
import { candidateTerms, type Candidate } from '../../../src/translate/terms';
import { seedFromCast } from '../../../src/translate/seed';
import { labelFor } from '../../../src/translate/languages';
import { InlineText } from '../../../src/ui/inline';
import { Hint, Row, Section } from '../../../src/ui/primitives';
import { radius, space, usePalette } from '../../../src/theme';

/**
 * Word mapping is the one place a translation can be corrected once instead of
 * three hundred times, so it is a workspace rather than a settings row.
 */
export default function Terms() {
  const { id, target } = useLocalSearchParams<{ id: string; target: string }>();
  const { t } = useTranslation();
  const palette = usePalette();

  const [book, setBook] = useState<Book | null>(null);
  const [terms, setTerms] = useState<Term[] | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [draft, setDraft] = useState({ source: '', translation: '' });

  const load = useCallback(() => {
    if (!id || !target) return;
    getBook(id).then(setBook);
    (async () => {
      const rows = await listTerms(id, target);
      setTerms(rows);
      const [text, characters, places] = await Promise.all([
        getDocumentText(id),
        listEntities(id, 'character'),
        listEntities(id, 'place'),
      ]);
      const language = (await getBook(id))?.language ?? 'en';
      setCandidates(candidateTerms(text, language, rows, [...characters, ...places] as Entity[]));
    })();
  }, [id, target]);

  useFocusEffect(load);

  async function save(source: string, translation: string, locked = false) {
    await upsertTerm({ bookId: id!, target: target!, source, translation, locked });
    load();
  }

  /** Changing a term is what makes existing sentences wrong, so say how many. */
  async function change(term: Term, translation: string) {
    await upsertTerm({
      bookId: id!,
      target: target!,
      source: term.source,
      translation,
      locked: !!term.locked,
    });
    const affected = await markStaleContaining(id!, target!, term.source);
    load();
    if (affected > 0) Alert.alert(t('translate.termAdded'), t('translate.termAffects', { count: affected }));
  }

  if (!terms || !book) {
    return (
      <View style={[styles.center, { backgroundColor: palette.bg }]}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen
        options={{ title: `${t('translate.mapping')} · ${labelFor(target ?? '')}`, headerBackTitle: ' ' }}
      />

      <View style={styles.addRow}>
        <TextInput
          value={draft.source}
          onChangeText={(value) => setDraft((was) => ({ ...was, source: value }))}
          placeholder={t('translate.termSource')}
          placeholderTextColor={palette.faint}
          style={[styles.input, { color: palette.text, backgroundColor: palette.surface, borderColor: palette.border }]}
        />
        <TextInput
          value={draft.translation}
          onChangeText={(value) => setDraft((was) => ({ ...was, translation: value }))}
          placeholder={t('translate.termTarget')}
          placeholderTextColor={palette.faint}
          style={[styles.input, { color: palette.text, backgroundColor: palette.surface, borderColor: palette.border }]}
        />
        <Pressable
          onPress={() => {
            if (!draft.source.trim() || !draft.translation.trim()) return;
            save(draft.source.trim(), draft.translation.trim());
            setDraft({ source: '', translation: '' });
          }}
          hitSlop={10}
        >
          <Text style={{ color: palette.accent, fontSize: 22 }}>＋</Text>
        </Pressable>
      </View>

      <Section title={t('translate.terms')} action={{
        label: t('translate.seed'),
        onPress: async () => {
          const added = await seedFromCast(id!, target!);
          load();
          Alert.alert(t('translate.seeded', { count: added }));
        },
      }}>
        {terms.length === 0 ? (
          <Row label={t('translate.noTerms')} last />
        ) : (
          terms.map((term, index) => (
            <View
              key={term.id}
              style={[
                styles.term,
                index < terms.length - 1 && {
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderColor: palette.border,
                },
              ]}
            >
              <Text style={{ color: palette.text, fontSize: 15, width: '36%' }} numberOfLines={2}>
                {term.source}
              </Text>
              <InlineText
                value={term.translation}
                placeholder={t('translate.termTarget')}
                onCommit={(value) => change(term, value)}
                style={{ color: palette.text, fontSize: 15, flex: 1 }}
              />
              <Pressable onPress={() => setTermLocked(term.id, !term.locked).then(load)} hitSlop={8}>
                <Text style={{ fontSize: 15, opacity: term.locked ? 1 : 0.3 }}>🔒</Text>
              </Pressable>
              <Pressable onPress={() => deleteTerm(term.id).then(load)} hitSlop={8}>
                <Text style={{ color: palette.danger, fontSize: 15 }}>✕</Text>
              </Pressable>
            </View>
          ))
        )}
      </Section>
      <Hint>{t('translate.lockHint')}</Hint>

      {candidates.length > 0 && (
        <Section title={t('translate.candidates')}>
          {candidates.slice(0, 40).map((candidate, index) => (
            <Row
              key={candidate.source}
              label={candidate.source}
              value={t('translate.seenTimes', { count: candidate.count })}
              onPress={() => setDraft({ source: candidate.source, translation: '' })}
              last={index === Math.min(candidates.length, 40) - 1}
            />
          ))}
        </Section>
      )}
      <Hint>{t('translate.candidatesHint')}</Hint>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  input: {
    flex: 1,
    padding: space.sm + 2,
    fontSize: 15,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  term: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
});
