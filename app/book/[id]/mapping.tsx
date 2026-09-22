import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams } from '../../../src/navigation/router';
import { useTranslation } from 'react-i18next';

import { getBook, getDocumentText, listEntities, type Book, type Entity } from '../../../src/db/repo';
import {
  deleteTerm,
  listTerms,
  markStaleContaining,
  markStaleContainingAny,
  upsertTerm,
  type Term,
} from '../../../src/db/translation';
import { candidateTerms, type Candidate } from '../../../src/translate/terms';
import { useWorkRefresh } from '../../../src/work/refresh';
import { suggestTerms } from '../../../src/translate/suggest';
import { stoppedWithoutKey } from '../../../src/ai/guard';
import { labelFor } from '../../../src/translate/languages';
import { InlineText } from '../../../src/ui/inline';
import { Hint, PrimaryAction, Row, Section } from '../../../src/ui/primitives';
import { radius, space, usePalette } from '../../../src/theme';

/**
 * Word mapping is the one place a translation can be corrected once instead of
 * three hundred times, so it is a workspace rather than a settings row.
 */
/** Forty to a request, and no more than this many in one press. */
const BATCH = 40;
const MOST = 200;

/**
 * Three goes at a request, spaced out. `Network request failed` is what a
 * phone says when it lost the connection for a second, not what it says when
 * the answer is no.
 */
async function withRetries<T>(work: () => Promise<T>, tries = 3): Promise<T> {
  let last: unknown;
  for (let at = 0; at < tries; at++) {
    try {
      return await work();
    } catch (problem) {
      last = problem;
      if (at < tries - 1) await new Promise((wake) => setTimeout(wake, 800 * (at + 1)));
    }
  }
  throw last;
}

export default function Terms() {
  const { id, target } = useLocalSearchParams<{ id: string; target: string }>();
  const { t } = useTranslation();
  const palette = usePalette();

  const [book, setBook] = useState<Book | null>(null);
  const [terms, setTerms] = useState<Term[] | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [entry, setEntry] = useState({ source: '', translation: '' });
  const [asking, setAsking] = useState(false);
  /** What the model proposed, before anybody has agreed to it. */
  const [proposed, setProposed] = useState<Map<string, string> | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

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

  // Read fresh every time the page is looked at — the glossary is the book's,
  // so it may have been changed from another chapter, or by a sentence
  // promoted to a term while a translation was running.
  useFocusEffect(load);
  useWorkRefresh(load);

  async function save(source: string, translation: string, locked = false) {
    await upsertTerm({ bookId: id!, target: target!, source, translation, locked });
    load();
  }

  /**
   * The whole glossary in one press, and nothing written until it is accepted.
   *
   * A glossary is forty names typed by hand before the first chapter reads
   * properly, which is why nobody fills one in. So every name that has no
   * mapping — the ones found in the text and the ones already listed with an
   * empty translation — goes out together, forty to a request, and what comes
   * back is held as a proposal: read it, fix what is wrong, keep it or throw
   * it away. Rejecting leaves every row exactly as it was, because nothing
   * was ever saved.
   */
  async function generate() {
    if (asking) return;
    // This list and no other: the button lives in the Terms heading, so it
    // fills in the blanks of that list. A name that is only *found in the
    // text* is not a term until somebody says it is.
    const unmapped = terms!
      .filter((term) => !term.translation.trim())
      .map((term) => term.source)
      .slice(0, MOST);
    if (!unmapped.length) {
      Alert.alert(t('translate.nothingToFill'));
      return;
    }
    if (await stoppedWithoutKey(t)) return;

    setAsking(true);
    setProgress({ done: 0, total: unmapped.length });
    const proposal = new Map<string, string>();
    let failed: unknown = null;

    for (let at = 0; at < unmapped.length; at += BATCH) {
      const slice = unmapped.slice(at, at + BATCH);
      try {
        // A phone on one bar drops a request now and then, and forty names
        // are not worth losing to it — so each batch gets a second and third
        // go before the run gives up on it.
        const found = await withRetries(() =>
          suggestTerms(slice, book?.language ?? 'en', target!, {
            title: book?.title ?? '',
            summary: book?.summary ?? null,
          })
        );
        for (const [source, translation] of found) proposal.set(source, translation);
      } catch (problem) {
        failed = problem;
        break;
      }
      setProgress({ done: Math.min(at + BATCH, unmapped.length), total: unmapped.length });
    }

    setAsking(false);
    setProgress(null);

    // Whatever did come back is worth keeping: it is a proposal either way,
    // and throwing away eighty good rows because the eighty-first request
    // failed is the worst of both.
    if (proposal.size) setProposed(proposal);
    if (failed) {
      Alert.alert(
        t('translate.mapping'),
        proposal.size
          ? t('translate.someFailed', { count: proposal.size, error: String(failed) })
          : String(failed)
      );
    } else if (!proposal.size) {
      Alert.alert(t('translate.suggestNone'));
    }
  }

  /**
   * Accepting is the only thing that writes — and a glossary is the book's,
   * not the chapter's, so accepting it has to reach the chapters already
   * translated. Every sentence containing one of these names is marked for
   * re-translation; nothing is re-run until somebody asks for that chapter,
   * and anything written by hand survives it.
   */
  async function keepProposed() {
    if (!proposed) return;
    const kept: string[] = [];
    for (const [source, translation] of proposed) {
      if (!translation.trim()) continue;
      await upsertTerm({ bookId: id!, target: target!, source, translation });
      kept.push(source);
    }
    const affected = await markStaleContainingAny(id!, target!, kept);
    setProposed(null);
    load();
    if (affected > 0) {
      Alert.alert(t('translate.termAdded'), t('translate.termAffects', { count: affected }));
    }
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

      {/* One press for the whole glossary. What comes back is a proposal:
          read it, fix what is wrong, then keep it or throw it away — nothing
          is written until it is kept, so rejecting leaves every row as it was. */}
      {proposed ? (
        <>
          <Section title={t('translate.proposedCount', { count: proposed.size })}>
            {[...proposed.entries()].map(([source, translation], index) => (
              <View
                key={source}
                style={[
                  styles.term,
                  index < proposed.size - 1 && {
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderColor: palette.border,
                  },
                ]}
              >
                <Text style={{ color: palette.text, fontSize: 15, width: '36%' }} numberOfLines={2}>
                  {source}
                </Text>
                <InlineText
                  value={translation}
                  placeholder={t('translate.termTarget')}
                  onCommit={(value) =>
                    setProposed((was) => {
                      const next = new Map(was);
                      if (value.trim()) next.set(source, value.trim());
                      else next.delete(source);
                      return next;
                    })
                  }
                  style={{ color: palette.accent, fontSize: 15, flex: 1 }}
                />
                <Pressable
                  onPress={() =>
                    setProposed((was) => {
                      const next = new Map(was);
                      next.delete(source);
                      return next;
                    })
                  }
                  hitSlop={8}
                >
                  <Text style={{ color: palette.danger, fontSize: 15 }}>✕</Text>
                </Pressable>
              </View>
            ))}
          </Section>
          <Hint>{t('translate.proposedHint')}</Hint>
          <View style={{ gap: space.sm, marginTop: space.lg }}>
            <PrimaryAction label={t('translate.keepProposed')} onPress={keepProposed} />
            <PrimaryAction
              label={t('translate.rejectProposed')}
              onPress={() => setProposed(null)}
              danger
            />
          </View>
        </>
      ) : (
        <>
          {/* The ✨ sits with the heading it fills in, where a section's own
              action belongs. While it runs it counts instead. */}
          <Section
            title={t('translate.terms')}
            action={{
              label: progress ? `${progress.done}/${progress.total}` : '✨',
              onPress: generate,
            }}
          >
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
                  <Pressable onPress={() => deleteTerm(term.id).then(load)} hitSlop={8}>
                    <Text style={{ color: palette.danger, fontSize: 15 }}>✕</Text>
                  </Pressable>
                </View>
              ))
            )}
          </Section>

          {/* Under the rows it adds to, where a new one lands. */}
      <View style={styles.addRow}>
        <TextInput
          value={entry.source}
          onChangeText={(value) => setEntry((was) => ({ ...was, source: value }))}
          placeholder={t('translate.termSource')}
          placeholderTextColor={palette.faint}
          style={[styles.input, { color: palette.text, backgroundColor: palette.surface, borderColor: palette.border }]}
        />
        <TextInput
          value={entry.translation}
          onChangeText={(value) => setEntry((was) => ({ ...was, translation: value }))}
          placeholder={t('translate.termTarget')}
          placeholderTextColor={palette.faint}
          style={[styles.input, { color: palette.text, backgroundColor: palette.surface, borderColor: palette.border }]}
        />
        <Pressable
          onPress={() => {
            if (!entry.source.trim() || !entry.translation.trim()) return;
            save(entry.source.trim(), entry.translation.trim());
            setEntry({ source: '', translation: '' });
          }}
          hitSlop={10}
        >
          <Text style={{ color: palette.accent, fontSize: 22 }}>＋</Text>
        </Pressable>
      </View>
          <Hint>{t('translate.termsHint')}</Hint>


          {candidates.length > 0 && (
            <Section title={t('translate.candidates')}>
              {candidates.slice(0, 40).map((candidate, index) => (
                <Row
                  key={candidate.source}
                  label={candidate.source}
                  detail={t('translate.seenTimes', { count: candidate.count })}
                  value="＋"
                  onPress={() => setEntry({ source: candidate.source, translation: '' })}
                  last={index === Math.min(candidates.length, 40) - 1}
                />
              ))}
            </Section>
          )}
        </>
      )}

      <Hint>{t('translate.candidatesHint')}</Hint>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.md },
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
