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
import { Action, Badge, Block, Chip, ChipRow, Empty, Fact, Hero, Item } from '../../src/ui/detail';
import { Hint } from '../../src/ui/primitives';
import { hueFrom } from '../../src/ui/fields';
import { formatCount } from '../../src/text/counts';
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
  const [language, setLanguage] = useState('en');
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
      setLanguage(book?.language ?? 'en');
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

      <Hero
        eyebrow={t('chapter.number', { index: chapter.idx + 1 })}
        facts={
          <>
            <Fact value={formatCount(chapter.end - chapter.start, language)} label={t('units.unit_long')} />
            {/* A fact that reads "0 places" is not a fact anyone needed. */}
            {scenes.length > 0 && <Fact value={scenes.length} label={t('units.unit_scenes')} />}
            {cast.length > 0 && <Fact value={cast.length} label={t('units.unit_cast')} />}
            {places.length > 0 && <Fact value={places.length} label={t('units.unit_places')} />}
          </>
        }
        actions={
          <>
            <Action label={t('chapter.read')} onPress={() => read()} tone="loud" />
            <Action
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
            />
          </>
        }
      >
        <EditableLine
          value={chapter.title}
          placeholder={t('structure.untitled')}
          onCommit={(value) => renameChapterTitle(chapter.id, value).then(load)}
          style={{ color: palette.text, fontSize: 26, fontWeight: '700', lineHeight: 32 }}
        />
        <EditableLine
          value={chapter.brief}
          placeholder={t('structure.briefPlaceholder')}
          onCommit={(value) => setChapterBrief(chapter.id, value.trim() || null).then(load)}
          style={{ color: palette.dim, fontSize: 15, lineHeight: 22, marginTop: space.sm }}
          multiline
          numberOfLines={8}
        />
      </Hero>

      <Block title={t('chapter.scenes')} count={scenes.length || undefined}>
        {scenes.length === 0 ? (
          <Empty text={t('chapter.noScenes')} />
        ) : (
          scenes.map((scene, index) => (
            // The name is the way in: everything about a scene, and every edit
            // to it, lives on its own page rather than being retyped here.
            <Item
              key={scene.id}
              badge={<Badge n={index + 1} />}
              title={scene.title?.trim() || t('chapter.scenePlaceholder', { index: index + 1 })}
              detail={scene.summary?.trim() || undefined}
              onPress={() => router.push(`/scene/${scene.id}`)}
            />
          ))
        )}
      </Block>

      <Block title={t('chapter.cast')} count={cast.length || undefined}>
        {cast.length === 0 ? (
          <Empty text={t('chapter.noCast')} />
        ) : (
          <ChipRow>
            {cast.map((person) => (
              <Chip
                key={person.id}
                label={person.name}
                detail={
                  [person.observed_appearance, person.observed_voice, person.observed_note]
                    .filter(Boolean)
                    .join(' · ') || undefined
                }
                hue={hueFrom(person.name)}
                onPress={() => router.push(`/entity/${person.id}`)}
              />
            ))}
          </ChipRow>
        )}
      </Block>

      <Block title={t('chapter.places')} count={places.length || undefined}>
        {places.length === 0 ? (
          <Empty text={t('chapter.noPlaces')} />
        ) : (
          <ChipRow>
            {places.map((place) => (
              <Chip
                key={place.id}
                label={place.name}
                detail={place.observed_note ?? undefined}
                hue={hueFrom(place.name)}
                onPress={() => router.push(`/place/${place.id}`)}
              />
            ))}
          </ChipRow>
        )}
      </Block>

      <Hint>{t('chapter.hint')}</Hint>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
