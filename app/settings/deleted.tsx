import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';
import { Stack, useFocusEffect } from '../../src/navigation/router';
import { useTranslation } from 'react-i18next';

import {
  emptyTrash,
  KEEP_DAYS,
  listTrash,
  purgeTrashed,
  restoreTrashed,
  type TrashedBook,
} from '../../src/backup/trash';
import { Hint, Row } from '../../src/ui/primitives';
import { sizeOf } from '../../src/ui/fields';
import { space, usePalette } from '../../src/theme';

/**
 * The books that are not on the shelf any more and are not gone either.
 *
 * A list, not a grid: what is being read here is a date and a decision, and
 * covers would invite browsing a place nobody should want to spend time in.
 * It virtualises anyway — somebody clearing out a bad import deletes eighty.
 */
export default function RecentlyDeleted() {
  const { t } = useTranslation();
  const palette = usePalette();
  const [rows, setRows] = useState<TrashedBook[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    listTrash().then(setRows);
  }, []);

  useFocusEffect(load);

  async function guard(id: string, work: () => Promise<void>) {
    setBusy(id);
    try {
      await work();
      load();
    } catch (problem) {
      Alert.alert(t('trash.failed'), String(problem));
    } finally {
      setBusy(null);
    }
  }

  function ask(row: TrashedBook) {
    Alert.alert(row.title, t('trash.what'), [
      { text: t('settings.cancel'), style: 'cancel' },
      {
        text: t('trash.forget'),
        style: 'destructive',
        onPress: () => void guard(row.id, () => purgeTrashed(row.id)),
      },
      {
        text: t('trash.putBack'),
        onPress: () =>
          void guard(row.id, async () => {
            if (!(await restoreTrashed(row.id))) throw new Error(t('trash.fileGone'));
          }),
      },
    ]);
  }

  function confirmEmpty() {
    Alert.alert(t('trash.emptyTitle'), t('trash.emptyWarning'), [
      { text: t('settings.cancel'), style: 'cancel' },
      {
        text: t('trash.empty'),
        style: 'destructive',
        onPress: () => void guard('all', emptyTrash),
      },
    ]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <Stack.Screen options={{ title: t('trash.title'), headerBackTitle: ' ' }} />
      <FlatList
        data={rows}
        keyExtractor={(row) => row.id}
        contentContainerStyle={{ padding: space.lg }}
        ListHeaderComponent={<Hint>{t('trash.why', { days: KEEP_DAYS })}</Hint>}
        ListEmptyComponent={
          <Text style={{ color: palette.dim, fontSize: 15, marginTop: space.lg }}>
            {t('trash.none')}
          </Text>
        }
        renderItem={({ item, index }) => (
          <Row
            label={item.title}
            detail={[
              item.author,
              new Date(item.deleted_at).toLocaleDateString(),
              sizeOf(item.bytes),
              item.notes ? t('trash.withNotes', { count: item.notes }) : null,
            ]
              .filter(Boolean)
              .join(' · ')}
            value={t('trash.putBack')}
            link
            busy={busy === item.id}
            onPress={() => ask(item)}
            last={index === rows.length - 1}
          />
        )}
        ListFooterComponent={
          rows.length ? (
            <Pressable onPress={confirmEmpty} style={{ marginTop: space.xxl }} hitSlop={8}>
              <Text style={{ color: palette.danger, fontSize: 14 }}>{t('trash.empty')}</Text>
            </Pressable>
          ) : null
        }
      />
    </View>
  );
}
