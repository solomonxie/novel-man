import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as Clipboard from 'expo-clipboard';

import {
  clearFinishedJobs,
  countPending,
  listJobs,
  retryFailed,
  setPaused,
  type CloudJob,
} from '../db/jobs';
import { listConnections, saveConnection } from '../cloud/connections';
import { drain, queueBackup, subscribeToSync } from '../cloud/sync';
import {
  endpointFor,
  parsePasted,
  providerById,
  providers,
  regionFromEndpoint,
  type Connection,
} from '../cloud/providers';
import { Hint, PrimaryAction, Row, Section } from '../ui/primitives';
import { IcloudRows } from './Icloud';
import { PickerSheet } from '../ui/PickerSheet';
import { radius, space, usePalette } from '../theme';

type Draft = {
  name: string;
  providerId: string;
  endpoint: string;
  bucket: string;
  prefix: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
};

const EMPTY: Draft = {
  name: '',
  providerId: 'aws',
  endpoint: '',
  bucket: '',
  prefix: 'novel-man',
  region: '',
  accessKeyId: '',
  secretAccessKey: '',
};

export function CloudSettings() {
  const { t } = useTranslation();
  const palette = usePalette();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [jobs, setJobs] = useState<CloudJob[]>([]);
  const [pending, setPending] = useState(0);
  const [adding, setAdding] = useState(false);
  // The draft survives a failed attempt: retyping a 40-character secret
  // because the bucket name was wrong is the worst part of any of these forms.
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [providerOpen, setProviderOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPausedState] = useState(false);

  const load = useCallback(() => {
    listConnections().then(setConnections);
    listJobs().then(setJobs);
    countPending().then(setPending);
  }, []);

  useFocusEffect(load);
  useEffect(() => subscribeToSync(load), [load]);

  const provider = providerById(draft.providerId);

  function paste(block: string) {
    const found = parsePasted(block);
    setDraft((was) => ({ ...was, ...found }));
  }

  async function save() {
    if (!provider) return;
    setTesting(true);
    setError(null);
    try {
      const region = draft.region || provider.fixedRegion || regionFromEndpoint(draft.endpoint) || '';
      const endpoint = draft.endpoint || endpointFor(provider, { region });
      await saveConnection(
        {
          name: draft.name.trim() || draft.bucket,
          providerId: draft.providerId,
          endpoint,
          bucket: draft.bucket.trim(),
          prefix: draft.prefix.trim(),
          region,
          pathStyle: !!provider.pathStyle,
          frequency: 'manual',
        },
        { accessKeyId: draft.accessKeyId.trim(), secretAccessKey: draft.secretAccessKey.trim() }
      );
      setDraft(EMPTY);
      setAdding(false);
      load();
    } catch (caught) {
      setError(String(caught));
    } finally {
      setTesting(false);
    }
  }


  return (
    <>
      <Section
        title={t('cloud.title')}
        action={adding ? undefined : { label: '＋', onPress: () => setAdding(true) }}
      >
        <IcloudRows />
        {connections.length === 0 ? (
          <Row label={t('cloud.none')} last />
        ) : (
          connections.map((connection, index) => (
            <Row
              key={connection.id}
              label={connection.name}
              value={`${connection.bucket}/${connection.prefix}  ›`}
              onPress={() => router.push(`/settings/cloud-library?id=${connection.id}`)}
              last={index === connections.length - 1}
            />
          ))
        )}
      </Section>
      <Hint>{t('cloud.hint')}</Hint>

      {adding && (
        <Section title={t('cloud.newConnection')}>
          <Row
            label={t('cloud.provider')}
            value={provider?.name ?? ''}
            onPress={() => setProviderOpen(true)}
          />
          <Field label={t('cloud.name')} value={draft.name} onChange={(value) => setDraft({ ...draft, name: value })} />
          {provider && !provider.endpoint ? (
            <Field
              label={t('cloud.endpoint')}
              value={draft.endpoint}
              placeholder="https://…"
              onChange={(value) =>
                setDraft({ ...draft, endpoint: value, region: draft.region || regionFromEndpoint(value) || '' })
              }
            />
          ) : null}
          {provider?.id === 'r2' ? (
            <Field
              label={t('cloud.account')}
              value={draft.endpoint}
              placeholder="https://<account>.r2.cloudflarestorage.com"
              onChange={(value) => setDraft({ ...draft, endpoint: value })}
            />
          ) : null}
          <Field label={t('cloud.bucket')} value={draft.bucket} onChange={(value) => setDraft({ ...draft, bucket: value })} />
          <Field label={t('cloud.prefix')} value={draft.prefix} onChange={(value) => setDraft({ ...draft, prefix: value })} />
          {!provider?.fixedRegion ? (
            <Field
              label={t('cloud.region')}
              value={draft.region}
              placeholder={provider?.regionHint}
              onChange={(value) => setDraft({ ...draft, region: value })}
            />
          ) : null}
          <Field
            label={t('cloud.accessKey')}
            value={draft.accessKeyId}
            onChange={(value) => setDraft({ ...draft, accessKeyId: value })}
          />
          <Field
            label={t('cloud.secretKey')}
            value={draft.secretAccessKey}
            secure
            onChange={(value) => setDraft({ ...draft, secretAccessKey: value })}
            last
          />
        </Section>
      )}

      {adding && (
        <View style={{ marginTop: space.lg }}>
          <Pressable onPress={async () => paste(await Clipboard.getStringAsync())}>
            <Text style={{ color: palette.accent, fontSize: 15 }}>{t('cloud.paste')}</Text>
          </Pressable>
          <Hint>{t('cloud.pasteHint')}</Hint>

          {error ? (
            <Text style={{ color: palette.danger, fontSize: 14, marginTop: space.md }}>{error}</Text>
          ) : null}

          {testing ? (
            <ActivityIndicator style={{ marginTop: space.lg }} />
          ) : (
            <PrimaryAction label={t('cloud.save')} onPress={save} style={{ marginTop: space.lg }} />
          )}
          <Pressable
            onPress={() => {
              setAdding(false);
              setError(null);
            }}
            style={{ alignItems: 'center', paddingVertical: space.md }}
          >
            <Text style={{ color: palette.dim, fontSize: 16 }}>{t('settings.cancel')}</Text>
          </Pressable>
          <Hint>{t('cloud.saveHint')}</Hint>
        </View>
      )}

      {jobs.length > 0 && (
        <Section
          title={t('cloud.queue', { count: pending })}
          action={{ label: t('queue.clear'), onPress: () => clearFinishedJobs().then(load) }}
        >
          {jobs.slice(0, 12).map((job, index) => (
            <Row
              key={job.id}
              label={t(`cloud.kind_${job.kind}`)}
              value={job.status === 'failed' ? t('cloud.failed') : t(`cloud.status_${job.status}`)}
              last={index === Math.min(jobs.length, 12) - 1}
            />
          ))}
        </Section>
      )}

      {jobs.length > 0 && (
        <View style={styles.queueActions}>
          <Pressable
            onPress={async () => {
              const next = !paused;
              setPausedState(next);
              await setPaused(next);
              if (!next) void drain();
              load();
            }}
          >
            <Text style={{ color: palette.accent, fontSize: 15 }}>
              {paused ? t('cloud.resume') : t('cloud.pause')}
            </Text>
          </Pressable>
          <Pressable onPress={() => retryFailed().then(() => drain()).then(load)}>
            <Text style={{ color: palette.accent, fontSize: 15 }}>{t('queue.retry')}</Text>
          </Pressable>
        </View>
      )}

      <PickerSheet
        visible={providerOpen}
        title={t('cloud.provider')}
        options={providers.map((entry) => ({ id: entry.id, label: entry.name }))}
        selectedId={draft.providerId}
        onPick={(id) => {
          setDraft({ ...draft, providerId: id, endpoint: '' });
          setProviderOpen(false);
        }}
        onClose={() => setProviderOpen(false)}
      />
    </>
  );
}

function Field({ label, value, onChange, placeholder, secure, last }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  secure?: boolean;
  last?: boolean;
}) {
  const palette = usePalette();
  return (
    <View
      style={[
        styles.field,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: palette.border },
      ]}
    >
      <Text style={{ color: palette.dim, fontSize: 14, width: 96 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={palette.faint}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry={secure}
        style={{ color: palette.text, fontSize: 15, flex: 1 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  queueActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: space.sm,
    marginTop: space.md,
  },
  card: { borderRadius: radius.md },
});
