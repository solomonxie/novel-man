import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { radius, space, usePalette } from '../theme';

/**
 * The shape every detail page shares. Before this each of them opened with the
 * same grey card of grey rows, so a chapter, a scene and a character were
 * indistinguishable at a glance and nothing on the page said which was the
 * important part. A page now opens with what it is about, what is true about
 * it, and what you can do to it — in that order, and in three different
 * weights.
 */
export function Hero({ eyebrow, avatar, children, facts, actions, note, onNotePress }: {
  eyebrow?: string;
  /** A face, when the page is about someone. It leads the line rather than floating above it. */
  avatar?: React.ReactNode;
  children: React.ReactNode;
  facts?: React.ReactNode;
  actions?: React.ReactNode;
  /** What a button would have had to wrap to say: where Continue resumes, what a pass costs. */
  note?: string;
  /** When the note is also the way somewhere — "Queued" is only useful if it leads to the queue. */
  onNotePress?: () => void;
}) {
  const palette = usePalette();
  const head = (
    <>
      {eyebrow ? (
        <Text style={[styles.eyebrow, { color: palette.accent }]}>{eyebrow.toUpperCase()}</Text>
      ) : null}
      {children}
    </>
  );
  return (
    <View style={[styles.hero, { backgroundColor: palette.surface, borderColor: palette.border }]}>
      {avatar ? (
        <View style={styles.heroRow}>
          {avatar}
          <View style={{ flex: 1 }}>{head}</View>
        </View>
      ) : (
        head
      )}
      {facts ? <View style={styles.facts}>{facts}</View> : null}
      {actions ? <View style={styles.actions}>{actions}</View> : null}
      {note ? (
        <Text
          numberOfLines={2}
          onPress={onNotePress}
          suppressHighlighting={!onNotePress}
          style={{
            color: onNotePress ? palette.accent : palette.dim,
            fontSize: 12,
            marginTop: space.sm,
          }}
        >
          {note}
        </Text>
      ) : null}
    </View>
  );
}

/** A number and what it counts, small enough to put four of them in a row. */
export function Fact({ value, label }: { value: string | number; label: string }) {
  const palette = usePalette();
  return (
    <View style={[styles.fact, { backgroundColor: palette.soft }]}>
      <Text style={{ color: palette.text, fontSize: 15, fontWeight: '700' }}>{value}</Text>
      <Text style={{ color: palette.dim, fontSize: 11, marginTop: 1 }}>{label}</Text>
    </View>
  );
}

/**
 * What a page is for, as a button rather than a row. A list row says "there is
 * more over here"; reading a chapter is not somewhere else, it is the thing.
 *
 * One line, always. A label that needs two rows is a label carrying something
 * that is not the action — which chapter you would resume at, what a pass
 * costs — and that belongs under the buttons, not inside one.
 */
export function Action({ label, onPress, tone = 'quiet' }: {
  label: string;
  onPress: () => void;
  tone?: 'loud' | 'quiet';
}) {
  const palette = usePalette();
  const loud = tone === 'loud';
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        {
          backgroundColor: loud ? palette.accent : palette.soft,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      <Text
        numberOfLines={1}
        style={{ color: loud ? palette.onAccent : palette.accent, fontSize: 15, fontWeight: '600' }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * A titled block with a count and an optional action on its own line. Sentence
 * case rather than the uppercase grey label a settings screen uses: this is a
 * page about a story, not a preferences list.
 */
export function Block({ title, count, action, onOpen, children }: {
  title: string;
  count?: number;
  action?: { label: string; onPress: () => void };
  /** The heading is the way to the full list — a row repeating the count isn't. */
  onOpen?: () => void;
  children: React.ReactNode;
}) {
  const palette = usePalette();
  return (
    <View style={{ marginTop: space.xl }}>
      <View style={styles.blockHead}>
        <Pressable
          onPress={onOpen}
          disabled={!onOpen}
          style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}
          hitSlop={6}
        >
          <Text style={{ color: palette.text, fontSize: 17, fontWeight: '700' }}>{title}</Text>
          {count !== undefined && (
            <Text style={{ color: palette.faint, fontSize: 15 }}>{count}</Text>
          )}
          {onOpen ? <Text style={{ color: palette.faint, fontSize: 15 }}>›</Text> : null}
        </Pressable>
        <View style={{ flex: 1 }} />
        {action && (
          <Pressable onPress={action.onPress} hitSlop={8}>
            <Text style={{ color: palette.accent, fontSize: 15 }}>{action.label}</Text>
          </Pressable>
        )}
      </View>
      {children}
    </View>
  );
}

/** One thing in a block: a badge, what it is, and where it goes. */
export function Item({ badge, title, detail, meta, quiet, onPress, last }: {
  badge?: React.ReactNode;
  title: string;
  detail?: string;
  meta?: string;
  /** The line is the thing itself rather than a name for it — an excerpt, not a title. */
  quiet?: boolean;
  onPress?: () => void;
  last?: boolean;
}) {
  const palette = usePalette();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.item,
        {
          backgroundColor: palette.surface,
          borderColor: palette.border,
          opacity: pressed ? 0.7 : 1,
        },
        last === false && styles.itemJoined,
      ]}
    >
      {badge}
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ color: quiet ? palette.dim : palette.text, fontSize: 16 }}>
          {title}
        </Text>
        {detail ? (
          <Text numberOfLines={2} style={{ color: palette.dim, fontSize: 13, marginTop: 2 }}>
            {detail}
          </Text>
        ) : null}
      </View>
      {meta ? <Text style={{ color: palette.faint, fontSize: 13 }}>{meta}</Text> : null}
      {onPress ? <Text style={{ color: palette.faint, fontSize: 17 }}>›</Text> : null}
    </Pressable>
  );
}

/** A number in a circle — position, which is what an index actually means. */
export function Badge({ n, tone }: { n: number | string; tone?: 'quiet' }) {
  const palette = usePalette();
  return (
    <View style={[styles.badge, { backgroundColor: tone === 'quiet' ? palette.sunken : palette.soft }]}>
      <Text style={{ color: tone === 'quiet' ? palette.dim : palette.accent, fontSize: 13, fontWeight: '700' }}>
        {n}
      </Text>
    </View>
  );
}

/** A name with a face, sized to be scanned sideways rather than read down. */
export function Chip({ label, detail, hue, glyph, onPress }: {
  label: string;
  detail?: string;
  hue?: number;
  glyph?: React.ReactNode;
  onPress?: () => void;
}) {
  const palette = usePalette();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: palette.surface, borderColor: palette.border, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      {glyph ?? (
        <View style={[styles.dot, { backgroundColor: `hsl(${hue ?? 210}, 34%, 58%)` }]} />
      )}
      <View style={{ flexShrink: 1 }}>
        <Text numberOfLines={1} style={{ color: palette.text, fontSize: 14, fontWeight: '600' }}>
          {label}
        </Text>
        {detail ? (
          <Text numberOfLines={1} style={{ color: palette.dim, fontSize: 11 }}>{detail}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/** Chips read sideways, so they scroll sideways and never wrap into a wall. */
export function ChipRow({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipRow}
    >
      {children}
    </ScrollView>
  );
}

/**
 * An empty block says what is missing and what would fill it. A row reading
 * "None" is a dead end wearing the clothes of a link.
 */
export function Empty({ text, action }: { text: string; action?: { label: string; onPress: () => void } }) {
  const palette = usePalette();
  return (
    <View style={[styles.empty, { borderColor: palette.border }]}>
      <Text style={{ color: palette.dim, fontSize: 14, textAlign: 'center' }}>{text}</Text>
      {action && (
        <Pressable onPress={action.onPress} hitSlop={8} style={{ marginTop: space.sm }}>
          <Text style={{ color: palette.accent, fontSize: 15 }}>{action.label}</Text>
        </Pressable>
      )}
    </View>
  );
}

/**
 * A row of counts that are also doors. Three full-width rows saying
 * `Chapters  508  ›` is a third of a screen spent on three numbers.
 */
export function Tiles({ children }: { children: React.ReactNode }) {
  return <View style={styles.tiles}>{children}</View>;
}

export function Tile({ value, label, onPress }: {
  value: string | number;
  label: string;
  onPress: () => void;
}) {
  const palette = usePalette();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        { backgroundColor: palette.surface, borderColor: palette.border, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Text style={{ color: palette.text, fontSize: 22, fontWeight: '700' }}>{value}</Text>
      <Text numberOfLines={2} style={{ color: palette.dim, fontSize: 12, marginTop: 2 }}>{label}</Text>
    </Pressable>
  );
}

/**
 * Something the reader is meant to write. Empty, it says so with a dashed
 * outline — grey text alone on a grey page reads as missing content rather
 * than as an invitation.
 */
export function Writable({ empty, children }: { empty: boolean; children: React.ReactNode }) {
  const palette = usePalette();
  return (
    <View
      style={[
        styles.writable,
        empty && { borderWidth: StyleSheet.hairlineWidth, borderColor: palette.border },
      ]}
    >
      {children}
    </View>
  );
}

/** Quoted material: the book's own words, set apart from anything written about them. */
export function Quote({ children }: { children: React.ReactNode }) {
  const palette = usePalette();
  return (
    <View style={[styles.quote, { backgroundColor: palette.sunken, borderColor: palette.accent }]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.lg,
    gap: space.xs,
  },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: space.xs },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md },
  fact: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    minWidth: 76,
  },
  // Wraps rather than truncates: the most important button on the page is the
  // one whose label was getting cut in half.
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  action: {
    flex: 1,
    borderRadius: radius.md,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    alignItems: 'center',
  },
  blockHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginBottom: space.md,
    paddingHorizontal: space.xs,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: space.sm,
  },
  itemJoined: { marginBottom: space.sm },
  badge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 220,
  },
  chipRow: { gap: space.sm, paddingHorizontal: space.xs, paddingVertical: 2 },
  dot: { width: 22, height: 22, borderRadius: 11 },
  empty: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    paddingVertical: space.xl,
    paddingHorizontal: space.lg,
    alignItems: 'center',
  },
  tiles: { flexDirection: 'row', gap: space.sm },
  tile: {
    flex: 1,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
  },
  writable: {
    borderRadius: radius.lg,
    borderStyle: 'dashed',
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  quote: {
    borderRadius: radius.md,
    borderLeftWidth: 3,
    padding: space.md,
  },
});
