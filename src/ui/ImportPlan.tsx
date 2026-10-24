import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '../navigation/router';

import type { BookListItem } from '../db/repo';
import type { Planned } from '../books/imports';
import { lastRun, undoRun, type ImportRun, type ImportSource } from '../books/importRuns';
import { PickerSheet } from './PickerSheet';
import { Row, Section } from './primitives';
import { space, usePalette } from '../theme';

const AS_NEW = '\u0000new';
const SKIP = '\u0000skip';

/** One row of a file and where it is going. Tapping it is how a wrong guess is put right. */
export function PlanRow<T>({ entry, title, count, onPress }: {
  entry: Planned<T>;
  title: string;
  /** Notes in this row, where it carries any. */
  count?: number;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const palette = usePalette();
  const where = entry.skip
    ? t('importPlan.skipped')
    : entry.onto
      ? t('importPlan.onto', { title: entry.onto.title })
      : t('importPlan.asNew');
  return (
    <Pressable onPress={onPress} style={[styles.item, { borderColor: palette.border }]}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: entry.skip ? palette.faint : palette.text, fontSize: 16 }}>{title}</Text>
        <Text
          style={{
            color: entry.skip ? palette.faint : entry.onto ? palette.dim : palette.accent,
            fontSize: 13,
            marginTop: 2,
          }}
        >
          {count !== undefined ? `${t('importPlan.notes', { count })} → ${where}` : `→ ${where}`}
        </Text>
      </View>
      <Text style={{ color: palette.faint, fontSize: 17 }}>›</Text>
    </Pressable>
  );
}

/** The sheet a row opens: another book on the shelf, a new one, or none at all. */
export function OntoSheet({ shelf, entry, title, onChange, onClose }: {
  shelf: BookListItem[];
  entry: Planned<unknown> | null;
  title: string;
  onChange: (onto: BookListItem | null, skip: boolean) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const options = [
    { id: AS_NEW, label: t('importPlan.asNewOption') },
    { id: SKIP, label: t('importPlan.skipOption') },
    ...shelf.map((book) => ({ id: book.id, label: book.title, detail: book.author ?? undefined })),
  ];
  return (
    <PickerSheet
      visible={entry !== null}
      title={title}
      options={options}
      selectedId={entry?.skip ? SKIP : (entry?.onto?.id ?? AS_NEW)}
      searchPlaceholder={t('importPlan.search')}
      onPick={(id) => {
        if (id === SKIP) onChange(null, true);
        else if (id === AS_NEW) onChange(null, false);
        else onChange(shelf.find((book) => book.id === id) ?? null, false);
      }}
      onClose={onClose}
    />
  );
}

/** How many rows go onto the shelf's books, how many are new, how many are left out. */
export function planCounts(plan: Planned<unknown>[]) {
  const skipped = plan.filter((entry) => entry.skip).length;
  const matched = plan.filter((entry) => !entry.skip && entry.onto).length;
  return { matched, created: plan.length - skipped - matched, skipped };
}

/**
 * The last import from this page, with the way back. Shown until it is undone
 * or another import replaces it, so a mistake noticed tomorrow is still one tap.
 */
export function LastImport({ source, refresh, onUndone }: {
  source: ImportSource;
  /** Changes when a new import has been recorded. */
  refresh?: unknown;
  onUndone?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [run, setRun] = useState<ImportRun | null>(null);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      lastRun(source).then(setRun).catch(() => undefined);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [source, refresh])
  );

  if (!run) return null;

  function undo(of: ImportRun) {
    Alert.alert(
      t('importPlan.undoTitle'),
      t('importPlan.undoWhat', { books: of.created.length, notes: of.notes.length, changed: of.was.length }),
      [
        { text: t('settings.cancel'), style: 'cancel' },
        {
          text: t('importPlan.undo'),
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await undoRun(of);
              setRun(await lastRun(source));
              onUndone?.();
            } catch (problem) {
              Alert.alert(t('importPlan.undoFailed'), problem instanceof Error ? problem.message : String(problem));
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  }

  return (
    <Section title={t('importPlan.lastTitle')}>
      <Row
        label={run.from || t('importPlan.lastUnnamed')}
        detail={t('importPlan.lastWhat', {
          date: new Date(run.at).toLocaleString(i18n.language),
          books: run.created.length,
          notes: run.notes.length,
          changed: run.was.length,
        })}
        value={busy ? undefined : t('importPlan.undo')}
        busy={busy}
        onPress={busy ? undefined : () => undo(run)}
        last
      />
    </Section>
  );
}

const styles = StyleSheet.create({
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
