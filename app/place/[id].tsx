import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import {
  deleteEntity,
  getDocumentText,
  getEntity,
  listChapters,
  listPlaceCompany,
  listPlaceVisits,
  listScenesAtPlace,
  parseFields,
  updateEntity,
  type Chapter,
  type CustomField,
  type Entity,
  type PlaceCompany,
  type PlaceVisit,
  type Scene,
} from '../../src/db/repo';
import { AiRunSheet } from '../../src/ui/AiRunSheet';
import { queuePlacePolish } from '../../src/analysis/runs';
import { sceneOpening } from '../../src/structure/scenes';
import { hasAnyKey } from '../../src/ai/keys';
import { useWorkRefresh } from '../../src/work/refresh';
import { hueFrom } from '../../src/ui/fields';
import { EditableLine } from '../../src/ui/EditableLine';
import { FieldsSection } from '../../src/ui/FieldsSection';
import { Action, Badge, Block, Chip, ChipRow, Empty, Fact, Hero, Item } from '../../src/ui/detail';
import { Hint, Row, Section } from '../../src/ui/primitives';
import { space, usePalette } from '../../src/theme';

/**
 * A place is not a person with the person parts blanked out. It has no face,
 * no voice and no arc — what it has is a stretch of book it belongs to, the
 * people who keep turning up in it, and the scenes that happen there.
 */
export default function PlacePage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const palette = usePalette();
  const [place, setPlace] = useState<Entity | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [visits, setVisits] = useState<PlaceVisit[]>([]);
  const [company, setCompany] = useState<PlaceCompany[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [text, setText] = useState('');
  const [polishOpen, setPolishOpen] = useState(false);
  const [keyed, setKeyed] = useState(false);
  const latest = useRef<Entity | null>(null);
  latest.current = place;

  useEffect(
    () => () => {
      const leaving = latest.current;
      if (leaving && isBlank(leaving)) void deleteEntity(leaving.id);
    },
    []
  );

  const load = useCallback(() => {
    if (!id) return;
    getEntity(id).then(async (found) => {
      setPlace(found);
      if (!found) return;
      setChapters(await listChapters(found.book_id));
      setVisits(await listPlaceVisits(found.id));
      setCompany(await listPlaceCompany(found.id));
      setScenes(await listScenesAtPlace(found.id));
      setText(await getDocumentText(found.book_id));
    });
  }, [id]);

  useFocusEffect(load);
  // A profile written while this page is open has to show up on it.
  useWorkRefresh(load);

  useEffect(() => {
    hasAnyKey().then(setKeyed);
  }, []);

  if (!place) {
    return (
      <View style={[styles.centre, { backgroundColor: palette.bg }]}>
        <ActivityIndicator />
      </View>
    );
  }

  const chapterOf = (idx: number) =>
    chapters.find((entry) => entry.idx === idx)?.title.trim() || `${idx + 1}`;
  const chapterById = (chapterId: string) => chapters.find((entry) => entry.id === chapterId);

  async function save(changes: Parameters<typeof updateEntity>[1]) {
    await updateEntity(place!.id, changes);
    load();
  }

  function confirmDelete() {
    Alert.alert(t('place.deleteConfirm'), undefined, [
      { text: t('settings.cancel'), style: 'cancel' },
      {
        text: t('settings.delete'),
        style: 'destructive',
        onPress: async () => {
          await deleteEntity(place!.id);
          router.back();
        },
      },
    ]);
  }

  const span = visits.length
    ? { first: visits[0].chapter_idx, last: visits[visits.length - 1].chapter_idx }
    : null;

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}
    >
      <Stack.Screen options={{ title: place.name, headerBackTitle: ' ' }} />

      <Hero
        eyebrow={t('place.eyebrow')}
        facts={
          span
            ? (
              <>
                <Fact value={t('units.chapterShort', { n: span.first + 1 })} label={t('place.firstSeen')} />
                <Fact value={t('units.chapterShort', { n: span.last + 1 })} label={t('place.lastSeen')} />
                <Fact value={visits.length} label={t('units.unit_chapters')} />
              </>
            )
            : undefined
        }
        actions={
          visits.length ? <Action label={t('place.polish')} onPress={() => setPolishOpen(true)} /> : undefined
        }
      >
        <EditableLine
          value={place.name}
          placeholder={t('place.name')}
          onCommit={(value) => value.trim() && save({ name: value.trim() })}
          style={{ color: palette.text, fontSize: 26, fontWeight: '700', lineHeight: 32 }}
        />
        <EditableLine
          value={place.alias}
          placeholder={t('place.aliasPlaceholder')}
          onCommit={(value) => save({ alias: value.trim() || null })}
          style={{ color: palette.faint, fontSize: 14, marginTop: 2 }}
        />
        <EditableLine
          value={place.summary}
          placeholder={t('place.summaryPlaceholder')}
          onCommit={(value) => save({ summary: value.trim() || null })}
          style={{ color: palette.dim, fontSize: 15, lineHeight: 22, marginTop: space.sm }}
          multiline
          numberOfLines={8}
        />
      </Hero>

      <Block title={t('place.scenes')} count={scenes.length || undefined}>
        {scenes.length === 0 ? (
          <Empty text={t('place.noScenes')} />
        ) : (
          scenes.map((scene) => {
            const chapter = chapterById(scene.chapter_id);
            return (
              <Item
                key={scene.id}
                badge={<Badge n={(chapter?.idx ?? 0) + 1} />}
                title={scene.title?.trim() || sceneOpening(text, scene)}
                quiet={!scene.title?.trim()}
                detail={[chapter ? chapterOf(chapter.idx) : null, scene.summary?.trim()]
                  .filter(Boolean)
                  .join(' · ')}
                onPress={() => router.push(`/scene/${scene.id}`)}
              />
            );
          })
        )}
      </Block>

      <Block title={t('place.company')} count={company.length || undefined}>
        {company.length === 0 ? (
          <Empty text={t('place.noCompany')} />
        ) : (
          <ChipRow>
            {company.map((person) => (
              <Chip
                key={person.id}
                label={person.name}
                detail={t('place.sharedChapters', { count: person.shared })}
                hue={hueFrom(person.name)}
                onPress={() => router.push(`/entity/${person.id}`)}
              />
            ))}
          </ChipRow>
        )}
      </Block>

      <Block title={t('place.mentions')} count={visits.length || undefined}>
        {visits.length === 0 ? (
          <Empty text={t('place.noMentions')} />
        ) : (
          visits.map((visit) => (
            <Item
              key={`${visit.chapter_idx}`}
              badge={<Badge n={visit.chapter_idx + 1} tone="quiet" />}
              title={chapterOf(visit.chapter_idx)}
              detail={visit.note ?? undefined}
              onPress={() => router.push(`/reader/${place.book_id}?chapter=${visit.chapter_idx}`)}
            />
          ))
        )}
      </Block>

      <FieldsSection
        title={t('place.fields')}
        fields={parseFields(place.fields)}
        onChange={(next: CustomField[]) => save({ fields: JSON.stringify(next) })}
      />

      <AiRunSheet
        visible={polishOpen}
        title={t('place.polish')}
        description={t('place.polishWhat', { count: visits.length })}
        estimate={null}
        hasKey={keyed}
        onRun={async () => {
          await queuePlacePolish(place!.book_id, place!.id, place!.name);
          return t('work.queued', { count: 1 });
        }}
        onClose={() => setPolishOpen(false)}
      />

      <Hint>{t('place.hint')}</Hint>

      <Section>
        <Row label={t('settings.delete')} onPress={confirmDelete} danger last />
      </Section>
    </ScrollView>
  );
}

/** Nothing typed and nothing extracted — there is no place here. */
function isBlank(entity: Entity): boolean {
  return (
    !entity.name.trim() &&
    !entity.alias &&
    !entity.summary &&
    parseFields(entity.fields).filter((field) => field.label.trim() || field.value.trim())
      .length === 0
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
