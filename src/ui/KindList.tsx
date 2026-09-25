import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { kindGroups, kindsIn } from '../books/kinds';
import { space, usePalette } from '../theme';

/**
 * Every kind of book, grouped. It unfolds inside whatever card asked for it
 * rather than arriving as a sheet over it: the question "what is it" is part
 * of the form, and a sheet covers the answers already given.
 *
 * Two levels because the first thing anybody knows about a book is whether it
 * is made up; the feature set — cast, scenes, verses — hangs off the row under
 * that, where its one line of explanation can be read.
 */
export function KindList({ selectedId, onPick, topRule = true }: {
  selectedId?: string;
  onPick: (kindId: string) => void;
  /** Off where it is the first thing in its card and would double its edge. */
  topRule?: boolean;
}) {
  const { t } = useTranslation();
  const palette = usePalette();
  return (
    <View
      style={[
        styles.panel,
        topRule && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: palette.border },
      ]}
    >
      {kindGroups.map((group) => (
        <View key={group}>
          <Text style={[styles.group, { color: palette.dim }]}>
            {t(`kind.group_${group}`).toUpperCase()}
          </Text>
          {kindsIn(group).map((kind) => {
            const on = kind.id === selectedId;
            return (
              <Pressable
                key={kind.id}
                onPress={() => onPick(kind.id)}
                style={({ pressed }) => [
                  styles.row,
                  pressed && { backgroundColor: palette.sunken },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: on ? palette.accent : palette.text, fontSize: 16 }}>
                    {t(`kind.${kind.id}`)}
                  </Text>
                  <Text style={{ color: palette.dim, fontSize: 12, marginTop: 1 }}>
                    {t(`kind.${kind.id}Hint`)}
                  </Text>
                </View>
                {on ? <Text style={{ color: palette.accent, fontSize: 16 }}>✓</Text> : null}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/**
 * The same heading the groups above use, for a row underneath that is not a
 * kind of book. It lives here because matching those headings exactly is the
 * whole of its job.
 */
export function GroupTitle({ children }: { children: string }) {
  const palette = usePalette();
  return <Text style={[styles.group, { color: palette.dim }]}>{children.toUpperCase()}</Text>;
}

const styles = StyleSheet.create({
  /** Inside the card, under the row that opened it — a rule, not a gap. */
  panel: { paddingBottom: space.sm },
  group: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm + 2,
  },
});
