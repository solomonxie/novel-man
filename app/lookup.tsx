import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { EsvError, ESV_NOTICE, lookUpEsv, type Passage } from '../src/sources/esv';
import { esvKey, forgetEsvKey, saveEsvKey } from '../src/sources/esvKey';
import { cachePassage, cachedPassage, clearCached, countCached } from '../src/sources/passages';
import { neighbouringChapters } from '../src/scripture/canon';
import { Hint, PrimaryAction, Row, Search, Section } from '../src/ui/primitives';
import { InlineText } from '../src/ui/inline';
import { space, usePalette } from '../src/theme';

const SIGN_UP = 'https://api.esv.org/';

/**
 * A passage, asked for and answered. Every other source here hands over a book
 * and this one cannot: Crossway licenses the ESV and permits no one to
 * redistribute it, so there is nothing to download and nothing this app may
 * keep. What is allowed is a key of your own and a question at a time.
 *
 * So the page says what it is — fetched now, not stored, attributed — rather
 * than dressing a lookup up as a book that happens to need a signal.
 */
export default function LookUp() {
  const { t } = useTranslation();
  const palette = usePalette();
  const [key, setKey] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [reference, setReference] = useState('');
  const [passage, setPassage] = useState<Passage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [saved, setSaved] = useState(0);
  const [fromCache, setFromCache] = useState(false);

  useEffect(() => {
    esvKey().then(setKey);
    countCached('esv').then(setSaved);
  }, []);

  async function look() {
    if (!reference.trim()) return;
    setBusy(true);
    setError(null);
    setWaiting(false);

    // What was read before is read again without asking anyone: instant, and
    // it works with no signal at all.
    const kept = await cachedPassage('esv', reference);
    if (kept) {
      setPassage(kept);
      setFromCache(true);
      setBusy(false);
      return;
    }

    try {
      const found = await lookUpEsv(reference, key, { onWait: () => setWaiting(true) });
      setPassage(found);
      setFromCache(false);
      await cachePassage('esv', reference, found);
      setSaved(await countCached('esv'));
      void preload(found.reference);
    } catch (problem) {
      setPassage(null);
      setError(t(`lookup.${problem instanceof EsvError ? problem.code : 'offline'}`));
    } finally {
      setBusy(false);
      setWaiting(false);
    }
  }

  /**
   * The chapter either side of the one being read, fetched quietly behind it.
   * Reading goes in one direction and then the other, so the next tap is
   * nearly always one of these two — and having them already here is the
   * difference between a page and a wait.
   *
   * One at a time, never awaited by the page, and silent when it fails: a
   * guess that costs the reader nothing is only worth making on those terms.
   */
  async function preload(canonical: string) {
    for (const next of neighbouringChapters(canonical)) {
      if (await cachedPassage('esv', next)) continue;
      try {
        const found = await lookUpEsv(next, key);
        await cachePassage('esv', next, found);
      } catch {
        return;
      }
    }
    setSaved(await countCached('esv'));
  }

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen options={{ title: t('lookup.title'), headerBackTitle: ' ' }} />

      {key ? (
        <>
          <Search
            value={reference}
            onChange={setReference}
            placeholder={t('lookup.placeholder')}
            onSubmit={look}
          />

          {busy ? <ActivityIndicator style={{ marginTop: space.xl }} /> : null}
          {waiting ? <Hint>{t('lookup.waiting')}</Hint> : null}
          {error ? <Hint>{error}</Hint> : null}

          {passage ? (
            <View style={{ marginTop: space.xl }}>
              <Text style={{ color: palette.accent, fontSize: 13, fontWeight: '700' }}>
                {passage.reference}
              </Text>
              <Text
                style={{ color: palette.text, fontSize: 17, lineHeight: 27, marginTop: space.sm }}
              >
                {passage.text}
              </Text>
              {/* Their words, their notice — and the line that says this page
                  is a window, not a shelf. */}
              <Text style={{ color: palette.faint, fontSize: 11, marginTop: space.lg }}>
                {ESV_NOTICE}
              </Text>
              <Hint>{fromCache ? t('lookup.fromHere') : t('lookup.kept')}</Hint>
            </View>
          ) : null}

          <Section title={t('lookup.keyTitle')}>
            <Row
              label={t('lookup.savedCount', { count: saved })}
              detail={t('lookup.savedHint')}
              value={saved ? t('lookup.clear') : undefined}
              onPress={
                saved
                  ? () => clearCached('esv').then(() => setSaved(0))
                  : undefined
              }
            />
            <Row label={t('lookup.forget')} onPress={() => forgetEsvKey().then(() => setKey(null))} danger last />
          </Section>
        </>
      ) : (
        <>
          <Text style={{ color: palette.text, fontSize: 15, lineHeight: 22 }}>
            {t('lookup.why')}
          </Text>
          <Row
            label={t('lookup.getKey')}
            detail={SIGN_UP}
            value="›"
            onPress={() => Linking.openURL(SIGN_UP)}
            last
          />
          <View style={[styles.field, { borderColor: palette.border, backgroundColor: palette.surface }]}>
            <InlineText
              value={draft}
              placeholder={t('lookup.paste')}
              onCommit={setDraft}
              style={{ color: palette.text, fontSize: 15 }}
            />
          </View>
          <PrimaryAction
            label={t('lookup.save')}
            onPress={() => {
              if (!draft.trim()) return;
              saveEsvKey(draft).then(() => {
                setKey(draft.trim());
                setDraft('');
              });
            }}
          />
          <Hint>{t('lookup.keyStaysHere')}</Hint>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  field: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: space.md,
    marginTop: space.md,
  },
});
