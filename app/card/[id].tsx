import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from '../../src/navigation/router';
import { useTranslation } from 'react-i18next';

import {
  deleteEntity,
  deleteExcerpt,
  getEntity,
  listChapters,
  listExcerpts,
  updateEntity,
  type Chapter,
  type Entity,
  type Excerpt,
} from '../../src/db/repo';
import { EditableLine } from '../../src/ui/EditableLine';
import { Badge, Block, Empty, Hero, Item } from '../../src/ui/detail';
import { Hint, Row, Section } from '../../src/ui/primitives';
import { space, usePalette } from '../../src/theme';

/**
 * One flash card: a front, what you want to recall, and the passages out of the
 * book that say it.
 *
 * The passages are why this belongs in the reader rather than in a separate app.
 * A card typed from memory has to be trusted; a card with three sentences of the
 * book under it can be checked, and tapping one puts you back where it was said.
 */
export default function CardPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const palette = usePalette();
  const [card, setCard] = useState<Entity | null>(null);
  const [excerpts, setExcerpts] = useState<Excerpt[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const latest = useRef<Entity | null>(null);
  latest.current = card;

  // A card opened, looked at and left without a word on it was a mis-tap on the
  // ＋, not a card. The same rule the term and cast pages keep.
  useEffect(
    () => () => {
      const leaving = latest.current;
      if (leaving && !leaving.name.trim() && !leaving.summary?.trim()) {
        void deleteEntity(leaving.id);
      }
    },
    []
  );

  const load = useCallback(() => {
    if (!id) return;
    getEntity(id).then(async (found) => {
      setCard(found);
      if (!found) return;
      setExcerpts(await listExcerpts(found.id));
      setChapters(await listChapters(found.book_id));
    });
  }, [id]);

  useFocusEffect(load);

  if (!card) {
    return (
      <View style={[styles.centre, { backgroundColor: palette.bg }]}>
        <ActivityIndicator />
      </View>
    );
  }

  async function save(changes: Parameters<typeof updateEntity>[1]) {
    await updateEntity(card!.id, changes);
    load();
  }

  const chapterOf = (idx: number) =>
    chapters.find((entry) => entry.idx === idx)?.title.trim() || `${idx + 1}`;

  function confirmRemove(excerpt: Excerpt) {
    Alert.alert(t('card.removeExcerpt'), excerpt.quote, [
      { text: t('settings.cancel'), style: 'cancel' },
      {
        text: t('settings.delete'),
        style: 'destructive',
        onPress: async () => {
          await deleteExcerpt(excerpt.id);
          load();
        },
      },
    ]);
  }

  function confirmDelete() {
    Alert.alert(t('card.deleteConfirm'), undefined, [
      { text: t('settings.cancel'), style: 'cancel' },
      {
        text: t('settings.delete'),
        style: 'destructive',
        onPress: async () => {
          await deleteEntity(card!.id);
          router.back();
        },
      },
    ]);
  }

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      keyboardDismissMode="interactive"
    >
      <Stack.Screen options={{ title: card.name || t('card.eyebrow'), headerBackTitle: ' ' }} />

      <Hero eyebrow={t('card.eyebrow')}>
        <EditableLine
          value={card.name}
          placeholder={t('card.frontPlaceholder')}
          onCommit={(value) => value.trim() && save({ name: value.trim() })}
          style={{ color: palette.text, fontSize: 24, fontWeight: '700', lineHeight: 30 }}
          multiline
        />
        <EditableLine
          value={card.summary}
          placeholder={t('card.backPlaceholder')}
          onCommit={(value) => save({ summary: value.trim() || null })}
          style={{ color: palette.dim, fontSize: 16, lineHeight: 24, marginTop: space.md }}
          multiline
          numberOfLines={10}
        />
      </Hero>

      <Block title={t('card.excerpts')} count={excerpts.length || undefined}>
        {excerpts.length === 0 ? (
          <Empty text={t('card.noExcerpts')} />
        ) : (
          excerpts.map((excerpt, index) => (
            <Item
              key={excerpt.id}
              badge={<Badge n={excerpt.chapter_idx + 1} tone="quiet" />}
              title={excerpt.quote}
              detail={chapterOf(excerpt.chapter_idx)}
              quiet
              onPress={() =>
                router.push(
                  `/reader/${card.book_id}?chapter=${excerpt.chapter_idx}&at=${excerpt.at}`
                )
              }
              onLongPress={() => confirmRemove(excerpt)}
              last={index === excerpts.length - 1}
            />
          ))
        )}
      </Block>
      <Hint>{t(excerpts.length ? 'card.excerptHint' : 'card.addHint')}</Hint>

      <Section>
        <Row label={t('settings.delete')} onPress={confirmDelete} danger last />
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
