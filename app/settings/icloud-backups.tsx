import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, View } from 'react-native';
import { Stack, useFocusEffect } from '../../src/navigation/router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import {
  backUp,
  listBackups,
  readBackup,
  removeBackup,
  type DriveFile,
} from '../../src/backup/icloud';
import { openBundle, readAbout } from '../../src/backup/bundle';
import { BundleError, dateOf, type BundleAbout } from '../../src/backup/format';
import { restoreBundle, type RestoreReport } from '../../src/backup/restore';
import { RestoreReportView } from '../../src/settings/RestoreReport';
import { Hint, PrimaryAction, Row, Section } from '../../src/ui/primitives';
import { space, usePalette } from '../../src/theme';

/**
 * Every copy iCloud is holding, and the way back from any one of them.
 *
 * The switch in settings answers "is this backed up"; this page answers the
 * question that only ever gets asked in a bad hour — "what did it look like on
 * Tuesday". Ten copies, newest first, each one a date you can read and choose.
 */
export default function IcloudBackups() {
  const { t } = useTranslation();
  const palette = usePalette();
  const [files, setFiles] = useState<DriveFile[] | null>(null);
  const [busy, setBusy] = useState(false);
  /** Which copy is being read, so its own row can say so. */
  const [reading, setReading] = useState<string | null>(null);
  const [report, setReport] = useState<RestoreReport | null>(null);
  /**
   * The copy that was read to summarise it, kept for the restore that usually
   * follows — otherwise choosing a backup downloads it and restoring it
   * downloads it again.
   */
  const held = useRef<{ name: string; bytes: Uint8Array } | null>(null);

  const load = useCallback(() => {
    listBackups()
      .then(setFiles)
      .catch(() => setFiles([]));
  }, []);

  useFocusEffect(load);

  async function guard(work: () => Promise<void>) {
    setBusy(true);
    setReport(null);
    try {
      await work();
    } catch (problem) {
      Alert.alert(t('backup.failed'), describe(problem, t));
    } finally {
      setBusy(false);
      load();
    }
  }

  async function bytesOf(name: string): Promise<Uint8Array> {
    if (held.current?.name === name) return held.current.bytes;
    const bytes = await readBackup(name);
    held.current = { name, bytes };
    return bytes;
  }

  /**
   * Restoring always adds; it never overwrites what is here. So the question
   * asked first is the honest one — this will bring the books in that copy
   * back, beside the ones you have.
   *
   * And it says what "the books in that copy" amounts to. Ten dates in a list
   * are ten identical-looking choices; the one thing that tells them apart is
   * how much is in each, which is exactly what someone is trying to work out
   * in the hour they end up on this page.
   */
  async function ask(file: DriveFile) {
    if (reading) return;
    setReading(file.name);
    let about: BundleAbout | null = null;
    try {
      // Pulled out of iCloud and read whole — megabytes, and not instant. The
      // row says it is working; a spinner at the bottom of the page does not
      // belong to the thing that was tapped.
      about = readAbout(await bytesOf(file.name));
    } catch (problem) {
      setReading(null);
      Alert.alert(t('backup.failed'), describe(problem, t));
      return;
    }
    setReading(null);
    Alert.alert(
      when(file),
      [about ? summarize(about, t) : t('backup.aboutUnknown'), t('backup.restoreConfirm')].join('\n\n'),
      [
        { text: t('settings.cancel'), style: 'cancel' },
        {
          text: t('backup.restore'),
          onPress: () =>
            guard(async () => {
              setReport(await restoreBundle(openBundle(await bytesOf(file.name))));
            }),
        },
        {
          text: t('settings.delete'),
          style: 'destructive',
          onPress: () =>
            guard(async () => {
              await removeBackup(file.name);
              if (held.current?.name === file.name) held.current = null;
            }),
        },
      ]
    );
  }

  /** What it is *of* comes from its name; when it was written is its own fact. */
  function when(file: DriveFile): string {
    const day = dateOf(file.name);
    const written = new Date(file.modifiedAt).toLocaleString();
    return day ? `${day.toLocaleDateString()} · ${written}` : written;
  }

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}
    >
      <Stack.Screen options={{ title: t('backup.icloudBrowse'), headerBackTitle: ' ' }} />

      <Section title={t('backup.icloudCopies')}>
        {files === null ? (
          <View style={{ padding: space.xl }}><ActivityIndicator /></View>
        ) : files.length === 0 ? (
          <Row label={t('backup.icloudNone')} last />
        ) : (
          files.map((file, index) => (
            <Row
              key={file.name}
              label={when(file)}
              detail={file.name}
              value="›"
              busy={reading === file.name}
              onPress={() => void ask(file)}
              last={index === files.length - 1}
            />
          ))
        )}
      </Section>
      <Hint>{t('backup.icloudBrowseHint')}</Hint>

      <View style={{ marginTop: space.lg }}>
        <PrimaryAction
          label={t('backup.now')}
          onPress={() =>
            guard(async () => {
              const wrote = await backUp();
              if (!wrote) Alert.alert(t('backup.now'), t('backup.nowUnchanged'));
            })
          }
        />
      </View>

      {busy ? <ActivityIndicator style={{ marginTop: space.xl }} /> : null}

      {report ? <RestoreReportView report={report} /> : null}
    </ScrollView>
  );
}

/** Only what it actually holds: a line of zeroes says nothing about a backup. */
function summarize(about: BundleAbout, t: TFunction): string {
  const counted: [number, string][] = [
    [about.books, t('units.unit_books')],
    [about.chapters, t('units.unit_chapters')],
    [about.notes, t('units.unit_notes')],
    [about.people, t('units.unit_cast')],
    [about.places, t('units.unit_places')],
    [about.terms, t('units.unit_terms')],
  ];
  const parts = counted
    .filter(([count]) => count > 0)
    .map(([count, label]) => `${count.toLocaleString()} ${label}`);
  return parts.length ? parts.join('  ·  ') : t('backup.aboutEmpty');
}

function describe(error: unknown, t: TFunction): string {
  if (error instanceof BundleError) {
    return error.code === 'too-new'
      ? t('backup.tooNew', { version: error.detail })
      : t('backup.notABundle');
  }
  return String(error);
}
