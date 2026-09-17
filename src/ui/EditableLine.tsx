import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, type TextStyle } from 'react-native';
import { usePalette } from '../theme';

/**
 * Text until you tap it, a field after. A `TextInput` is a native view: five
 * hundred chapters with an editable title and brief mounts a thousand of them
 * and the list takes seconds to appear. Only the line being edited needs to be
 * a real input, and only one line is ever edited at a time.
 */
export function EditableLine({ value, placeholder, onCommit, style, multiline, numberOfLines }: {
  value: string | null;
  placeholder?: string;
  onCommit: (next: string) => void;
  style?: TextStyle | TextStyle[];
  multiline?: boolean;
  numberOfLines?: number;
}) {
  const palette = usePalette();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  if (!editing) {
    const shown = value?.trim();
    return (
      <Pressable
        onPress={() => {
          setDraft(value ?? '');
          setEditing(true);
        }}
        hitSlop={4}
      >
        <Text
          numberOfLines={numberOfLines ?? (multiline ? 3 : 1)}
          style={[style, !shown && { color: palette.faint }]}
        >
          {shown || placeholder}
        </Text>
      </Pressable>
    );
  }

  return (
    <TextInput
      value={draft}
      onChangeText={setDraft}
      onBlur={() => {
        setEditing(false);
        if (draft.trim() !== (value ?? '').trim()) onCommit(draft.trim());
      }}
      placeholder={placeholder}
      placeholderTextColor={palette.faint}
      multiline={multiline}
      autoFocus
      scrollEnabled={false}
      style={[styles.input, style]}
    />
  );
}

const styles = StyleSheet.create({
  // Zero padding keeps the field on the same baseline as the text it replaced.
  input: { padding: 0, margin: 0 },
});
