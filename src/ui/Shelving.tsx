import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
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
  const [deleting, setDeleting] = useState(false);
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

  /**
   * A tag leads to everything else filed under it, and that is all a tap does
   * — it used to ask which of two things you meant, every single time, for a
   * gesture nobody uses to delete. Taking one off is a mode instead: entered
   * on purpose, left on purpose, and while it lasts every chip is a ✕.
   */
  async function tapped(tag: string) {
    if (!deleting) {
      router.push(`/tag/${encodeURIComponent(tag)}`);
      return;
    }
    await removeTag(bookId, tag);
    load();
  }

  return (
    <Block title={t('lists.tags')}>
      {tags.length ? (
        <ChipRow>
          {tags.map((tag) => (
            <Chip
              key={tag}
              label={tag}
              hue={deleting ? undefined : hueFrom(tag)}
              glyph={deleting ? <Text style={{ color: palette.danger, fontSize: 15 }}>✕</Text> : undefined}
              onPress={() => tapped(tag)}
            />
          ))}
        </ChipRow>
      ) : (
        <Text style={{ color: palette.dim, fontSize: 14, paddingHorizontal: space.xs }}>
          {t('lists.noTagsYet')}
        </Text>
      )}

      {/* Under the tags, saying what each one does. A ＋ in the heading is a
          glyph in the corner of a block, which is where a thing goes when
          nobody is meant to find it. */}
      <View style={styles.footer}>
        <Pressable
          onPress={() => {
            setDeleting(false);
            setOpen((was) => !was);
          }}
          hitSlop={8}
        >
          <Text style={{ color: palette.accent, fontSize: 14, fontWeight: '600' }}>
            {open ? t('lists.done') : t('lists.addTag')}
          </Text>
        </Pressable>
        {tags.length ? (
          <Pressable
            onPress={() => {
              setOpen(false);
              setDeleting((was) => !was);
            }}
            hitSlop={8}
          >
            <Text
              style={{
                color: deleting ? palette.accent : palette.danger,
                fontSize: 14,
                fontWeight: '600',
              }}
            >
              {deleting ? t('lists.done') : t('lists.removeTags')}
            </Text>
          </Pressable>
        ) : null}
      </View>

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
  footer: {
    flexDirection: 'row',
    gap: space.xl,
    paddingHorizontal: space.xs,
    paddingTop: space.md,
  },
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
