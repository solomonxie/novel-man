import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { radius, space, usePalette } from '../theme';

/** Edits commit on blur — a Save button on every field would be five taps a page. */
export function EditableRow({ label, value, placeholder, onCommit, multiline, last }: {
  label: string;
  value: string | null;
  placeholder?: string;
  onCommit: (next: string) => void;
  multiline?: boolean;
  last?: boolean;
}) {
  const palette = usePalette();
  const [draft, setDraft] = useState(value ?? '');
  useEffect(() => setDraft(value ?? ''), [value]);

  return (
    <View
      style={[
        styles.row,
        multiline && { alignItems: 'flex-start' },
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: palette.border },
      ]}
    >
      <Text style={{ color: palette.dim, fontSize: 15, width: 96 }}>{label}</Text>
      <TextInput
        value={draft}
        onChangeText={setDraft}
        onBlur={() => draft !== (value ?? '') && onCommit(draft)}
        placeholder={placeholder}
        placeholderTextColor={palette.faint}
        multiline={multiline}
        style={{ color: palette.text, fontSize: 16, flex: 1, minHeight: multiline ? 60 : undefined }}
      />
    </View>
  );
}

/** Never blank: a picked image, else initials on a colour derived from the name. */
export function Portrait({ name, path, hue, size, onPick }: {
  name: string;
  path: string | null;
  hue: number;
  size: number;
  onPick?: (uri: string) => void;
}) {
  const palette = usePalette();
  const body = path ? (
    <Image source={{ uri: path }} style={{ width: size, height: size, borderRadius: size / 2 }} />
  ) : (
    <View
      style={[
        styles.fallback,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: `hsl(${hue}, 30%, 58%)` },
      ]}
    >
      <Text style={{ color: '#FFFFFF', fontSize: size * 0.36, fontWeight: '600' }}>
        {initials(name)}
      </Text>
    </View>
  );

  if (!onPick) return body;
  return (
    <Pressable onPress={() => pickImage().then((uri) => uri && onPick(uri))}>
      {body}
      <View style={[styles.badge, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <Text style={{ fontSize: 11 }}>✎</Text>
      </View>
    </Pressable>
  );
}

export async function pickImage(): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8,
  });
  return result.canceled ? null : result.assets[0].uri;
}

export function initials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  // CJK names have no spaces; the last one or two characters read as the name.
  if (/[㐀-鿿]/.test(trimmed)) return trimmed.slice(0, 2);
  return trimmed
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function hueFrom(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) % 360;
  return hash;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  fallback: { alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
