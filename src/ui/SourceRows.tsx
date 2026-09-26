import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { indexState, replaceIndex, type IndexState } from '../sources/catalog';
import { refreshCatalog } from '../sources/ebible';
import { fetchGutenbergIndex } from '../sources/gutenberg';
import {
  fetchStandardEbooksIndex,
  StandardEbooksError,
  testStandardEbooks,
} from '../sources/standardEbooks';
import {
  forgetStandardEbooksEmail,
  saveStandardEbooksEmail,
  standardEbooksEmail,
} from '../sources/standardEbooksEmail';
import type { PublicSource } from '../sources/registry';
import { Hint, Row, Section } from './primitives';
import { space, usePalette } from '../theme';

/**
 * A source's own machinery, on the source's own page: fetch the list it
 * publishes, and hand over the credential it needs before it will answer.
 *
 * This used to live on the Add page, five rows per source behind a fold, so
 * choosing where a book comes from meant reading a page of plumbing. A source
 * is one row there now and everything about keeping its list is here — beside
 * the search that list is for.
 */
export function SourceRows({ source, onUpdated }: {
  source: PublicSource;
  /** The page above usually shows the list; it has to re-read it. */
  onUpdated?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const palette = usePalette();
  const [state, setState] = useState<IndexState | null>(null);
  const [busy, setBusy] = useState(false);
  const [fraction, setFraction] = useState(0);
  const [error, setError] = useState<string | null>(null);

  /** Only for the one source whose door needs a credential of the reader's. */
  const [email, setEmail] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [tested, setTested] = useState<string | null>(null);
  const [works, setWorks] = useState(false);
  const [testing, setTesting] = useState(false);

  const read = useCallback(async () => {
    setState(await indexState(source.id));
  }, [source.id]);

  useEffect(() => {
    void read();
    if (source.credential) standardEbooksEmail().then(setEmail);
  }, [read, source.credential]);

  const locked = Boolean(source.credential) && !email;

  /** `apt update`, one source at a time, on the reader's say-so. */
  async function update() {
    setBusy(true);
    setFraction(0);
    setError(null);
    try {
      if (source.id === 'ebible') await refreshCatalog();
      else if (source.id === 'gutenberg') {
        await replaceIndex('gutenberg', await fetchGutenbergIndex(), (done, total) =>
          setFraction(total ? done / total : 0)
        );
      } else if (source.id === 'standardebooks') {
        const rows = await fetchStandardEbooksIndex(await standardEbooksEmail());
        await replaceIndex('standardebooks', rows, (done, total) =>
          setFraction(total ? done / total : 0)
        );
      }
      await read();
      onUpdated?.();
    } catch (problem) {
      setError(
        problem instanceof StandardEbooksError ? t(`add.se_${problem.code}`) : t('add.updateFailed')
      );
    } finally {
      setBusy(false);
    }
  }

  /** The root feed, which is the cheapest question their door answers. */
  async function test() {
    setTesting(true);
    setTested(null);
    try {
      await testStandardEbooks(await standardEbooksEmail());
      setWorks(true);
    } catch (problem) {
      setWorks(false);
      setTested(t(`add.se_${problem instanceof StandardEbooksError ? problem.code : 'offline'}`));
    } finally {
      setTesting(false);
    }
  }

  if (!source.indexed && !source.credential) return null;

  return (
    <>
    <Section title={t(`source.${source.id}`)}>
      {/* The credential first: nothing under it works without one. */}
      {source.credential ? (
        <>
          <Row
            label={t('add.seEmailRow')}
            detail={email ?? t('add.seWhy')}
            value={email ? t('add.seSet') : t('add.seNotSet')}
          />
          {/* Laid out, not folded. This is the source's own full-screen page
              and the field is most of why anybody opened it; a disclosure here
              hides one row behind another for no gain. */}
          {email ? null : (
            <View style={[styles.box, { borderColor: palette.border }]}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder={t('add.seEmailPlaceholder')}
                placeholderTextColor={palette.faint}
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                keyboardType="email-address"
                style={[styles.input, { color: palette.text, borderColor: palette.border }]}
              />
              <Text style={{ color: palette.dim, fontSize: 12 }}>{t('add.seStaysHere')}</Text>
              <Pressable
                onPress={() => {
                  if (!draft.trim()) return;
                  saveStandardEbooksEmail(draft).then(async () => {
                    setEmail(await standardEbooksEmail());
                    setDraft('');
                    setWorks(false);
                    void test();
                  });
                }}
                style={styles.act}
              >
                <Text style={{ color: palette.accent, fontSize: 16 }}>{t('add.seSave')}</Text>
              </Pressable>
            </View>
          )}
          {email ? (
            <Row
              label={t('add.seTest')}
              detail={tested ?? undefined}
              alarm={Boolean(tested)}
              value={
                testing
                  ? t('add.seTesting')
                  : works
                    ? t('add.seWorks')
                    : tested
                      ? t('add.seRetest')
                      : t('add.seTestNow')
              }
              onPress={testing ? undefined : test}
            />
          ) : null}
        </>
      ) : null}

      {source.indexed ? (
        <Row
          label={t('add.listRow')}
          // What went wrong takes the place of what the list holds: they are
          // the same line of the row, and only one of them matters at a time.
          alarm={Boolean(error)}
          detail={
            error ??
            (state
              ? t('add.indexAsOf', {
                  count: state.count,
                  date: new Date(state.fetchedAt).toLocaleDateString(i18n.language),
                })
              : t('add.indexMissing'))
          }
          value={
            locked
              ? t('add.seNeedsEmail')
              : busy
                ? fraction
                  ? `${Math.round(fraction * 100)}%`
                  : t('add.updating')
                : state
                  ? t('add.update')
                  : t('add.getList')
          }
          onPress={locked || busy ? undefined : update}
          last={!(source.credential && email)}
        />
      ) : null}

      {source.credential && email ? (
        <Row
          label={t('add.seForget')}
          onPress={() =>
            forgetStandardEbooksEmail().then(() => {
              setEmail(null);
              setTested(null);
              setWorks(false);
            })
          }
          danger
          last
        />
      ) : null}
    </Section>
    {/* Where their door is shut, how it opens. Nobody can guess this one. */}
    {source.credential && !email ? <Hint>{t('add.seHowToGet')}</Hint> : null}
    </>
  );
}

const styles = StyleSheet.create({
  /** Inside the card, under its row, separated by a rule rather than a gap. */
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
});
