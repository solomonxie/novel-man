import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { listChapters, listScenes, type Chapter, type Scene } from '../../../src/db/repo';
import { Hint, Row, Section } from '../../../src/ui/primitives';
import { space, usePalette } from '../../../src/theme';
import { useWorkRefresh } from '../../../src/work/refresh';

/**
 * Every scene in book order, one row each, straight through to the scene
 * itself. Grouping by name used to come first, which meant tapping a scene
 * opened a list of scenes before anything about a scene — a whole screen
 * between the name and what it names. Recurrence is still worth seeing, so it
 * rides along as a count and opens out on the scene's own page.
 */
export default function ScenesPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const palette = usePalette();
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);

  const load = useCallback(() => {
    if (!id) return;
    listChapters(id).then(setChapters);
    listScenes(id).then(setScenes);
  }, [id]);

  useFocusEffect(load);
  useWorkRefresh(load);

  const chapterOf = (chapterId: string) => chapters.find((entry) => entry.id === chapterId);

  const recurrence = new Map<string, number>();
  for (const scene of scenes) {
    const title = scene.title?.trim();
    if (title) recurrence.set(title, (recurrence.get(title) ?? 0) + 1);
  }
  const names = [...recurrence.keys()].length;

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}
    >
      <Stack.Screen options={{ title: t('scenes.title'), headerBackTitle: ' ' }} />

      {scenes.length === 0 ? (
        <>
          <Section>
            <Row label={t('scenes.empty')} last />
          </Section>
          <Hint>{t('scenes.emptyHint')}</Hint>
        </>
      ) : (
        <>
          <Hint>{t('scenes.count', { scenes: scenes.length, names })}</Hint>

          <Section>
            {scenes.map((scene, index) => {
              const chapter = chapterOf(scene.chapter_id);
              const title = scene.title?.trim();
              const repeats = title ? recurrence.get(title) ?? 1 : 1;
              return (
                <Row
                  key={scene.id}
                  label={title || t('chapter.scenePlaceholder', { index: scene.idx + 1 })}
                  detail={[
                    chapter ? `${chapter.idx + 1}. ${chapter.title.trim()}`.trim() : null,
                    scene.summary?.trim() || t('scenes.noSummary'),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  value={repeats > 1 ? `${t('scenes.times', { count: repeats })}  ›` : '›'}
                  onPress={() => router.push(`/scene/${scene.id}`)}
                  last={index === scenes.length - 1}
                />
              );
            })}
          </Section>
        </>
      )}

      <View style={styles.spacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({ spacer: { height: space.xl } });
