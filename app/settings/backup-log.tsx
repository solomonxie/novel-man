import { useCallback, useState } from 'react';
import { FlatList, View } from 'react-native';
import { Stack, useFocusEffect } from '../../src/navigation/router';
import { useTranslation } from 'react-i18next';

import { readBackupLog, type LogEntry } from '../../src/backup/attempts';
import { Hint, Row, Section } from '../../src/ui/primitives';
import { sizeOf } from '../../src/ui/fields';
import { radius, space, usePalette } from '../../src/theme';

/**
 * What the files cannot say. A bundle is named for its day and rewritten all
 * day, and the folder keeps ten — so the copy on disk is only ever the last
 * thing that happened, and everything before it has been written over by the
 * time anyone asks. This is the append-only half: a row per attempt, with the
 * size it wrote and the library it measured, kept long after its bundle is
 * gone.
 *
 * It is the failures that earned it. A destination that stopped working three
 * weeks ago looked exactly like one nobody had changed anything in, because
 * the only record was a single row saying what happened last.
 */
export default function BackupLog() {
  const { t } = useTranslation();
  const palette = usePalette();
  const [entries, setEntries] = useState<LogEntry[]>([]);

  useFocusEffect(
    useCallback(() => {
      readBackupLog().then(setEntries).catch(() => setEntries([]));
    }, [])
  );

  return (
    <FlatList
      data={entries}
      keyExtractor={(entry) => String(entry.id)}
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl }}
      ListHeaderComponent={
        <>
          <Stack.Screen options={{ title: t('log.title'), headerBackTitle: ' ' }} />
          <Hint>{t('log.hint')}</Hint>
          <View style={{ height: space.lg }} />
        </>
      }
      ListEmptyComponent={
        <Section flush>
          <Row label={t('log.empty')} last />
        </Section>
      }
      renderItem={({ item, index }) => (
        <View
          style={{
            backgroundColor: palette.surface,
            borderColor: palette.border,
            borderWidth: 1,
            borderTopWidth: index === 0 ? 1 : 0,
            borderTopLeftRadius: index === 0 ? radius.lg : 0,
            borderTopRightRadius: index === 0 ? radius.lg : 0,
            borderBottomLeftRadius: index === entries.length - 1 ? radius.lg : 0,
            borderBottomRightRadius: index === entries.length - 1 ? radius.lg : 0,
            paddingHorizontal: space.md,
          }}
        >
          <Row
            label={when(item.at)}
            detail={detailOf(item, t)}
            value={item.bytes === null ? undefined : sizeOf(item.bytes)}
            alarm={!item.ok}
            last={index === entries.length - 1}
          />
        </View>
      )}
    />
  );
}

/** The day and the hour: a log read at the row, not the file name. */
function when(at: number): string {
  return new Date(at).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function detailOf(entry: LogEntry, t: ReturnType<typeof useTranslation>['t']): string {
  const where = t(`log.where_${entry.destination}`, { defaultValue: entry.destination });
  if (!entry.ok) return t('log.failed', { where, reason: entry.error ?? '' });
  // A copy taken before the counts were recorded has only its size to show.
  if (entry.books === null) return where;
  return t('log.wrote', {
    where,
    books: entry.books.toLocaleString(),
    words: (entry.words ?? 0).toLocaleString(),
  });
}
