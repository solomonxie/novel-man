import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from '../../src/navigation/router';
import { useTranslation } from 'react-i18next';

import {
  getBook,
  getDocumentText,
  getScene,
  listChapters,
  listEntities,
  nameScene,
  renameSceneTag,
  scenesOfTag,
  updateScene,
  type Chapter,
  type Entity,
  type Scene,
} from '../../src/db/repo';
import { namesOf } from '../../src/cast/mentions';
import { AppearanceGraph, chapterLabel, type Range } from '../../src/ui/AppearanceGraph';
import { EditableLine } from '../../src/ui/EditableLine';
import { useWorkRefresh } from '../../src/work/refresh';
import { Badge, Block, Chip, ChipRow, Empty, Fact, FactRow, Hero, Item } from '../../src/ui/detail';
import { Prose } from '../../src/ui/Prose';
import { Hint } from '../../src/ui/primitives';
import { hueFrom } from '../../src/ui/fields';
import { space, usePalette } from '../../src/theme';


/** One scene name, counted per chapter — the same shape a mention timeline has. */
function recurrences(entries: { chapter: Chapter | undefined }[]) {
  const perChapter = new Map<number, number>();
  for (const { chapter } of entries) {
    if (!chapter) continue;
    perChapter.set(chapter.idx, (perChapter.get(chapter.idx) ?? 0) + 1);
  }
  return [...perChapter]
    .sort(([a], [b]) => a - b)
    .map(([chapter_idx, count]) => ({ chapter_idx, count }));
}

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
  const [present, setPresent] = useState<Entity[]>([]);
  /** Every scene in the book carrying this same name, in reading order. */
  const [appearances, setAppearances] = useState<{ scene: Scene; chapter: Chapter | undefined }[]>([]);
  /** Every chapter of the book, so the graph has a length to spread across. */
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [fetched, setFetched] = useState(false);
  /** The recurrences inside the tapped stretch of the graph. */
  const [shown, setShown] = useState<{ scene: Scene; chapter: Chapter | undefined }[]>([]);

  const load = useCallback(() => {
    if (!id) return;
    getScene(id).then(async (found) => {
      setScene(found);
      if (!found) return;
      const owned = await getBook(found.book_id);
      setFetched(Boolean(owned?.text_source));
      setChapters(await listChapters(found.book_id));
      const text = await getDocumentText(found.book_id);
      const slice = text.slice(found.start, found.end);
      const entities = [
        ...(await listEntities(found.book_id, 'character')),
        ...(await listEntities(found.book_id, 'place')),
      ];
      setPresent(entities.filter((entity) => namesOf(entity).some((name) => slice.includes(name))));

      // A named span belongs to a scene, and the scene knows every chapter it
      // happens in — no longer found by matching one title string to another.
      if (found.scene_tag_id) {
        const spans = await scenesOfTag(found.scene_tag_id);
        const owners = await listChapters(found.book_id);
        setAppearances(
          spans.map((entry) => ({
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

  const span = useMemo(() => {
    const seen = appearances.map((entry) => entry.chapter?.idx).filter((idx) => idx !== undefined);
    if (!seen.length) return null;
    return { chapters: new Set(seen).size, first: Math.min(...seen), last: Math.max(...seen) };
  }, [appearances]);

  /** A row is where the scene is, so it opens the words rather than another page like this one. */
  const openAt = (entry: { scene: Scene; chapter: Chapter | undefined }) =>
    router.push(`/reader/${entry.scene.book_id}?chapter=${entry.chapter?.idx ?? 0}&at=${entry.scene.start}`);

  if (!scene) {
    return (
      <View style={[styles.centre, { backgroundColor: palette.bg }]}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}
    >
      <Stack.Screen options={{ title: t('scene.title'), headerBackTitle: ' ' }} />

      {/* The name and what happens, and nothing else. A scene is a thing the
          book comes back to; a count of characters, a position inside one
          chapter and two buttons out of the page said nothing about which
          scene this is, which is the only question the top of a page answers. */}
      <Hero eyebrow={t('scene.title')} note={scene.source === 'ai' ? `✦  ${t('scene.byAi')}` : undefined}>
        <EditableLine
          value={scene.title}
          placeholder={t('chapter.sceneNamePlaceholder')}
          /* This is the scene's own page, so renaming here renames the scene
             — every chapter it happens in, one write. Naming an unnamed span
             files it under that scene instead, creating it the first time the
             name is used; clearing the line takes this span back out. */
          onCommit={(value) =>
            (scene.scene_tag_id && value.trim()
              ? renameSceneTag(scene.scene_tag_id, value)
              : nameScene(scene.id, value)
            ).then(load)
          }
          style={{ color: palette.text, fontSize: 26, fontWeight: '700', lineHeight: 32 }}
        />

        {/* Read, not edited by touching it: touching it opens it out, and
            editing is a word of its own. */}
        <Prose
          value={scene.summary}
          placeholder={t('scene.summaryPlaceholder')}
          onCommit={(value) => updateScene(scene.id, { summary: value || null }).then(load)}
          style={{ color: palette.dim, marginTop: space.sm }}
        />

      </Hero>

      {/* How many chapters it happens in, and the two it happens between —
          the same three a term or a person opens with. */}
      {span ? (
        <FactRow>
          <Fact value={span.chapters} label={t('units.chapterCount')} />
          <Fact value={t('units.chapterShort', { n: span.first + 1 })} label={t('scene.firstIn')} />
          <Fact value={t('units.chapterShort', { n: span.last + 1 })} label={t('scene.lastIn')} />
        </FactRow>
      ) : null}

      {/* A scene that happens once has nowhere to recur, so there is no shape
          to draw — the list below already says everything a bar would. */}
      {appearances.length > 1 && (
        <AppearanceGraph
          title={t('scene.timeline')}
          fetchedNote={fetched ? t('scene.timelineFetched') : null}
          timeline={recurrences(appearances)}
          chapters={chapters}
          onPick={(range) =>
            setShown(
              range
                ? appearances.filter(
                    (entry) =>
                      entry.chapter !== undefined &&
                      entry.chapter.idx >= range.from &&
                      entry.chapter.idx <= range.to
                  )
                : []
            )
          }
        >
          {shown.length > 0 && (
            <View style={{ marginTop: space.md, gap: space.sm }}>
              {shown.slice(0, 6).map((entry) => (
                <Pressable
                  key={entry.scene.id}
                  onPress={() => openAt(entry)}
                  style={({ pressed }) => [
                    styles.quote,
                    { borderColor: palette.border, opacity: pressed ? 0.6 : 1 },
                  ]}
                >
                  <Text style={{ color: palette.faint, fontSize: 11 }}>
                    {chapterLabel(chapters, entry.chapter?.idx ?? 0)}
                  </Text>
                  <Text numberOfLines={2} style={{ color: palette.text, fontSize: 13, lineHeight: 19 }}>
                    {entry.scene.summary?.trim() || t('scenes.noSummary')}
                  </Text>
                </Pressable>
              ))}
              <Text style={{ color: palette.faint, fontSize: 12 }}>{t('scene.tapToOpen')}</Text>
            </View>
          )}
        </AppearanceGraph>
      )}

      {/* Every chapter it happens in, and each row opens the words themselves
          — the way out of this page, where two buttons over the title were. */}
      {appearances.length > 0 && (
        <Block title={t('scene.appearances')} count={appearances.length}>
          {appearances.map((entry) => (
            <Item
              key={entry.scene.id}
              badge={<Badge n={(entry.chapter?.idx ?? 0) + 1} />}
              title={entry.chapter?.title.trim() || t('chapter.number', { index: (entry.chapter?.idx ?? 0) + 1 })}
              detail={entry.scene.summary?.trim() || t('scenes.noSummary')}
              meta={entry.scene.id === scene.id ? t('scene.thisOne') : undefined}
              onPress={() => openAt(entry)}
            />
          ))}
        </Block>
      )}

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

      <Hint>{t('scene.hint')}</Hint>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  quote: {
    borderLeftWidth: 2,
    paddingLeft: space.md,
    paddingVertical: 2,
    gap: 2,
  },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { fontSize: 15, lineHeight: 24 },
});
