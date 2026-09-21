import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { EsvError, lookUpEsv } from '../sources/esv';
import { ESV_SOURCE } from '../sources/esvBook';
import { esvKey, forgetEsvKey, saveEsvKey } from '../sources/esvKey';
import { clearCached, countCached } from '../sources/passages';
import { Row } from '../ui/primitives';
import { radius, space, usePalette } from '../theme';

export type EsvKeyState = { keyed: boolean; ok: boolean; busy: boolean; tail: string };

/**
 * The key, wherever someone is standing when they need it. It was only on the
 * Add page, which is the one place you are *not* when the key expires: by then
 * the book is on the shelf, every chapter it opens comes back empty, and the
 * page saying why is behind a door marked "add a book".
 *
 * Rows rather than a card, so a caller can put its own row among them.
 */
export function EsvKeyRows({ onState, children }: {
  onState?: (state: EsvKeyState) => void;
  /** A row of the caller's own, under the key and its test. */
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const palette = usePalette();
  const [keyed, setKeyed] = useState(false);
  /** The last four characters of what is stored — enough to tell two keys
   *  apart without ever showing one. */
  const [tail, setTail] = useState('');
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [tested, setTested] = useState<string | null>(null);
  /** Tested and answered, not merely present: a refused key buys empty chapters. */
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(0);

  useEffect(() => {
    esvKey().then((token) => {
      setKeyed(Boolean(token));
      setTail(token ? token.slice(-4) : '');
    });
    countCached(ESV_SOURCE).then(setSaved);
  }, []);

  useEffect(() => {
    onState?.({ keyed, ok, busy, tail });
    // The caller wants the state, not a new callback every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyed, ok, busy, tail]);

  /** One verse, which is how you find out whether a key works at all. */
  async function test() {
    setBusy(true);
    setTested(null);
    try {
      await lookUpEsv('John 1:1', await esvKey());
      setOk(true);
    } catch (problem: unknown) {
      setOk(false);
      setTested(t(`lookup.${problem instanceof EsvError ? problem.code : 'offline'}`));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Row
        label={t('add.esvKeyRow')}
        value={keyed ? t('add.esvKeySet', { tail }) : t('add.esvKeyNone')}
        onPress={() => setOpen((was) => !was)}
      />
      {/* Under the row it belongs to, inside the same card: a field that opens
          a screen away from what was tapped reads as a different question. */}
      {open ? (
        <View style={[styles.box, { borderColor: palette.border }]}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={t('lookup.paste')}
            placeholderTextColor={palette.faint}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            style={[styles.input, { color: palette.text, borderColor: palette.border }]}
          />
          <Text style={{ color: palette.dim, fontSize: 12 }}>{t('lookup.keyStaysHere')}</Text>
          <Pressable
            onPress={() => {
              if (!draft.trim()) return;
              saveEsvKey(draft).then(async () => {
                setKeyed(true);
                setTail(((await esvKey()) ?? '').slice(-4));
                setDraft('');
                setOpen(false);
                setOk(false);
                void test();
              });
            }}
            style={styles.save}
          >
            <Text style={{ color: palette.accent, fontSize: 16 }}>{t('lookup.save')}</Text>
          </Pressable>
        </View>
      ) : null}

      {keyed ? (
        <Row
          label={t('add.esvTest')}
          // Why it failed is a sentence, and a sentence goes under the label
          // rather than into the narrow column beside it.
          detail={tested ?? undefined}
          alarm={Boolean(tested)}
          value={
            busy
              ? t('add.esvTesting')
              : ok
                ? t('add.esvKeyWorks')
                : tested
                  ? t('add.esvRetest')
                  : t('add.esvTestNow')
          }
          onPress={busy ? undefined : test}
        />
      ) : null}

      {children}

      {saved ? (
        <Row
          label={t('lookup.savedCount', { count: saved })}
          detail={t('lookup.savedHint')}
          value={t('lookup.clear')}
          onPress={() => clearCached(ESV_SOURCE).then(() => setSaved(0))}
        />
      ) : null}
      {keyed ? (
        <Row
          label={t('lookup.forget')}
          onPress={() =>
            forgetEsvKey().then(() => {
              setKeyed(false);
              setOpen(false);
              setTested(null);
              setOk(false);
              setTail('');
            })
          }
          danger
          last
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  box: { padding: space.lg, gap: space.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    fontSize: 15,
  },
  save: { alignSelf: 'flex-end', paddingVertical: space.xs, paddingHorizontal: space.sm },
});
