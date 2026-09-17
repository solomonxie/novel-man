import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import {
  deleteEntity,
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
import { hasAnyKey } from '../../src/ai/keys';
import { useWorkRefresh } from '../../src/work/refresh';
import { EditableRow } from '../../src/ui/fields';
import { FieldsSection } from '../../src/ui/FieldsSection';
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

      <Section
        action={
          visits.length ? { label: t('place.polish'), onPress: () => setPolishOpen(true) } : undefined
        }
      >
        <EditableRow
          label={t('place.name')}
          value={place.name}
          onCommit={(value) => value.trim() && save({ name: value.trim() })}
        />
        <EditableRow
          label={t('place.alias')}
          value={place.alias}
          placeholder={t('place.aliasPlaceholder')}
          onCommit={(value) => save({ alias: value.trim() || null })}
        />
        <EditableRow
          label={t('place.summary')}
          value={place.summary}
          placeholder={t('place.summaryPlaceholder')}
          onCommit={(value) => save({ summary: value.trim() || null })}
          multiline
          last
        />
      </Section>

      {span ? (
        <Section title={t('place.where')}>
          <Row label={t('place.firstSeen')} value={chapterOf(span.first)} />
          <Row label={t('place.lastSeen')} value={chapterOf(span.last)} />
          <Row label={t('place.chapterCount')} value={`${visits.length}`} last />
        </Section>
      ) : null}

      <Section title={t('place.scenes')}>
        {scenes.length === 0 ? (
          <Row label={t('place.noScenes')} last />
        ) : (
          scenes.map((scene, index) => {
            const chapter = chapterById(scene.chapter_id);
            return (
              <Row
                key={scene.id}
                label={scene.title?.trim() || t('chapter.scenePlaceholder', { index: scene.idx + 1 })}
                detail={[chapter ? chapterOf(chapter.idx) : null, scene.summary?.trim()]
                  .filter(Boolean)
                  .join(' · ')}
                value="›"
                onPress={() => router.push(`/scene/${scene.id}`)}
                last={index === scenes.length - 1}
              />
            );
          })
        )}
      </Section>

      <Section title={t('place.company')}>
        {company.length === 0 ? (
          <Row label={t('place.noCompany')} last />
        ) : (
          company.map((person, index) => (
            <Row
              key={person.id}
              label={person.name}
              detail={person.role ?? undefined}
              value={`${t('place.sharedChapters', { count: person.shared })}  ›`}
              onPress={() => router.push(`/entity/${person.id}`)}
              last={index === company.length - 1}
            />
          ))
        )}
      </Section>

      <Section title={t('place.mentions')}>
        {visits.length === 0 ? (
          <Row label={t('place.noMentions')} last />
        ) : (
          visits.map((visit, index) => (
            <Row
              key={`${visit.chapter_idx}`}
              label={chapterOf(visit.chapter_idx)}
              detail={visit.note ?? undefined}
              value="›"
              onPress={() => router.push(`/reader/${place.book_id}?chapter=${visit.chapter_idx}`)}
              last={index === visits.length - 1}
            />
          ))
        )}
      </Section>

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
