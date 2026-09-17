import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import {
  annotationExporters,
  castExporters,
  manuscriptExporters,
  metadataExporters,
  profileExporters,
  scriptExporters,
  translationExporters,
} from '../export/registry';
import { deliver, type Destination } from '../export/deliver';
import type { ExportInput, Exporter, Keeps } from '../export/types';
import { radius, space, usePalette } from '../theme';

/**
 * Every row says what the format drops before it is picked. The alternative is
 * finding out after opening the file somewhere else, which is too late.
 */
export function ExportSheet({ visible, input, onClose }: {
  visible: boolean;
  input: ExportInput | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const palette = usePalette();
  const [destination, setDestination] = useState<Destination>('share');
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function run(exporter: Exporter) {
    if (!input) return;
    setBusy(exporter.id);
    setResult(null);
    try {
      const file = await exporter.build(input);
      const uri = await deliver(file, destination);
      setResult(destination === 'keep' ? t('export.saved', { name: file.fileName }) : null);
      if (destination === 'share') onClose();
      else if (!uri) setResult(t('export.failed'));
    } catch (error) {
      setResult(String(error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: palette.bg }}>
        <View style={styles.head}>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={{ color: palette.accent, fontSize: 16 }}>{t('settings.cancel')}</Text>
          </Pressable>
          <Text style={{ color: palette.text, fontSize: 16, fontWeight: '600' }}>{t('export.title')}</Text>
          <View style={{ width: 54 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl }}>
          <View style={styles.segment}>
            {(['share', 'keep'] as Destination[]).map((option) => (
              <Pressable
                key={option}
                onPress={() => setDestination(option)}
                style={[
                  styles.segmentItem,
                  {
                    backgroundColor: option === destination ? palette.accent : palette.surface,
                    borderColor: palette.border,
                  },
                ]}
              >
                <Text style={{ color: option === destination ? palette.onAccent : palette.text, fontSize: 14 }}>
                  {t(`export.dest_${option}`)}
                </Text>
              </Pressable>
            ))}
          </View>

          {input?.profile ? (
            <Group title={t('export.profile')} exporters={profileExporters} busy={busy} onRun={run} />
          ) : (
            <>
              <Group title={t('export.manuscript')} exporters={manuscriptExporters} busy={busy} onRun={run} />
              <Group title={t('export.metadata')} exporters={metadataExporters} busy={busy} onRun={run} />
              <Group title={t('export.annotations')} exporters={annotationExporters} busy={busy} onRun={run} />
            </>
          )}
          {!input?.profile && input?.cast?.entities.length ? (
            <Group title={t('export.cast')} exporters={castExporters} busy={busy} onRun={run} />
          ) : null}
          {!input?.profile && input?.translation?.units.length ? (
            <Group title={t('export.translation')} exporters={translationExporters} busy={busy} onRun={run} />
          ) : null}
          {!input?.profile && input?.script?.length ? (
            <Group title={t('export.script')} exporters={scriptExporters} busy={busy} onRun={run} />
          ) : null}

          {result ? (
            <Text style={{ color: palette.dim, fontSize: 13, marginTop: space.lg }}>{result}</Text>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function Group({ title, exporters, busy, onRun }: {
  title: string;
  exporters: Exporter[];
  busy: string | null;
  onRun: (exporter: Exporter) => void;
}) {
  const palette = usePalette();
  return (
    <View style={{ marginTop: space.xl }}>
      <Text style={{ color: palette.dim, fontSize: 12, fontWeight: '600', letterSpacing: 0.8 }}>
        {title.toUpperCase()}
      </Text>
      <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        {exporters.map((exporter, index) => (
          <Pressable
            key={exporter.id}
            onPress={() => onRun(exporter)}
            disabled={busy !== null}
            style={[
              styles.row,
              index < exporters.length - 1 && {
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderColor: palette.border,
              },
            ]}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: palette.text, fontSize: 16 }}>.{exporter.extension}</Text>
              <Text style={{ color: palette.dim, fontSize: 12, marginTop: 2 }}>
                <Lossiness keeps={exporter.keeps} roundTrip={exporter.roundTrip} />
              </Text>
            </View>
            {busy === exporter.id ? <ActivityIndicator /> : (
              <Text style={{ color: palette.faint, fontSize: 16 }}>›</Text>
            )}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function Lossiness({ keeps, roundTrip }: { keeps: Keeps; roundTrip: boolean }) {
  const { t } = useTranslation();
  const kept = (['chapters', 'annotations', 'styling'] as const).filter((key) => keeps[key]);
  const lost = (['chapters', 'annotations', 'styling'] as const).filter((key) => !keeps[key]);
  const parts = [t('export.keeps', { list: kept.map((key) => t(`export.k_${key}`)).join(', ') })];
  if (lost.length) parts.push(t('export.drops', { list: lost.map((key) => t(`export.k_${key}`)).join(', ') }));
  if (roundTrip) parts.push(t('export.roundTrip'));
  return <>{parts.join(' · ')}</>;
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: space.lg,
  },
  segment: { flexDirection: 'row', gap: space.sm },
  segmentItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: space.sm + 2,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  card: {
    marginTop: space.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
});
