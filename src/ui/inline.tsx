import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, type TextStyle } from 'react-native';
import { usePalette } from '../theme';

/**
 * Looks like text, edits like a field. Tapping the value is the edit — a
 * separate form section repeating the same four values would be the same
 * information twice, with the copy you can't touch on top.
 *
 * It is a `Text` until it is tapped, and that is the point: a field that is
 * always a field takes the focus off a finger that was only scrolling past it,
 * and a summary five lines long is most of what there is to scroll past. A
 * press on a `Text` is cancelled the moment the touch moves, so a scroll
 * stays a scroll.
 */
export function InlineText({ value, placeholder, onCommit, style, multiline, lines, onLineCount }: {
  value: string | null;
  placeholder?: string;
  onCommit: (next: string) => void;
  style?: TextStyle | TextStyle[];
  multiline?: boolean;
  /** Show this many lines and cut the rest — only while it is being read. */
  lines?: number;
  /** How many it took to lay out, so the caller can offer to unfold it. */
  onLineCount?: (count: number) => void;
}) {
  const palette = usePalette();
  const [draft, setDraft] = useState(value ?? '');
  const [editing, setEditing] = useState(false);
  useEffect(() => setDraft(value ?? ''), [value]);

  if (!editing) {
    const shown = (value ?? '').trim();
    return (
      <Text
        onPress={() => setEditing(true)}
        suppressHighlighting
        numberOfLines={lines}
        onTextLayout={
          onLineCount ? (event) => onLineCount(event.nativeEvent.lines.length) : undefined
        }
        style={[styles.base, style, shown ? null : { color: palette.faint }]}
      >
        {shown || placeholder || ' '}
      </Text>
    );
  }

  return (
    <TextInput
      value={draft}
      onChangeText={setDraft}
      onBlur={() => {
        setEditing(false);
        if (draft !== (value ?? '')) onCommit(draft.trim());
      }}
      placeholder={placeholder}
      placeholderTextColor={palette.faint}
      multiline={multiline}
      scrollEnabled={false}
      autoFocus
      style={[styles.base, style]}
    />
  );
}

const styles = StyleSheet.create({
  // Zero padding keeps it aligned with the static text it sits beside.
  base: { padding: 0, margin: 0 },
});
