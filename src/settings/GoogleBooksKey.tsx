import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  forgetGoogleBooksKey,
  googleBooksKey,
  saveGoogleBooksKey,
} from '../sources/googleBooksKey';
import { Row } from '../ui/primitives';
import { radius, space, usePalette } from '../theme';

const CONSOLE = 'https://console.cloud.google.com/apis/library/books.googleapis.com';

/**
 * The key, offered where you find out you need it: under a lookup that came
 * back short. A settings page would be the wrong home — nobody goes looking for
 * a catalog credential they have never heard of, and the moment it means
 * anything is the moment a book would not come back.
 *
 * Rows, like the ESV key, so the caller can lay them among its own.
 */
export function GoogleBooksKeyRows({ onSaved }: { onSaved?: () => void }) {
  const { t } = useTranslation();
  const palette = usePalette();
  const [keyed, setKeyed] = useState(false);
  /** The last four, which tells two keys apart without showing either. */
  const [tail, setTail] = useState('');
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    googleBooksKey().then((value) => {
      setKeyed(Boolean(value));
      setTail(value ? value.slice(-4) : '');
    });
  }, []);

  return (
    <>
      <Row
        label={t('identify.keyRow')}
        detail={keyed ? undefined : t('identify.keyWhy')}
        value={keyed ? t('identify.keySet', { tail }) : t('identify.keyNone')}
        onPress={() => setOpen((was) => !was)}
      />
      {open && !keyed ? (
        <View style={[styles.box, { borderColor: palette.border }]}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={t('identify.keyPaste')}
            placeholderTextColor={palette.faint}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            style={[styles.input, { color: palette.text, borderColor: palette.border }]}
          />
          <Text style={{ color: palette.dim, fontSize: 12 }}>{t('identify.keyStays')}</Text>
          <Pressable onPress={() => void Linking.openURL(CONSOLE)}>
            <Text style={{ color: palette.accent, fontSize: 12 }}>{t('identify.keyWhere')}</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              if (!draft.trim()) return;
              void saveGoogleBooksKey(draft).then(() => {
                setKeyed(true);
                setTail(draft.trim().slice(-4));
                setDraft('');
                setOpen(false);
                // Saving a key is only ever done in order to ask again.
                onSaved?.();
              });
            }}
            style={styles.save}
          >
            <Text style={{ color: palette.accent, fontSize: 16 }}>{t('lookup.save')}</Text>
          </Pressable>
        </View>
      ) : null}
      {keyed && open ? (
        <Row
          label={t('identify.keyForget')}
          onPress={() =>
            void forgetGoogleBooksKey().then(() => {
              setKeyed(false);
              setTail('');
              setOpen(false);
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
