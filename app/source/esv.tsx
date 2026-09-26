import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router, Stack } from '../../src/navigation/router';
import { useTranslation } from 'react-i18next';

import { addEsvBook, ESV_SOURCE, ESV_TITLE } from '../../src/sources/esvBook';
import { findRemoteBook } from '../../src/db/repo';
import { EsvKeyRows, type EsvKeyState } from '../../src/settings/EsvKey';
import { Hint, PrimaryAction, Section } from '../../src/ui/primitives';
import { space, usePalette } from '../../src/theme';

/**
 * The one edition nobody may hand over, on a page of its own like every other
 * source.
 *
 * It used to unfold inside the add menu, which made the source with the most
 * to explain — why it needs a key, where the key comes from, what "fetched
 * when you open it" means for reading on a plane — the one with the least room
 * to say it. A page has room, and room to grow: the next thing worth writing
 * about this licence goes here rather than into a row's second line.
 *
 * Nothing folds. The page is already the answer to "what is this"; a field
 * behind a disclosure on a screen of its own is a door behind a door.
 */
export default function EsvSource() {
  const { t } = useTranslation();
  const palette = usePalette();
  const [state, setState] = useState<EsvKeyState>({
    keyed: false, ok: false, busy: false, tail: '',
  });
  const [onShelf, setOnShelf] = useState<string | null>(null);

  useEffect(() => {
    findRemoteBook(ESV_SOURCE)
      .then((found) => setOnShelf(found?.id ?? null))
      .catch(() => undefined);
  }, []);

  async function add() {
    const existing = await findRemoteBook(ESV_SOURCE);
    router.push(`/book/${existing?.id ?? (await addEsvBook())}`);
  }

  const ready = Boolean(onShelf) || state.ok;

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      <Stack.Screen options={{ title: ESV_TITLE, headerBackTitle: ' ' }} />

      <Hint>{t('add.esvWhy')}</Hint>

      <Section title={t('add.esvKeyRow')}>
        <EsvKeyRows flat onState={setState} />
      </Section>
      <Hint>{t('add.esvAddWhat')}</Hint>

      <View style={{ marginTop: space.lg }}>
        <PrimaryAction
          label={onShelf ? t('add.open') : t('add.esvAdd', { title: ESV_TITLE })}
          onPress={ready && !state.busy ? add : () => undefined}
          style={ready && !state.busy ? undefined : { opacity: 0.5 }}
        />
      </View>
      {ready ? null : (
        <Hint>{state.keyed ? t('add.esvTestFirst') : t('add.esvNeedsKey')}</Hint>
      )}
    </ScrollView>
  );
}
