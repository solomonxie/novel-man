import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useFocusEffect } from '../navigation/router';
import { subscribeToRestores } from '../backup/changes';
import { useTranslation } from 'react-i18next';
import Clipboard from '@react-native-clipboard/clipboard';

import {
  clearFinishedJobs,
  countPending,
  listJobs,
  retryFailed,
  setPaused,
  type CloudJob,
} from '../db/jobs';
import { listConnections, saveConnection } from '../cloud/connections';
import { CloudError, discoverRegion, regionFromRefusal } from '../cloud/client';
import { trace } from '../dev/trace';
import { drain, queueBackup, subscribeToSync } from '../cloud/sync';
import {
  endpointFor,
  endpointProblem,
  normaliseEndpoint,
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
  // A wipe empties what this is showing, from this very page.
  useEffect(() => subscribeToRestores(load), [load]);
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
      const typed = normaliseEndpoint(draft.endpoint);
      /**
       * Nobody should have to know their region. It is taken from whatever
       * already says it — the field, the provider, the endpoint they pasted —
       * and where none of them do, the bucket is asked directly.
       */
      const region =
        draft.region.trim() ||
        provider.fixedRegion ||
        regionFromEndpoint(typed) ||
        (await discoverRegion(draft.bucket)) ||
        // What S3 signs with when nobody has said otherwise, and what every
        // compatible server accepts. There is no field for this: a region is
        // an implementation detail of where a provider put the bytes, and the
        // one time it matters — a wrong one — the refusal names the right one
        // and the attempt is made again with it.
        'us-east-1';
      const endpoint = normaliseEndpoint(typed || endpointFor(provider, { region }));
      // Checked before it is sent. An empty region builds `s3..amazonaws.com`,
      // which fails as a network error and reads as a rejected key.
      trace(`cloud save provider=${draft.providerId} region=${region} endpoint=${endpoint} bucket=${draft.bucket.trim()} prefix=${draft.prefix.trim()} pathStyle=${!!provider.pathStyle} key=${draft.accessKeyId.trim().length}ch secret=${draft.secretAccessKey.trim().length}ch`);
      const problem = endpointProblem(endpoint);
      if (problem) {
        trace(`cloud endpoint refused: ${problem}`);
        setError(t(`cloud.endpoint_${problem}`, { endpoint }));
        return;
      }
      const secret = {
        accessKeyId: draft.accessKeyId.trim(),
        secretAccessKey: draft.secretAccessKey.trim(),
      };
      const attempt = (where: { region: string; endpoint: string }) =>
        saveConnection(
          {
            name: draft.name.trim() || draft.bucket,
            providerId: draft.providerId,
            endpoint: where.endpoint,
            bucket: draft.bucket.trim(),
            prefix: draft.prefix.trim(),
            region: where.region,
            pathStyle: !!provider.pathStyle,
            frequency: 'manual',
          },
          secret
        );

      try {
        await attempt({ region, endpoint });
      } catch (refused) {
        // S3 refuses the wrong region by naming the right one. Being told the
        // answer and then asking the reader for it is not worth doing.
        const better = refused instanceof CloudError ? regionFromRefusal(refused.detail) : null;
        if (!better) throw refused;
        trace(`cloud retrying in ${better}`);
        await attempt({
          region: better,
          endpoint: normaliseEndpoint(typed || endpointFor(provider, { region: better })),
        });
      }
      trace('cloud save ok');
      setDraft(EMPTY);
      setAdding(false);
      load();
    } catch (caught) {
      trace(`cloud save failed: ${String(caught)}`);
      // A request that never arrived names the host it tried; anything else is
      // the provider's own words.
      setError(
        caught instanceof CloudError && caught.status === 0
          ? t('cloud.unreachable', { host: caught.detail })
          : String(caught)
      );
    } finally {
      setTesting(false);
    }
  }


  return (
    <>
      <Section title={t('cloud.title')}>
        <IcloudRows />
        {/* No row for having none. The row under this one is an invitation to
            add one, which says the same thing without spending a line saying
            nothing is there. */}
        {connections.map((connection) => (
          <Row
            key={connection.id}
            label={connection.name}
            value="›"
            onPress={() => router.push(`/settings/cloud-library?id=${connection.id}`)}
          />
        ))}
        {/* A row that says what it does, under the block it adds to, and the
            form opens under it. It used to, under the row that asked for it. It used to
            replace this row and draw itself in a section of its own below the
            hint — which on a settings page this long is off the bottom of the
            screen, so the only visible effect of tapping it was this row
            vanishing. */}
        <Row
          label={t('cloud.addConnection')}
          detail={t('cloud.addConnectionHint')}
          value={adding ? '⌃' : '⌄'}
          onPress={() => {
            setAdding((was) => !was);
            setError(null);
          }}
          last={!adding}
        />
        {adding ? (
          <>
          {/* Before the fields, because it is how most of them get filled: a
              console page, an .env file or a CSV row on the clipboard fills in
              everything it recognises. Under the form it was a shortcut
              offered after the long way round. */}
          <Row
            label={t('cloud.paste')}
            detail={t('cloud.pasteHint')}
            link
            onPress={async () => paste(await Clipboard.getString())}
          />
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
          </>
        ) : null}
      </Section>

      {adding ? <View style={{ marginTop: space.lg }}>
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
      </View> : null}

      <Hint>{t('cloud.hint')}</Hint>



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
