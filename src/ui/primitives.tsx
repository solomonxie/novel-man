import { Image, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { radius, space, usePalette } from '../theme';

export function Section({ title, action, children }: {
  title?: string;
  action?: { label: string; onPress: () => void };
  children: React.ReactNode;
}) {
  const palette = usePalette();
  return (
    <View style={{ marginTop: space.xl }}>
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

export function Hint({ children }: { children: React.ReactNode }) {
  const palette = usePalette();
  return (
    <Text style={{ color: palette.dim, fontSize: 13, paddingHorizontal: space.xs, marginTop: space.xs }}>
      {children}
    </Text>
  );
}

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
