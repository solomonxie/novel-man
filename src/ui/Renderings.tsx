import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useFocusEffect } from '../navigation/router';
import {
  deleteTerm,
  listTermsFor,
  markStaleContaining,
  upsertTerm,
  type Term,
} from '../db/translation';
import { labelFor, targetLanguages } from '../translate/languages';
import { Block, Empty } from './detail';
import { PickerSheet } from './PickerSheet';
import { space, usePalette } from '../theme';

/**
 * What this one is called in the other language.
 *
 * A chapter's translation is a page of its own because a chapter is thousands
 * of sentences; a name is one word, and a page to hold one word is a page
 * nobody should have to open. So a language is added here and typed here, and
 * what is typed is the book's glossary itself — the same row the word mapping
 * shows, shared with every chapter, which is why correcting it here marks the
 * sentences that used the old name for re-translation.
 */
export function Renderings({ bookId, entityId, name }: {
  bookId: string;
  entityId: string;
  name: string;
}) {
  const { t } = useTranslation();
  const palette = usePalette();
  const [rows, setRows] = useState<Term[]>([]);
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    if (!name.trim()) return setRows([]);
    listTermsFor(bookId, entityId, name).then(setRows);
  }, [bookId, entityId, name]);

  useFocusEffect(load);

  async function add(target: string) {
    setAdding(false);
    await upsertTerm({ bookId, target, source: name, translation: '', entityId });
    load();
  }

  /** Renaming what a name is called is what makes translated sentences wrong. */
  async function save(term: Term, translation: string) {
    await upsertTerm({
      bookId,
      target: term.target,
      source: term.source,
      translation,
      locked: !!term.locked,
      entityId,
    });
    const affected = await markStaleContaining(bookId, term.target, term.source);
    load();
    if (affected > 0) {
      Alert.alert(t('translate.termAdded'), t('translate.termAffects', { count: affected }));
    }
  }

  function remove(term: Term) {
    Alert.alert(t('entity.removeRendering', { language: labelFor(term.target) }), undefined, [
      { text: t('settings.cancel'), style: 'cancel' },
      {
        text: t('settings.delete'),
        style: 'destructive',
        onPress: async () => {
          await deleteTerm(term.id);
          load();
        },
      },
    ]);
  }

  // Nothing to be called until it is called something.
  if (!name.trim()) return null;

  const left = targetLanguages.filter((entry) => !rows.some((row) => row.target === entry.code));

  return (
    <>
      <Block
        title={t('book.translations')}
        action={left.length ? { label: '＋', onPress: () => setAdding(true) } : undefined}
      >
        {rows.length === 0 ? (
          <Empty
            text={t('entity.noRenderings')}
            action={{ label: t('entity.addRendering'), onPress: () => setAdding(true) }}
          />
        ) : (
          <View style={[styles.box, { borderColor: palette.border }]}>
            {rows.map((row, index) => (
              <RenderingRow
                key={row.id}
                term={row}
                last={index === rows.length - 1}
                placeholder={name}
                onSave={(value) => save(row, value)}
                onRemove={() => remove(row)}
              />
            ))}
          </View>
        )}
      </Block>

      <PickerSheet
        visible={adding}
        title={t('translate.addLanguage')}
        options={left.map((entry) => ({ id: entry.code, label: entry.label }))}
        onPick={add}
        onClose={() => setAdding(false)}
      />
    </>
  );
}

function RenderingRow({ term, last, placeholder, onSave, onRemove }: {
  term: Term;
  last: boolean;
  placeholder: string;
  onSave: (value: string) => void;
  onRemove: () => void;
}) {
  const palette = usePalette();
  const [draft, setDraft] = useState(term.translation);

  return (
    <View
      style={[
        styles.row,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: palette.border },
      ]}
    >
      <Text style={{ color: palette.dim, fontSize: 15, width: 96 }}>{labelFor(term.target)}</Text>
      <TextInput
        value={draft}
        onChangeText={setDraft}
        onBlur={() => draft.trim() !== term.translation && onSave(draft.trim())}
        placeholder={placeholder}
        placeholderTextColor={palette.faint}
        style={{ color: palette.text, fontSize: 16, flex: 1 }}
      />
      <Pressable onPress={onRemove} hitSlop={8}>
        <Text style={{ color: palette.faint, fontSize: 17 }}>✕</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
});
