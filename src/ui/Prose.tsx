import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextStyle } from 'react-native';
import { useTranslation } from 'react-i18next';

import { space, usePalette } from '../theme';

const LINE = 23;

/**
 * A paragraph or several, read before it is written on.
 *
 * `EditableLine` opens a keyboard the moment a finger lands on it, which is
 * right for a name and wrong for prose: a page of recalled chapter is
 * something you read, and a stray tap in the middle of reading it should not
 * put a cursor in it. So touching it opens it out instead, and editing is a
 * word of its own — offered only once it is open far enough to see what you
 * would be editing, or when there is nothing there yet.
 */
export function Prose({ value, placeholder, lines = 3, style, onCommit }: {
  value: string | null;
  placeholder: string;
  /** How much shows before More. */
  lines?: number;
  style?: TextStyle;
  onCommit: (next: string) => void;
}) {
  const { t } = useTranslation();
  const palette = usePalette();
  const [open, setOpen] = useState(false);
  const [measured, setMeasured] = useState(0);
  const [writing, setWriting] = useState(false);
  const [draft, setDraft] = useState('');

  const filled = value?.trim() ?? '';

  return (
    <View>
      {writing ? (
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={placeholder}
          placeholderTextColor={palette.faint}
          multiline
          autoFocus
          scrollEnabled={false}
          style={[{ color: palette.text, fontSize: 15, lineHeight: LINE, padding: 0 }, style]}
        />
      ) : (
        <Text
          onPress={() => setOpen((was) => !was)}
          suppressHighlighting
          numberOfLines={open ? undefined : lines}
          onTextLayout={(event) => setMeasured(event.nativeEvent.lines.length)}
          style={[
            { color: filled ? palette.text : palette.faint, fontSize: 15, lineHeight: LINE },
            style,
          ]}
        >
          {filled || placeholder}
        </Text>
      )}

      <View style={styles.foot}>
        {!writing && measured >= lines ? (
          <Text onPress={() => setOpen((was) => !was)} suppressHighlighting style={[styles.link, { color: palette.accent }]}>
            {t(open ? 'prose.less' : 'prose.more')}
          </Text>
        ) : null}
        {writing ? (
          <Text
            onPress={() => {
              setWriting(false);
              if (draft.trim() !== filled) onCommit(draft.trim());
            }}
            suppressHighlighting
            style={[styles.link, { color: palette.accent }]}
          >
            {t('settings.save')}
          </Text>
        ) : open || !filled ? (
          <Text
            onPress={() => {
              setDraft(value ?? '');
              setWriting(true);
            }}
            suppressHighlighting
            style={[styles.link, { color: palette.accent }]}
          >
            {t('prose.edit')}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  foot: { flexDirection: 'row', gap: space.lg, marginTop: space.sm },
  link: { fontSize: 14, fontWeight: '600' },
});
