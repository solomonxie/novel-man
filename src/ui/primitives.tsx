import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Switch, Text, TextInput, View, type ViewStyle } from 'react-native';
import { imageUri } from '../storage/files';
import { radius, space, usePalette } from '../theme';

/**
 * "That worked", for a moment. An action that copies something and then says
 * nothing leaves you pressing it again to find out whether the first press
 * took — so anything whose whole effect happens somewhere else says so here.
 *
 * Its own colours, not the palette's: it sits over the page rather than in it,
 * and has to read against whatever is under it.
 */
export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View style={styles.toast} pointerEvents="none">
      <Text style={{ color: '#FFFFFF', fontSize: 13 }}>{message}</Text>
    </View>
  );
}

/** The message and the timer that takes it away, so a caller only says what happened. */
export function useFlash(ms = 1200) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flash = useCallback(
    (next: string) => {
      setMessage(next);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setMessage(null), ms);
    },
    [ms]
  );
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return { message, flash };
}

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

export function Row({ label, value, detail, onPress, danger, alarm, last }: {
  label: string;
  value?: string;
  /** A second line under the label, for what the row is rather than where it goes. */
  detail?: string;
  onPress?: () => void;
  /** The row itself is destructive: its label is the warning. */
  danger?: boolean;
  /**
   * The row is fine, but what it is reporting went wrong — so the state and
   * the reason are red and the label stays what it always was.
   */
  alarm?: boolean;
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
          <Text
            numberOfLines={3}
            style={{ color: alarm ? palette.danger : palette.dim, fontSize: 13, marginTop: 2 }}
          >
            {detail}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text style={{ color: alarm ? palette.danger : palette.dim, fontSize: 15 }}>{value}</Text>
      ) : null}
    </Pressable>
  );
}

/**
 * A destination is a switch and nothing else. The moment "back up here" and
 * "do it automatically" are two controls, nobody can predict what any
 * combination of them does.
 */
export function Toggle({ label, detail, directions, value, onChange, onPress, disabled, last }: {
  label: string;
  detail?: string;
  /** Shown accented under the detail, and only where the user can act on it. */
  directions?: string;
  value: boolean;
  onChange: (next: boolean) => void;
  /**
   * Where the row leads, when the switch is not the only thing it can do. The
   * text side goes there; the switch keeps its own job, which is what stops a
   * thumb aiming for one from doing the other.
   */
  onPress?: () => void;
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
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        style={({ pressed }) => [{ flexShrink: 1, flex: 1, opacity: pressed ? 0.6 : 1 }]}
      >
        <Text style={{ color: disabled ? palette.dim : palette.text, fontSize: 16 }}>
          {label}
          {onPress ? <Text style={{ color: palette.accent }}>{'  ›'}</Text> : null}
        </Text>
        {detail ? (
          <Text style={{ color: palette.dim, fontSize: 13, marginTop: 2 }}>{detail}</Text>
        ) : null}
        {directions ? (
          <Text style={{ color: palette.accent, fontSize: 13, marginTop: 2 }}>{directions}</Text>
        ) : null}
      </Pressable>
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
/** The handle every sheet is dragged by, and the sign that it can be. */
export function Grabber() {
  const palette = usePalette();
  return <View style={[styles.grabber, { backgroundColor: palette.faint }]} />;
}

export function Cover({ title, hue, width, path }: {
  title: string;
  hue: number;
  width: number;
  path?: string | null;
}) {
  const height = Math.round(width * 1.45);
  // Resolved rather than used as written: what is stored is a name, and what
  // a path from an older install points at no longer exists. See `imageUri`.
  const uri = path ? imageUri(path) : undefined;
  if (uri) {
    return <Image source={{ uri }} style={[styles.cover, { width, height }]} />;
  }
  return (
    <View style={[styles.cover, { width, height, backgroundColor: `hsl(${hue}, 32%, 62%)` }]}>
      <Text numberOfLines={4} style={styles.coverTitle}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: space.sm,
    opacity: 0.5,
  },
  toast: {
    position: 'absolute',
    bottom: 80,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: 16,
  },
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
