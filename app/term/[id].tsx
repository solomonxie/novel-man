import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from '../../src/navigation/router';
import { useTranslation } from 'react-i18next';

import {
  deleteEntity,
  getBook,
  getDocumentText,
  getEntity,
  listChapters,
  listMentions,
  listPlaceVisits,
  parseFields,
  updateEntity,
  type Book,
  type Chapter,
  type CustomField,
  type Entity,
  type PlaceVisit,
} from '../../src/db/repo';
import { appearancesIn, namesOf, timelineFor, type Appearance } from '../../src/cast/mentions';
import { AppearanceGraph, chapterLabel } from '../../src/ui/AppearanceGraph';
import { kindOf } from '../../src/books/kinds';
import { useWorkRefresh } from '../../src/work/refresh';
import { EditableLine } from '../../src/ui/EditableLine';
import { FieldsSection } from '../../src/ui/FieldsSection';
import { Renderings } from '../../src/ui/Renderings';
import { Badge, Block, Empty, Fact, Hero, Item, LinkLine } from '../../src/ui/detail';
import { Hint, Row, Section } from '../../src/ui/primitives';
import { space, usePalette } from '../../src/theme';

/**
 * The third page, for the third kind of thing a book names. A term has no face
 * and nowhere to stand: what it has is the chapters that use it and what each
 * of them said it was — met in chapter three, wanted again in chapter forty,
 * which is the whole reason it gets a page.
 */
export default function TermPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const palette = usePalette();
  const [term, setTerm] = useState<Entity | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [uses, setUses] = useState<PlaceVisit[]>([]);
  const [text, setText] = useState('');
  const [book, setBook] = useState<Book | null>(null);
  const [timeline, setTimeline] = useState<{ chapter_idx: number; count: number }[]>([]);
  /** What the tapped stretch of the graph actually says, once asked for. */
  const [shown, setShown] = useState<Appearance[]>([]);
  const [scrubbing, setScrubbing] = useState(false);
  const latest = useRef<Entity | null>(null);
  latest.current = term;

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
      setTerm(found);
      if (!found) return;
      setChapters(await listChapters(found.book_id));
      setUses(await listPlaceVisits(found.id));
      setText(await getDocumentText(found.book_id));
      setBook(await getBook(found.book_id));
      setTimeline(timelineFor(await listMentions(found.book_id), found.id));
    });
  }, [id]);

  useFocusEffect(load);
  useWorkRefresh(load);

  if (!term) {
    return (
      <View style={[styles.centre, { backgroundColor: palette.bg }]}>
        <ActivityIndicator />
      </View>
    );
  }

  const chapterOf = (idx: number) =>
    chapters.find((entry) => entry.idx === idx)?.title.trim() || `${idx + 1}`;

  async function save(changes: Parameters<typeof updateEntity>[1]) {
    await updateEntity(term!.id, changes);
    load();
  }

  function confirmDelete() {
    Alert.alert(t('term.deleteConfirm'), undefined, [
      { text: t('settings.cancel'), style: 'cancel' },
      {
        text: t('settings.delete'),
        style: 'destructive',
        onPress: async () => {
          await deleteEntity(term!.id);
          router.back();
        },
      },
    ]);
  }

  const span = uses.length
    ? { first: uses[0].chapter_idx, last: uses[uses.length - 1].chapter_idx }
    : null;
  // An invented word has no article anywhere; a real one usually does.
  const real = book ? !kindOf(book.kind).fiction : false;

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      keyboardDismissMode="interactive"
    >
      <Stack.Screen options={{ title: term.name, headerBackTitle: ' ' }} />

      <Hero
        eyebrow={t('term.eyebrow')}
        facts={
          span ? (
            <>
              <Fact value={uses.length} label={t('units.chapterCount')} />
              <Fact value={t('units.chapterShort', { n: span.first + 1 })} label={t('term.firstUsed')} />
              <Fact value={t('units.chapterShort', { n: span.last + 1 })} label={t('term.lastUsed')} />
            </>
          ) : undefined
        }
      >
        <EditableLine
          value={term.name}
          placeholder={t('term.name')}
          onCommit={(value) => value.trim() && save({ name: value.trim() })}
          style={{ color: palette.text, fontSize: 26, fontWeight: '700', lineHeight: 32 }}
        />
        <EditableLine
          value={term.alias}
          placeholder={t('term.aliasPlaceholder')}
          onCommit={(value) => save({ alias: value.trim() || null })}
          style={{ color: palette.faint, fontSize: 14, marginTop: 2 }}
        />
        <EditableLine
          value={term.summary}
          placeholder={t('term.summaryPlaceholder')}
          onCommit={(value) => save({ summary: value.trim() || null })}
          style={{ color: palette.dim, fontSize: 15, lineHeight: 22, marginTop: space.sm }}
          multiline
          numberOfLines={8}
        />
        {real ? (
          <LinkLine
            value={term.wiki}
            placeholder={t('entity.wikiPlaceholder')}
            glyph="🔗"
            onCommit={(value) => save({ wiki: value.trim() || null })}
            onOpen={(value) => Linking.openURL(value)}
          />
        ) : null}
      </Hero>

      <Block title={t('term.uses')} count={uses.length || undefined}>
        {uses.length === 0 ? (
          <Empty text={t('term.noUses')} />
        ) : (
          uses.map((use) => (
            <Item
              key={`${use.chapter_idx}`}
              badge={<Badge n={use.chapter_idx + 1} tone="quiet" />}
              title={chapterOf(use.chapter_idx)}
              detail={use.note ?? undefined}
              onPress={() => router.push(`/reader/${term.book_id}?chapter=${use.chapter_idx}`)}
            />
          ))
        )}
      </Block>

      <AppearanceGraph
        title={t('term.timeline')}
        fetchedNote={book?.text_source ? t('place.timelineFetched') : null}
        timeline={timeline}
        chapters={chapters}
        onPick={(range, dragging) => {
          setScrubbing(dragging);
          if (!range) return setShown([]);
          setShown(appearancesIn(text, chapters, namesOf(term), range));
        }}
      >
        {shown.length > 0 && (
          <View style={{ marginTop: space.md, gap: space.sm }}>
            {shown.slice(0, scrubbing ? 1 : 6).map((appearance) => (
              <Pressable
                key={appearance.offset}
                onPress={() => router.push(`/reader/${term.book_id}?at=${appearance.offset}`)}
                style={({ pressed }) => [
                  styles.quote,
                  { borderColor: palette.border, opacity: pressed ? 0.6 : 1 },
                ]}
              >
                <Text style={{ color: palette.faint, fontSize: 11 }}>
                  {chapterLabel(chapters, appearance.chapterIdx)}
                </Text>
                <Text numberOfLines={2} style={{ color: palette.text, fontSize: 13, lineHeight: 19 }}>
                  {appearance.quote}
                </Text>
              </Pressable>
            ))}
            {!scrubbing && (
              <Text style={{ color: palette.faint, fontSize: 12 }}>{t('entity.tapToRead')}</Text>
            )}
          </View>
        )}
      </AppearanceGraph>

      <Renderings
        bookId={term.book_id}
        entityId={term.id}
        name={term.name}
      />

      <FieldsSection
        title={t('term.fields')}
        fields={parseFields(term.fields)}
        onChange={(next: CustomField[]) => save({ fields: JSON.stringify(next) })}
      />

      <Hint>{t('term.hint')}</Hint>

      <Section>
        <Row label={t('settings.delete')} onPress={confirmDelete} danger last />
      </Section>
    </ScrollView>
  );
}

/** Nothing typed and nothing extracted — there is no term here. */
function isBlank(entity: Entity): boolean {
  return (
    !entity.name.trim() &&
    !entity.alias &&
    !entity.summary &&
    parseFields(entity.fields).filter((field) => field.label.trim() || field.value.trim()).length === 0
  );
}

const styles = StyleSheet.create({
  quote: { borderLeftWidth: 2, paddingLeft: space.md, paddingVertical: 2, gap: 2 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
