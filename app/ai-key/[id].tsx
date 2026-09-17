import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { clearRequests, listRequests, type AiRequest } from '../../src/db/requests';
import { formatUsd } from '../../src/ai/cost';
import { listKeys, setKeyModel } from '../../src/ai/keys';
import { modelFor, vendorById } from '../../src/ai/vendors';
import { Hint, Row, Section } from '../../src/ui/primitives';
import { radius, space, usePalette } from '../../src/theme';

/** What this key has actually been spent on, newest first. */
export default function AiKeyPage() {
  const { id, vendor } = useLocalSearchParams<{ id: string; vendor?: string }>();
  const { t } = useTranslation();
  const palette = usePalette();
  const [requests, setRequests] = useState<AiRequest[]>([]);
  const [model, setModel] = useState<string | undefined>();

  const load = useCallback(() => {
    if (!id) return;
    listRequests(id).then(setRequests);
    listKeys().then((keys) => setModel(keys.find((key) => key.id === id)?.model));
  }, [id]);

  useFocusEffect(load);

  const total = requests.reduce((sum, request) => sum + request.usd, 0);
  const failed = requests.filter((request) => request.error).length;

  function confirmClear() {
    Alert.alert(t('keyLog.clearConfirm'), undefined, [
      { text: t('settings.cancel'), style: 'cancel' },
      {
        text: t('settings.delete'),
        style: 'destructive',
        onPress: () => clearRequests(id!).then(load),
      },
    ]);
  }

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}
    >
      <Stack.Screen
        options={{
          title: vendorById(vendor ?? '')?.name ?? t('keyLog.title'),
          headerBackTitle: ' ',
        }}
      />

      <ModelPicker
        vendorId={vendor ?? ''}
        model={model}
        onPick={(picked) => {
          setModel(picked || undefined);
          setKeyModel(id!, picked);
        }}
      />

      <Section title={t('keyLog.summary')}>
        <Row label={t('keyLog.count')} value={`${requests.length}`} />
        <Row label={t('keyLog.spent')} value={formatUsd(total)} />
        <Row label={t('keyLog.failed')} value={`${failed}`} last />
      </Section>

      <Section title={t('keyLog.requests')}>
        {requests.length === 0 ? (
          <Row label={t('keyLog.empty')} last />
        ) : (
          requests.map((request, index) => (
            <Row
              key={request.id}
              label={new Date(request.created_at).toLocaleString()}
              detail={[
                request.error ? t('keyLog.failedOne') : t('keyLog.ok'),
                t('keyLog.tokens', {
                  input: request.input_tokens.toLocaleString(),
                  output: request.output_tokens.toLocaleString(),
                }),
                formatUsd(request.usd),
              ].join(' · ')}
              value="›"
              onPress={() => router.push(`/ai-request/${request.id}`)}
              last={index === requests.length - 1}
            />
          ))
        )}
      </Section>

      <Hint>{t('keyLog.hint')}</Hint>

      {requests.length > 0 && (
        <Section>
          <Row label={t('keyLog.clear')} onPress={confirmClear} danger last />
        </Section>
      )}

      <View style={styles.spacer} />
    </ScrollView>
  );
}

/**
 * Per key, not per vendor: one account can sweep five hundred chapters on the
 * cheap model and re-read the handful that came back wrong on a better one.
 * The typed field is the escape hatch — vendors ship models faster than apps.
 */
function ModelPicker({ vendorId, model, onPick }: {
  vendorId: string;
  model?: string;
  onPick: (model: string) => void;
}) {
  const { t } = useTranslation();
  const palette = usePalette();
  const [custom, setCustom] = useState('');
  const vendor = vendorById(vendorId);
  if (!vendor) return null;
  const current = modelFor(vendor, model).id;
  const listed = vendor.models.some((entry) => entry.id === current);

  return (
    <>
      <Section title={t('keyLog.model')}>
        {vendor.models.map((entry, index) => (
          <Row
            key={entry.id}
            label={entry.name}
            detail={t('keyLog.modelPrice', { in: entry.price.in, out: entry.price.out })}
            value={entry.id === current ? '✓' : undefined}
            onPress={() => onPick(entry.id)}
            last={index === vendor.models.length - 1 && listed}
          />
        ))}
        {!listed && <Row label={current} value="✓" onPress={() => undefined} last />}
        <View style={styles.customRow}>
          <TextInput
            value={custom}
            onChangeText={setCustom}
            onSubmitEditing={() => {
              if (custom.trim()) onPick(custom.trim());
              setCustom('');
            }}
            placeholder={t('keyLog.modelCustom')}
            placeholderTextColor={palette.faint}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            returnKeyType="done"
            style={[styles.input, { color: palette.text, borderColor: palette.border }]}
          />
          <Text style={{ color: palette.dim, fontSize: 12 }}>{t('keyLog.modelCustomHint')}</Text>
        </View>
      </Section>
      <Hint>{t('keyLog.modelHint')}</Hint>
    </>
  );
}

const styles = StyleSheet.create({
  spacer: { height: space.xl },
  customRow: { paddingHorizontal: space.lg, paddingVertical: space.md, gap: space.xs },
  input: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    fontSize: 15,
  },
});
