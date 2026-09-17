import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import {
  getChapter,
  listChapterCast,
  listChapterPlaces,
  listChapterScenes,
  renameChapterTitle,
  setChapterBrief,
  type Chapter,
  type ChapterCast,
  type ChapterPlace,
  type Scene,
} from '../../src/db/repo';
import { estimateDeep, queueChapterRun } from '../../src/analysis/runs';
import { formatUsd, type Estimate } from '../../src/ai/cost';
import { getBook, getDocumentText } from '../../src/db/repo';
import { EditableLine } from '../../src/ui/EditableLine';
import { Hint, Row, Section } from '../../src/ui/primitives';
import { space, usePalette } from '../../src/theme';
import { useWorkRefresh } from '../../src/work/refresh';

/**
 * Everything one chapter turned out to be, in one place. The list on Structure
 * is for reordering a book; this is for reading what a chapter contains — and
 * every name in it is a way into that person's own page.
 */
export default function ChapterPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const palette = usePalette();
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [cast, setCast] = useState<ChapterCast[]>([]);
  const [places, setPlaces] = useState<ChapterPlace[]>([]);
  const [cost, setCost] = useState<Estimate | null>(null);
  const [queued, setQueued] = useState(false);

  const load = useCallback(() => {
    if (!id) return;
    getChapter(id).then(async (found) => {
      setChapter(found);
      if (!found) return;
      setScenes(await listChapterScenes(found.id));
      setCast(await listChapterCast(found.book_id, found.idx));
      setPlaces(await listChapterPlaces(found.book_id, found.idx));
      const book = await getBook(found.book_id);
      const text = await getDocumentText(found.book_id);
      setCost(await estimateDeep(text, [found], book?.language ?? 'en'));
    });
  }, [id]);

  useFocusEffect(load);
  // A pass that lands while this page is open has to show up on it.
  useWorkRefresh(load);

  if (!chapter) {
    return (
      <View style={[styles.center, { backgroundColor: palette.bg }]}>
        <ActivityIndicator />
      </View>
    );
  }

  const read = (at?: number) =>
    router.push(
      `/reader/${chapter.book_id}?chapter=${chapter.idx}${at === undefined ? '' : `&at=${at}`}`
    );

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}
    >
      <Stack.Screen options={{ title: t('chapter.title'), headerBackTitle: ' ' }} />

      <Section>
        <View style={{ paddingHorizontal: space.lg, paddingVertical: space.md }}>
          <Text style={{ color: palette.faint, fontSize: 12 }}>
            {t('chapter.number', { index: chapter.idx + 1 })}
          </Text>
          <EditableLine
            value={chapter.title}
            placeholder={t('structure.untitled')}
            onCommit={(value) => renameChapterTitle(chapter.id, value).then(load)}
            style={{ color: palette.text, fontSize: 20, fontWeight: '700', marginTop: 2 }}
          />
          <EditableLine
            value={chapter.brief}
            placeholder={t('structure.briefPlaceholder')}
            onCommit={(value) => setChapterBrief(chapter.id, value.trim() || null).then(load)}
            style={{ color: palette.dim, fontSize: 14, lineHeight: 20, marginTop: space.sm }}
            multiline
            numberOfLines={8}
          />
          <Text style={{ color: palette.faint, fontSize: 12, marginTop: space.sm }}>
            {t('structure.meta', {
              chars: chapter.end - chapter.start,
              scenes: scenes.length,
            })}
          </Text>
        </View>
      </Section>

      <Section>
        <Row label={t('chapter.read')} onPress={() => read()} />
        {/* One chapter is pennies and cached after the first run, so it just goes. */}
        <Row
          label={t('chapter.analyze')}
          detail={
            queued
              ? t('work.queued', { count: 1 })
              : cost
                ? t('ai.estimateLine', {
                    tokens: cost.inputTokens.toLocaleString(),
                    cost: formatUsd(cost.usd),
                  })
                : t('ai.estimateNoKey')
          }
          onPress={async () => {
            await queueChapterRun(chapter.book_id, 'deep-analyze', [chapter]);
            setQueued(true);
          }}
          last
        />
      </Section>

      <Section title={t('chapter.scenes')}>
        {scenes.length === 0 ? (
          <Row label={t('chapter.noScenes')} last />
        ) : (
          scenes.map((scene, index) => (
            <View key={scene.id}>
              {/* The name is the way in: everything about a scene, and every
                  edit to it, lives on its own page rather than being retyped
                  in miniature here. */}
              <Row
                label={scene.title?.trim() || t('chapter.scenePlaceholder', { index: index + 1 })}
                detail={scene.summary?.trim() || undefined}
                value="›"
                onPress={() => router.push(`/scene/${scene.id}`)}
              />
              <Row
                label={t('chapter.readScene')}
                onPress={() => read(scene.start)}
                last={index === scenes.length - 1}
              />
            </View>
          ))
        )}
      </Section>

      <Section title={t('chapter.cast')}>
        {cast.length === 0 ? (
          <Row label={t('chapter.noCast')} last />
        ) : (
          cast.map((person, index) => (
            <Row
              key={person.id}
              label={person.name}
              value="›"
              detail={[person.observed_appearance, person.observed_voice, person.observed_note]
                .filter(Boolean)
                .join(' · ')}
              onPress={() => router.push(`/entity/${person.id}`)}
              last={index === cast.length - 1}
            />
          ))
        )}
      </Section>

      <Section title={t('chapter.places')}>
        {places.length === 0 ? (
          <Row label={t('chapter.noPlaces')} last />
        ) : (
          places.map((place, index) => (
            <Row
              key={place.id}
              label={place.name}
              detail={place.observed_note ?? undefined}
              value="›"
              onPress={() => router.push(`/place/${place.id}`)}
              last={index === places.length - 1}
            />
          ))
        )}
      </Section>

      <Hint>{t('chapter.hint')}</Hint>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
