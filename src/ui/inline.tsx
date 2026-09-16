import { useEffect, useState } from 'react';
import { StyleSheet, TextInput, type TextStyle } from 'react-native';
import { usePalette } from '../theme';

/**
 * Looks like text, edits like a field. Tapping the value is the edit — a
 * separate form section repeating the same four values would be the same
 * information twice, with the copy you can't touch on top.
 */
export function InlineText({ value, placeholder, onCommit, style, multiline }: {
  value: string | null;
  placeholder?: string;
  onCommit: (next: string) => void;
  style?: TextStyle | TextStyle[];
  multiline?: boolean;
}) {
  const palette = usePalette();
  const [draft, setDraft] = useState(value ?? '');
  useEffect(() => setDraft(value ?? ''), [value]);

  return (
    <TextInput
      value={draft}
      onChangeText={setDraft}
      onBlur={() => draft !== (value ?? '') && onCommit(draft.trim())}
      placeholder={placeholder}
      placeholderTextColor={palette.faint}
      multiline={multiline}
      scrollEnabled={false}
      style={[styles.base, style]}
    />
  );
}

const styles = StyleSheet.create({
  // Zero padding keeps it aligned with the static text it sits beside.
  base: { padding: 0, margin: 0 },
});
