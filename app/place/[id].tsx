import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from '../../src/navigation/router';
import { useTranslation } from 'react-i18next';

import {
  deleteEntity,
  getDocumentText,
  getBook,
  getEntity,
  listChapters,
  listMentions,
  listPlaceCompany,
  listPlaceVisits,
  listScenesAtPlace,
  listUnlocatedPlaces,
  parseFields,
  updateEntity,
  type Book,
  type Chapter,
  type CustomField,
  type Entity,
  type PlaceCompany,
  type PlaceVisit,
  type Scene,
} from '../../src/db/repo';
import { AiRunSheet } from '../../src/ui/AiRunSheet';
import { queuePlaceLocate, queuePlacePolish } from '../../src/analysis/runs';
import { appearancesIn, namesOf, timelineFor, type Appearance } from '../../src/cast/mentions';
import { mapUrl } from '../../src/cast/location';
import { kindOf, supports } from '../../src/books/kinds';
import { AppearanceGraph, chapterLabel, type Range } from '../../src/ui/AppearanceGraph';
import { sceneOpening } from '../../src/structure/scenes';
import { hasAnyKey } from '../../src/ai/keys';
import { useWorkRefresh } from '../../src/work/refresh';
import { hueFrom } from '../../src/ui/fields';
import { EditableLine } from '../../src/ui/EditableLine';
import { FieldsSection } from '../../src/ui/FieldsSection';
import { Action, Badge, Block, Chip, ChipRow, Empty, Fact, Hero, Item, LinkLine } from '../../src/ui/detail';
import { Hint, Row, Section } from '../../src/ui/primitives';
import { space, usePalette } from '../../src/theme';

/**
 * One request places every place in the book, so a book only has to ask once —
 * the second place page opened already has its answer, and the third costs
 * nothing. Module-level because it is a fact about the book, not about which
 * page happens to be mounted.
 */
const asked = new Set<string>();

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
  const [book, setBook] = useState<Book | null>(null);
  const [timeline, setTimeline] = useState<{ chapter_idx: number; count: number }[]>([]);
  /** What the tapped stretch of the graph actually says, once asked for. */
  const [shown, setShown] = useState<Appearance[]>([]);
  const [scrubbing, setScrubbing] = useState(false);
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
      const owner = await getBook(found.book_id);
      setBook(owner);
      setTimeline(timelineFor(await listMentions(found.book_id), found.id));
      // Nowhere on a real place is something to fix, not something to ask the
      // reader to type: the run fills this one and every other unplaced place.
      void locateAll(owner, found, (count) => t('place.locating', { count }));
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

  // Somewhere on a map, or nowhere: a novel's places are nowhere, and so are
  // the real ones nobody has agreed on the site of.
  // A novel's places are nowhere, so nothing on this page should ask where.
  const real = book ? !kindOf(book.kind).fiction : false;

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}
      keyboardShouldPersistTaps="handled"
      // A profile is edited in place and its fields are at the bottom of it,
      // which is exactly where the keyboard lands.
      automaticallyAdjustKeyboardInsets
      keyboardDismissMode="interactive"
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
        {real ? (
          <LinkLine
            value={place.located}
            placeholder={t('place.todayPlaceholder')}
            glyph="📍"
            onCommit={(value) => save({ located: value.trim() || null })}
            onOpen={(value) => Linking.openURL(mapUrl(value))}
          />
        ) : null}
      </Hero>

      {supports(book?.kind, 'scenes') ? (
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

      ) : null}

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

      <AppearanceGraph
        title={t('place.timeline')}
        fetchedNote={book?.text_source ? t('place.timelineFetched') : null}
        timeline={timeline}
        chapters={chapters}
        onPick={(range, dragging) => {
          setScrubbing(dragging);
          if (!range) return setShown([]);
          setShown(appearancesIn(text, chapters, namesOf(place), range));
        }}
      >
        {shown.length > 0 && (
          <View style={{ marginTop: space.md, gap: space.sm }}>
            {shown.slice(0, scrubbing ? 1 : 6).map((appearance) => (
              <Pressable
                key={appearance.offset}
                onPress={() => router.push(`/reader/${place.book_id}?at=${appearance.offset}`)}
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

async function locateAll(
  book: Book | null,
  place: Entity,
  label: (count: number) => string
) {
  if (!book || kindOf(book.kind).fiction || place.located || asked.has(book.id)) return;
  if (!(await hasAnyKey())) return;
  asked.add(book.id);
  const missing = await listUnlocatedPlaces(book.id);
  if (missing.length) {
    await queuePlaceLocate(book.id, label(missing.length), missing.map((entry) => entry.id));
  }
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
  quote: {
    borderLeftWidth: 2,
    paddingLeft: space.md,
    paddingVertical: 2,
    gap: 2,
  },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
