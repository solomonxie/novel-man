import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from '../../src/navigation/router';
import { useTranslation } from 'react-i18next';

import { bucketFor, listConnections, removeConnection, updateConnection } from '../../src/cloud/connections';
import {
  isBookKey,
  queueBackup,
  queueDownload,
  subscribeToSync,
  takeLastReport,
} from '../../src/cloud/sync';
import type { RemoteObject } from '../../src/cloud/client';
import type { Connection } from '../../src/cloud/providers';
import type { RestoreReport } from '../../src/backup/restore';
import { dateOf } from '../../src/backup/format';
import { Hint, Row, Section } from '../../src/ui/primitives';
import { PickerSheet } from '../../src/ui/PickerSheet';
import { space, usePalette } from '../../src/theme';

const FREQUENCIES: Connection['frequency'][] = ['manual', 'daily', 'weekly'];

export default function CloudLibrary() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const palette = usePalette();
  const [connection, setConnection] = useState<Connection | null>(null);
  const [objects, setObjects] = useState<RemoteObject[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [frequencyOpen, setFrequencyOpen] = useState(false);
  const [report, setReport] = useState<RestoreReport | null>(null);

  const load = useCallback(() => {
    if (!id) return;
    listConnections().then((rows) => setConnection(rows.find((row) => row.id === id) ?? null));
    setError(null);
    bucketFor(id)
      .then((bucket) => bucket?.list() ?? [])
      .then(setObjects)
      .catch((caught) => {
        setObjects([]);
        setError(String(caught));
      });
    const finished = takeLastReport();
    if (finished) setReport(finished);
  }, [id]);

  useFocusEffect(load);
  useEffect(() => subscribeToSync(load), [load]);

  if (!connection) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.bg }}>
        <ActivityIndicator />
      </View>
    );
  }

  function confirmRemove() {
    Alert.alert(t('cloud.remove'), t('cloud.removeConfirm'), [
      { text: t('settings.cancel'), style: 'cancel' },
      {
        text: t('settings.delete'),
        style: 'destructive',
        onPress: async () => {
          await removeConnection(id!);
          router.back();
        },
      },
    ]);
  }

  function confirmGet(key: string) {
    Alert.alert(t('cloud.get'), t('backup.restoreConfirm'), [
      { text: t('settings.cancel'), style: 'cancel' },
      { text: t('cloud.get'), onPress: () => queueDownload(id!, key) },
    ]);
  }

  // One bundle per month in each section, newest first — which is the one
  // anybody wants, with the months before it still there if they don't.
  const newestFirst = (rows: RemoteObject[]) => [...rows].sort((a, b) => b.modified - a.modified);
  const books = newestFirst((objects ?? []).filter((object) => isBookKey(object.key)));
  const library = newestFirst((objects ?? []).filter((object) => !isBookKey(object.key)));

  /** A bundle from before backups were dated keeps whatever name it has. */
  const dayLabel = (key: string) => {
    const at = dateOf(key);
    return at
      ? at.toLocaleDateString(i18n.language, { year: 'numeric', month: 'long', day: 'numeric' })
      : key.replace(/^books\//, '').replace(/\.(zip|nmbak)$/, '');
  };
  const bookLabel = (key: string) =>
    key
      .replace(/^books\//, '')
      .replace(/-\d{4}-\d{2}-\d{2}$|^\d{6}-/, '')
      .replace(/\.(zip|nmbak)$/, '');

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}
    >
      <Stack.Screen options={{ title: connection.name, headerBackTitle: ' ' }} />

      <Section title={t('cloud.settings')}>
        <Row label={t('cloud.bucket')} value={connection.bucket} />
        <Row label={t('cloud.prefix')} value={connection.prefix || '/'} />
        <Row
          label={t('cloud.frequency')}
          value={t(`backup.freq_${connection.frequency === 'manual' ? 'off' : connection.frequency}`)}
          onPress={() => setFrequencyOpen(true)}
        />
        <Row label={t('cloud.backupNow')} onPress={() => queueBackup(connection.id)} last />
      </Section>
      <Hint>{t('cloud.frequencyHint')}</Hint>

      <Section>
        <Row label={t('cloud.remove')} onPress={confirmRemove} danger last />
      </Section>

      {error ? (
        <Text style={{ color: palette.danger, fontSize: 14, marginTop: space.lg }}>{error}</Text>
      ) : null}

      {objects === null ? (
        <ActivityIndicator style={{ marginTop: space.xl }} />
      ) : (
        <>
          <Section title={t('cloud.whole')}>
            {library.length === 0 ? (
              <Row label={t('cloud.nothingYet')} last />
            ) : (
              library.map((object, index) => (
                <Row
                  key={object.key}
                  label={dayLabel(object.key)}
                  detail={new Date(object.modified).toLocaleString()}
                  value={`${Math.round(object.size / 1024)} KB  ›`}
                  onPress={() => confirmGet(object.key)}
                  last={index === library.length - 1}
                />
              ))
            )}
          </Section>

          <Section title={t('cloud.perBook', { count: books.length })}>
            {books.length === 0 ? (
              <Row label={t('cloud.nothingYet')} last />
            ) : (
              books.map((object, index) => (
                <Row
                  key={object.key}
                  label={bookLabel(object.key)}
                  detail={dayLabel(object.key)}
                  value={`${Math.round(object.size / 1024)} KB  ›`}
                  onPress={() => confirmGet(object.key)}
                  last={index === books.length - 1}
                />
              ))
            )}
          </Section>
          <Hint>{t('cloud.getHint')}</Hint>
        </>
      )}

      {report ? (
        <View style={{ marginTop: space.xl }}>
          <Text style={{ color: palette.text, fontSize: 15 }}>
            {t('backup.restored', { count: report.restored.length })}
          </Text>
          {report.unplaceable.map((item, index) => (
            <Text key={index} style={{ color: palette.danger, fontSize: 13, marginTop: space.xs }}>
              {t(`backup.unplaceable_${item.reason}`, { title: item.title })}
            </Text>
          ))}
        </View>
      ) : null}

      <PickerSheet
        visible={frequencyOpen}
        title={t('cloud.frequency')}
        options={FREQUENCIES.map((frequency) => ({
          id: frequency,
          label: t(`backup.freq_${frequency === 'manual' ? 'off' : frequency}`),
        }))}
        selectedId={connection.frequency}
        onPick={async (value) => {
          await updateConnection(connection.id, { frequency: value as Connection['frequency'] });
          setFrequencyOpen(false);
          load();
        }}
        onClose={() => setFrequencyOpen(false)}
      />
    </ScrollView>
  );
}
