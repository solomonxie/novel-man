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
import { Hint, Row, Section } from '../../src/ui/primitives';
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

      <Section>
        <View style={{ paddingHorizontal: space.lg, paddingVertical: space.md }}>
          <Text style={{ color: palette.faint, fontSize: 12 }}>
            {t('scene.position', { index: position.index, total: position.total })}
          </Text>
          <EditableLine
            value={scene.title}
            placeholder={label}
            onCommit={(value) => updateScene(scene.id, { title: value || null }).then(load)}
            style={{ color: palette.text, fontSize: 20, fontWeight: '700', marginTop: 2 }}
          />
          <EditableLine
            value={scene.summary}
            placeholder={t('chapter.sceneSummaryPlaceholder')}
            onCommit={(value) => updateScene(scene.id, { summary: value || null }).then(load)}
            style={{ color: palette.dim, fontSize: 14, lineHeight: 20, marginTop: space.sm }}
            multiline
            numberOfLines={8}
          />
          <Text style={{ color: palette.faint, fontSize: 12, marginTop: space.sm }}>
            {formatCount(body.length, language)}
            {scene.source === 'ai' ? `  ·  ${t('scene.byAi')}` : ''}
          </Text>
        </View>
      </Section>

      <Section>
        <Row
          label={t('scene.read')}
          onPress={() =>
            router.push(`/reader/${scene.book_id}?chapter=${chapter?.idx ?? 0}&at=${scene.start}`)
          }
        />
        <Row
          label={t('scene.openChapter')}
          detail={chapter?.title.trim() || undefined}
          value="›"
          onPress={() => chapter && router.push(`/chapter/${chapter.id}`)}
          last
        />
      </Section>

      {appearances.length > 1 && (
        <Section title={t('scene.appearances')}>
          {appearances.map((entry, index) => {
            const here = entry.scene.id === scene.id;
            return (
              <Row
                key={entry.scene.id}
                label={
                  entry.chapter
                    ? `${entry.chapter.idx + 1}. ${entry.chapter.title.trim()}`.trim()
                    : '—'
                }
                detail={entry.scene.summary?.trim() || t('scenes.noSummary')}
                value={here ? t('scene.thisOne') : '›'}
                onPress={here ? undefined : () => router.push(`/scene/${entry.scene.id}`)}
                last={index === appearances.length - 1}
              />
            );
          })}
        </Section>
      )}

      <Section title={t('scene.present')}>
        {present.length === 0 ? (
          <Row label={t('scene.nonePresent')} last />
        ) : (
          present.map((entity, index) => (
            <Row
              key={entity.id}
              label={entity.name}
              detail={entity.kind === 'place' ? t('scene.aPlace') : entity.role ?? undefined}
              value="›"
              onPress={() =>
                router.push(entity.kind === 'place' ? `/place/${entity.id}` : `/entity/${entity.id}`)
              }
              last={index === present.length - 1}
            />
          ))
        )}
      </Section>

      <Section title={t('scene.excerpt')}>
        <Text selectable style={[styles.body, { color: palette.text }]}>
          {body.slice(0, EXCERPT).trim()}
          {body.length > EXCERPT ? '…' : ''}
        </Text>
      </Section>

      <Hint>{t('scene.hint')}</Hint>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { fontSize: 15, lineHeight: 24, paddingHorizontal: space.lg, paddingBottom: space.md },
});
