import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import {
  clearCastAnalysis,
  deleteEntity,
  getBook,
  listChapters,
  listEntities,
  listFlags,
  listMentions,
  listRelations,
  setFlagStatus,
  type Book,
  type Chapter,
  type ContinuityFlag,
  type Entity,
  type Mention,
  type Relation,
} from '../../../src/db/repo';
import { castNoun } from '../../../src/books/kinds';
import { estimateCast } from '../../../src/cast/extract';
import { estimateDeep, queueChapterRun, queuePolish } from '../../../src/analysis/runs';
import { coOccurring, estimateRelations, extractRelations } from '../../../src/cast/relations';
import { checkContinuity, estimateContinuity, subjectsFor, type Subject } from '../../../src/cast/continuity';
import { appearances, byFrequency, timelineFor } from '../../../src/cast/mentions';
import { hasAnyKey } from '../../../src/ai/keys';
import type { Estimate } from '../../../src/ai/cost';
import { AiRunSheet, type RunHooks } from '../../../src/ui/AiRunSheet';
import { ActionMenu } from '../../../src/ui/ActionMenu';
import { Hint, Row, Section } from '../../../src/ui/primitives';
import { bucketize, Sparkline } from '../../../src/ui/Sparkline';
import { useDocument } from '../../../src/ui/useDocument';
import { space, usePalette } from '../../../src/theme';
import { useWorkRefresh } from '../../../src/work/refresh';

type Pass = 'extract' | 'deep' | 'relations' | 'continuity';

export default function Cast() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const palette = usePalette();

  const [book, setBook] = useState<Book | null>(null);
  const document = useDocument(id);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [relations, setRelations] = useState<Relation[]>([]);
  const [flags, setFlags] = useState<ContinuityFlag[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [keyed, setKeyed] = useState(false);
  const [pass, setPass] = useState<Pass | null>(null);
  const [estimates, setEstimates] = useState<Partial<Record<Pass, Estimate | null>>>({});
  const [menuFor, setMenuFor] = useState<Entity | null>(null);

  const load = useCallback(() => {
    if (!id) return;
    getBook(id).then(setBook);
    listChapters(id).then(setChapters);
    listEntities(id, 'character').then(setEntities);
    listMentions(id).then(setMentions);
    listRelations(id).then(setRelations);
    listFlags(id).then(setFlags);
    subjectsFor(id).then(setSubjects);
  }, [id]);

  useFocusEffect(load);
  // A pass that lands while this page is open has to show up on it.
  useWorkRefresh(load);

  useEffect(() => {
    hasAnyKey().then(setKeyed);
  }, []);

  /**
   * A price is worked out when the sheet asking for it opens. Doing it on
   * focus meant every visit to this page read the whole manuscript to answer a
   * question nobody had asked yet.
   */
  async function openPass(which: Pass) {
    setPass(which);
    if (!book) return;
    if (which === 'extract' || which === 'deep') {
      const { text } = await document.read();
      const price = await (which === 'deep'
        ? estimateDeep(text, chapters, book.language)
        : estimateCast(text, chapters, book.language));
      setEstimates((was) => ({ ...was, [which]: price }));
      return;
    }
    const price = await (which === 'relations'
      ? estimateRelations(coOccurring(entities, mentions), book.language)
      : estimateContinuity(subjects, book.language));
    setEstimates((was) => ({ ...was, [which]: price }));
  }

  if (!book) {
  return (
      <View style={[styles.center, { backgroundColor: palette.bg }]}>
        <ActivityIndicator />
      </View>
    );
  }

  const open = flags.filter((flag) => flag.status === 'open');

  function confirmClear() {
    Alert.alert(t('cast.clear'), t('cast.clearConfirm'), [
      { text: t('settings.cancel'), style: 'cancel' },
      {
        text: t('cast.clear'),
        style: 'destructive',
        onPress: async () => {
          await clearCastAnalysis(id!);
          load();
        },
      },
    ]);
  }

  async function runPass(which: Pass, hooks: RunHooks): Promise<string> {
    if (which === 'extract' || which === 'deep') {
      await queueChapterRun(id!, which === 'deep' ? 'deep-analyze' : 'cast-chapter', chapters);
      return t('work.queued', { count: chapters.length });
    }
    if (which === 'relations') {
      const run = await extractRelations(id!, hooks);
      return t('cast.relationsFound', { count: run.found, failed: run.failed });
    }
    const run = await checkContinuity(id!, subjects, hooks);
    return t('cast.flagged', { count: run.flagged, failed: run.failed });
  }

  const ordered = byFrequency(entities, mentions);

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}
    >
      <Stack.Screen options={{ title: t(`book.${castNoun(book?.kind)}`), headerBackTitle: ' ' }} />

      <Section title={t('cast.analysis')}>
        <Row
          label={t('cast.deep')}
          value={t('cast.costs')}
          onPress={chapters.length ? () => openPass('deep') : undefined}
        />
        <Row
          label={entities.length ? t('cast.reanalyze') : t('cast.analyze')}
          value={t('cast.costs')}
          onPress={chapters.length ? () => openPass('extract') : undefined}
        />
        <Row
          label={t('cast.findRelations')}
          value={relations.length ? `${relations.length}` : t('cast.costs')}
          onPress={entities.length ? () => openPass('relations') : undefined}
        />
        <Row
          label={t('cast.checkContinuity')}
          value={open.length ? `${open.length}` : t('cast.costs')}
          onPress={subjects.length ? () => openPass('continuity') : undefined}
          last
        />
      </Section>
      <Hint>{t('cast.hint')}</Hint>

      {relations.length > 0 && (
        <Section title={t('cast.graph')}>
          <Row
            label={t('cast.openGraph')}
            value={`${relations.length}  ›`}
            onPress={() => router.push(`/book/${id}/graph`)}
            last
          />
        </Section>
      )}

      {open.length > 0 && (
        <Section title={t('cast.continuity')}>
          {open.map((flag, index) => (
            <View
              key={flag.id}
              style={[
                styles.flag,
                index < open.length - 1 && {
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderColor: palette.border,
                },
              ]}
            >
              <Text style={{ color: palette.text, fontSize: 14, flex: 1 }}>
                {nameOf(entities, flag.entity_id)} · {flag.detail}
              </Text>
              <Pressable
                onPress={async () => {
                  await setFlagStatus(flag.id, 'dismissed');
                  load();
                }}
                hitSlop={8}
              >
                <Text style={{ color: palette.accent, fontSize: 13 }}>{t('cast.dismiss')}</Text>
              </Pressable>
            </View>
          ))}
        </Section>
      )}

      <Section title={t(`book.${castNoun(book?.kind)}`)}>
        {entities.length === 0 ? (
          <Row label={t(`book.${castNoun(book?.kind)}Empty`)} last />
        ) : (
          ordered.map((entity, index) => {
            const timeline = timelineFor(mentions, entity.id);
            const span = appearances(timeline);
            return (
              <Pressable
                key={entity.id}
                onPress={() => router.push(`/entity/${entity.id}`)}
                style={[
                  styles.person,
                  index < ordered.length - 1 && {
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderColor: palette.border,
                  },
                ]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                  <Text style={{ color: palette.text, fontSize: 16, flex: 1 }}>{entity.name}</Text>
                  <Text style={{ color: palette.dim, fontSize: 12 }}>
                    {span
                      ? t('cast.span', { first: span.first + 1, last: span.last + 1 })
                      : t('cast.unseen')}
                  </Text>
                  <Pressable
                    onPress={() => setMenuFor(entity)}
                    style={({ pressed }) => [styles.more, pressed && { opacity: 0.4 }]}
                    hitSlop={6}
                  >
                    <Text style={{ color: palette.accent, fontSize: 20 }}>⋯</Text>
                  </Pressable>
                </View>
                {entity.role ? (
                  <Text style={{ color: palette.dim, fontSize: 13, marginTop: 2 }}>{entity.role}</Text>
                ) : null}
                <View style={{ marginTop: space.sm }}>
                  <Sparkline
                    bars={bucketize(timeline, chapters.length)}
                    tint={palette.accent}
                    dim={palette.faint}
                  />
                </View>
              </Pressable>
            );
          })
        )}
      </Section>

      {entities.length > 0 && (
        <Section>
          <Row label={t('cast.clear')} onPress={confirmClear} danger last />
        </Section>
      )}

      <ActionMenu
        visible={menuFor !== null}
        title={menuFor?.name}
        onClose={() => setMenuFor(null)}
        actions={[
          {
            label: t('entity.polish'),
            onPress: async () => {
              const entity = menuFor!;
              setMenuFor(null);
              await queuePolish(id!, entity.id, entity.name);
            },
          },
          {
            label: t('entity.open'),
            onPress: () => {
              const entity = menuFor!;
              setMenuFor(null);
              router.push(`/entity/${entity.id}`);
            },
          },
          {
            label: t('settings.delete'),
            danger: true,
            onPress: () => {
              const entity = menuFor!;
              setMenuFor(null);
              Alert.alert(entity.name, t('entity.deleteConfirm'), [
                { text: t('settings.cancel'), style: 'cancel' },
                {
                  text: t('settings.delete'),
                  style: 'destructive',
                  onPress: async () => {
                    await deleteEntity(entity.id);
                    load();
                  },
                },
              ]);
            },
          },
        ]}
      />

      <AiRunSheet
        visible={pass !== null}
        title={t(`cast.title_${pass ?? 'extract'}`)}
        description={t(`cast.what_${pass ?? 'extract'}`)}
        estimate={pass ? estimates[pass] ?? null : null}
        hasKey={keyed}
        onRun={(hooks) => runPass(pass!, hooks)}
        onClose={(changed) => {
          setPass(null);
          if (changed) load();
        }}
      />
    </ScrollView>
  );
}

function nameOf(entities: Entity[], id: string): string {
  return entities.find((entity) => entity.id === id)?.name ?? '—';
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  person: { paddingHorizontal: space.lg, paddingVertical: space.md },
  more: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  flag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
});
