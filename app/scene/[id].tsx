import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import {
  getChapter,
  getBook,
  getDocumentText,
  getScene,
  listChapters,
  listChapterScenes,
  listEntities,
  listScenes,
  updateScene,
  type Chapter,
  type Entity,
  type Scene,
} from '../../src/db/repo';
import { namesOf } from '../../src/cast/mentions';
import { EditableLine } from '../../src/ui/EditableLine';
import { useWorkRefresh } from '../../src/work/refresh';
import { Action, Badge, Block, Chip, ChipRow, Empty, Fact, Hero, Item, Quote } from '../../src/ui/detail';
import { Hint } from '../../src/ui/primitives';
import { hueFrom } from '../../src/ui/fields';
import { formatCount } from '../../src/text/counts';
import { space, usePalette } from '../../src/theme';

const EXCERPT = 600;

/**
 * One scene: what happens in it, who is in it, and the text itself. The cast
 * is counted from the scene's own words rather than inherited from the
 * chapter — a chapter's cast is not in every scene of it.
 */
export default function ScenePage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const palette = usePalette();
  const [scene, setScene] = useState<Scene | null>(null);
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [body, setBody] = useState('');
  const [present, setPresent] = useState<Entity[]>([]);
  const [position, setPosition] = useState({ index: 0, total: 0 });
  const [language, setLanguage] = useState('en');
  /** Every scene in the book carrying this same name, in reading order. */
  const [appearances, setAppearances] = useState<{ scene: Scene; chapter: Chapter | undefined }[]>([]);

  const load = useCallback(() => {
    if (!id) return;
    getScene(id).then(async (found) => {
      setScene(found);
      if (!found) return;
      const owner = await getChapter(found.chapter_id);
      setChapter(owner);
      setLanguage((await getBook(found.book_id))?.language ?? 'en');
      const text = await getDocumentText(found.book_id);
      const slice = text.slice(found.start, found.end);
      setBody(slice);
      const entities = [
        ...(await listEntities(found.book_id, 'character')),
        ...(await listEntities(found.book_id, 'place')),
      ];
      setPresent(entities.filter((entity) => namesOf(entity).some((name) => slice.includes(name))));
      if (owner) {
        const siblings = await listChapterScenes(owner.id);
        setPosition({
          index: siblings.findIndex((entry) => entry.id === found.id) + 1,
          total: siblings.length,
        });
      }

      const title = found.title?.trim();
      if (title) {
        const all = await listScenes(found.book_id);
        const owners = await listChapters(found.book_id);
        setAppearances(
          all
            .filter((entry) => entry.title?.trim() === title)
            .map((entry) => ({
              scene: entry,
              chapter: owners.find((chapter) => chapter.id === entry.chapter_id),
            }))
        );
      } else {
        setAppearances([]);
      }
    });
  }, [id]);

  useFocusEffect(load);
  useWorkRefresh(load);

  if (!scene) {
    return (
      <View style={[styles.centre, { backgroundColor: palette.bg }]}>
        <ActivityIndicator />
      </View>
    );
  }

  const label = scene.title?.trim() || t('chapter.scenePlaceholder', { index: scene.idx + 1 });

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}
    >
      <Stack.Screen options={{ title: t('scene.title'), headerBackTitle: ' ' }} />

      <Hero
        // The chapter, not the position: "Scene 1 of 2" over a title reading
        // "Scene 1" said the same thing twice and neither said where you are.
        eyebrow={chapter?.title.trim() || undefined}
        facts={
          <>
            <Fact value={`${position.index}/${position.total}`} label={t('scene.unit')} />
            <Fact value={formatCount(body.length, language)} label={t('units.unit_long')} />
            {scene.source === 'ai' ? <Fact value={'✦'} label={t('scene.byAi')} /> : null}
          </>
        }
        actions={
          <>
            <Action
              label={t('scene.read')}
              tone="loud"
              onPress={() =>
                router.push(`/reader/${scene.book_id}?chapter=${chapter?.idx ?? 0}&at=${scene.start}`)
              }
            />
            <Action
              label={t('scene.openChapter')}
              detail={chapter?.title.trim() || undefined}
              onPress={() => chapter && router.push(`/chapter/${chapter.id}`)}
            />
          </>
        }
      >
        <EditableLine
          value={scene.title}
          placeholder={label}
          solid
          onCommit={(value) => updateScene(scene.id, { title: value || null }).then(load)}
          style={{ color: palette.text, fontSize: 26, fontWeight: '700', lineHeight: 32 }}
        />
        <EditableLine
          value={scene.summary}
          placeholder={t('chapter.sceneSummaryPlaceholder')}
          onCommit={(value) => updateScene(scene.id, { summary: value || null }).then(load)}
          style={{ color: palette.dim, fontSize: 15, lineHeight: 22, marginTop: space.sm }}
          multiline
          numberOfLines={8}
        />
      </Hero>

      <Block title={t('scene.present')} count={present.length || undefined}>
        {present.length === 0 ? (
          <Empty text={t('scene.nonePresent')} />
        ) : (
          <ChipRow>
            {present.map((entity) => (
              <Chip
                key={entity.id}
                label={entity.name}
                detail={entity.kind === 'place' ? t('scene.aPlace') : entity.role ?? undefined}
                hue={hueFrom(entity.name)}
                onPress={() =>
                  router.push(entity.kind === 'place' ? `/place/${entity.id}` : `/entity/${entity.id}`)
                }
              />
            ))}
          </ChipRow>
        )}
      </Block>

      {appearances.length > 1 && (
        <Block title={t('scene.appearances')} count={appearances.length}>
          {appearances.map((entry) => {
            const here = entry.scene.id === scene.id;
            return (
              <Item
                key={entry.scene.id}
                badge={<Badge n={(entry.chapter?.idx ?? 0) + 1} tone={here ? 'quiet' : undefined} />}
                title={entry.chapter?.title.trim() || t('chapter.number', { index: (entry.chapter?.idx ?? 0) + 1 })}
                detail={entry.scene.summary?.trim() || t('scenes.noSummary')}
                meta={here ? t('scene.thisOne') : undefined}
                onPress={here ? undefined : () => router.push(`/scene/${entry.scene.id}`)}
              />
            );
          })}
        </Block>
      )}

      <Block title={t('scene.excerpt')}>
        <Quote>
          <Text selectable style={[styles.body, { color: palette.text }]}>
            {body.slice(0, EXCERPT).trim()}
            {body.length > EXCERPT ? '…' : ''}
          </Text>
        </Quote>
      </Block>

      <Hint>{t('scene.hint')}</Hint>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { fontSize: 15, lineHeight: 24 },
});
