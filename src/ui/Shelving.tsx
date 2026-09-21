import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { router, useFocusEffect } from '../navigation/router';
import { Block, Chip, ChipRow } from './detail';
import { hueFrom } from './fields';
import { addTag, removeTag, tagsOf } from '../db/shelves';
import { radius, space, usePalette } from '../theme';

/**
 * What the reader would file this book under — said *about* the book, which
 * is why it lives on its page where the lists it is in do not. Chips, and one
 * ＋ that opens the way to say another.
 */
export function TagsBlock({ bookId }: { bookId: string }) {
  const { t } = useTranslation();
  const palette = usePalette();
  const [tags, setTags] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');

  const load = useCallback(() => {
    tagsOf(bookId).then(setTags).catch(() => undefined);
  }, [bookId]);

  useFocusEffect(load);

  async function add() {
    if (!draft.trim()) return;
    await addTag(bookId, draft);
    setDraft('');
    load();
  }

  // Tapping a tag is how you get to everything else under it; taking it off
  // is the rarer thing, so it asks first rather than hiding behind a ✕.
  function askAbout(tag: string) {
    Alert.alert(tag, t('lists.tagWhat'), [
      { text: t('settings.cancel'), style: 'cancel' },
      { text: t('lists.tagOpen'), onPress: () => router.push(`/tag/${encodeURIComponent(tag)}`) },
      {
        text: t('lists.tagRemove'),
        style: 'destructive',
        onPress: async () => {
          await removeTag(bookId, tag);
          load();
        },
      },
    ]);
  }

  return (
    <Block
      title={t('lists.tags')}
      action={{ label: open ? t('lists.done') : t('lists.add'), onPress: () => setOpen((was) => !was) }}
    >
      {tags.length ? (
        <ChipRow>
          {tags.map((tag) => (
            <Chip key={tag} label={tag} hue={hueFrom(tag)} onPress={() => askAbout(tag)} />
          ))}
        </ChipRow>
      ) : (
        <Text style={{ color: palette.dim, fontSize: 14, paddingHorizontal: space.xs }}>
          {t('lists.noTagsYet')}
        </Text>
      )}

      {open ? (
        <View style={[styles.panel, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <View style={styles.row}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={t('lists.newTag')}
              placeholderTextColor={palette.faint}
              style={{ flex: 1, color: palette.text, fontSize: 16 }}
              returnKeyType="done"
              onSubmitEditing={add}
              autoCapitalize="none"
            />
            <Pressable onPress={add} hitSlop={8} disabled={!draft.trim()}>
              <Text style={{ color: draft.trim() ? palette.accent : palette.faint, fontSize: 15 }}>
                {t('lists.addButton')}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </Block>
  );
}

const styles = StyleSheet.create({
  panel: {
    marginHorizontal: space.xs,
    marginTop: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
  },
});
