import { Image, Pressable, StyleSheet, Switch, Text, TextInput, View, type ViewStyle } from 'react-native';
import { radius, space, usePalette } from '../theme';

export function Section({ title, action, flush, children }: {
  title?: string;
  action?: { label: string; onPress: () => void };
  /** Already inside something that spaced it — don't space it twice. */
  flush?: boolean;
  children: React.ReactNode;
}) {
  const palette = usePalette();
  return (
    <View style={{ marginTop: flush ? 0 : space.xl }}>
      {(title || action) && (
        <View style={styles.sectionHead}>
          <Text style={[styles.sectionTitle, { color: palette.dim }]}>{title?.toUpperCase()}</Text>
          {action && (
            <Pressable onPress={action.onPress} hitSlop={8}>
              <Text style={{ color: palette.accent, fontSize: 15 }}>{action.label}</Text>
            </Pressable>
          )}
        </View>
      )}
      <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        {children}
      </View>
    </View>
  );
}

export function Row({ label, value, detail, onPress, danger, last }: {
  label: string;
  value?: string;
  /** A second line under the label, for what the row is rather than where it goes. */
  detail?: string;
  onPress?: () => void;
  danger?: boolean;
  last?: boolean;
}) {
  const palette = usePalette();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: palette.border }]}
    >
      <View style={{ flexShrink: 1, flex: 1 }}>
        <Text style={{ color: danger ? palette.danger : palette.text, fontSize: 16 }}>{label}</Text>
        {detail ? (
          <Text numberOfLines={2} style={{ color: palette.dim, fontSize: 13, marginTop: 2 }}>
            {detail}
          </Text>
        ) : null}
      </View>
      {value ? <Text style={{ color: palette.dim, fontSize: 15 }}>{value}</Text> : null}
    </Pressable>
  );
}

/**
 * A destination is a switch and nothing else. The moment "back up here" and
 * "do it automatically" are two controls, nobody can predict what any
 * combination of them does.
 */
export function Toggle({ label, detail, directions, value, onChange, disabled, last }: {
  label: string;
  detail?: string;
  /** Shown accented under the detail, and only where the user can act on it. */
  directions?: string;
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  last?: boolean;
}) {
  const palette = usePalette();
  return (
    <View
      style={[
        styles.row,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: palette.border },
      ]}
    >
      <View style={{ flexShrink: 1, flex: 1 }}>
        <Text style={{ color: disabled ? palette.dim : palette.text, fontSize: 16 }}>{label}</Text>
        {detail ? (
          <Text style={{ color: palette.dim, fontSize: 13, marginTop: 2 }}>{detail}</Text>
        ) : null}
        {directions ? (
          <Text style={{ color: palette.accent, fontSize: 13, marginTop: 2 }}>{directions}</Text>
        ) : null}
      </View>
      <Switch value={value} onValueChange={onChange} disabled={disabled} />
    </View>
  );
}

export function Hint({ children }: { children: React.ReactNode }) {
  const palette = usePalette();
  return (
    <Text style={{ color: palette.dim, fontSize: 13, paddingHorizontal: space.xs, marginTop: space.xs }}>
      {children}
    </Text>
  );
}

/**
 * One field, on every list long enough to need one. A list you can scroll in a
 * flick doesn't get it: the box would cost more attention than the scroll.
 */
export function Search({ value, onChange, placeholder, onSubmit }: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  /** Set when the list is somebody else's catalog: the return key runs it. */
  onSubmit?: () => void;
}) {
  const palette = usePalette();
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={palette.faint}
      autoCapitalize="none"
      autoCorrect={false}
      clearButtonMode="while-editing"
      returnKeyType={onSubmit ? 'search' : 'done'}
      onSubmitEditing={onSubmit}
      style={[
        styles.search,
        { color: palette.text, backgroundColor: palette.surface, borderColor: palette.border },
      ]}
    />
  );
}

/** Past this many rows, finding one by eye is slower than typing its name. */
export const SEARCHABLE_FROM = 8;

export function PrimaryAction({ label, onPress, style }: {
  label: string;
  onPress: () => void;
  style?: ViewStyle;
}) {
  const palette = usePalette();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.primary,
        { backgroundColor: palette.accent, opacity: pressed ? 0.85 : 1 },
        style,
      ]}
    >
      <Text style={[styles.primaryLabel, { color: palette.onAccent }]}>{label}</Text>
    </Pressable>
  );
}

/** Cover falls through user-set → generated → placeholder; it is never blank. */
export function Cover({ title, hue, width, path }: {
  title: string;
  hue: number;
  width: number;
  path?: string | null;
}) {
  const height = Math.round(width * 1.45);
  if (path) {
    return <Image source={{ uri: path }} style={[styles.cover, { width, height }]} />;
  }
  return (
    <View style={[styles.cover, { width, height, backgroundColor: `hsl(${hue}, 32%, 62%)` }]}>
      <Text numberOfLines={4} style={styles.coverTitle}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: space.xs,
    marginBottom: space.sm,
  },
  sectionTitle: { fontSize: 12, letterSpacing: 0.8, fontWeight: '600' },
  card: { borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md + 2,
  },
  search: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    fontSize: 15,
  },
  primary: {
    borderRadius: radius.md,
    paddingVertical: space.md + 2,
    alignItems: 'center',
  },
  primaryLabel: { fontSize: 17, fontWeight: '600' },
  cover: {
    borderRadius: radius.sm,
    padding: space.sm,
    justifyContent: 'flex-end',
  },
  coverTitle: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
});
