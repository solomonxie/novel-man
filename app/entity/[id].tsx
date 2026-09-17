import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import {
  addRelation,
  createEntity,
  deleteEntity,
  deleteRelation,
  getBook,
  getEntity,
  listChapters,
  listEntities,
  listMentions,
  listObservations,
  listRelationsFor,
  parseFields,
  updateCast,
  updateEntity,
  updateRelation,
  type Book,
  type Chapter,
  type CustomField,
  type Entity,
  type Observation,
  type RelationEdge,
} from '../../src/db/repo';
import { appearances, timelineFor } from '../../src/cast/mentions';
import { bucketize, Sparkline } from '../../src/ui/Sparkline';
import { AiRunSheet } from '../../src/ui/AiRunSheet';
import { ExportSheet } from '../../src/ui/ExportSheet';
import { queuePolish } from '../../src/analysis/runs';
import { hasAnyKey } from '../../src/ai/keys';
import { FieldsSection } from '../../src/ui/FieldsSection';
import { Row, Section } from '../../src/ui/primitives';
import { EditableRow, hueFrom, pickImage, Portrait } from '../../src/ui/fields';
import { Action, Badge, Block, Empty, Fact, Hero, Item, Writable } from '../../src/ui/detail';
import { EditableLine } from '../../src/ui/EditableLine';
import { adoptImage } from '../../src/storage/files';
import { radius, space, usePalette } from '../../src/theme';
import { useWorkRefresh } from '../../src/work/refresh';

/**
 * A character's attributes vary wildly by genre — cultivation level, house,
 * ship, species. A fixed schema would be wrong for most books, so beyond a
 * small core everything is user-defined label/value pairs.
 */
export default function EntityPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const palette = usePalette();
  const [entity, setEntity] = useState<Entity | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [timeline, setTimeline] = useState<{ chapter_idx: number; count: number }[]>([]);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [polishOpen, setPolishOpen] = useState(false);
  const [bar, setBar] = useState<number | null>(null);
  const [relations, setRelations] = useState<RelationEdge[]>([]);
  const [cast, setCast] = useState<Entity[]>([]);
  const [linking, setLinking] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [book, setBook] = useState<Book | null>(null);
  const [keyed, setKeyed] = useState(false);
  const latest = useRef<Entity | null>(null);
  latest.current = entity;

  /**
   * ＋ creates the row before you've typed anything, so leaving without typing
   * has to take it away again — otherwise every mistaken tap leaves a blank
   * profile behind for someone to find and delete later.
   */
  useEffect(
    () => () => {
      const leaving = latest.current;
      if (!leaving) return;
      if (isBlank(leaving)) {
        void deleteEntity(leaving.id);
        return;
      }
      const fields = parseFields(leaving.fields);
      const filled = filledFields(fields);
      if (filled.length !== fields.length) {
        void updateEntity(leaving.id, { fields: JSON.stringify(filled) });
      }
    },
    []
  );

  const load = useCallback(() => {
    if (!id) return;
    getEntity(id).then(async (found) => {
      setEntity(found);
      if (!found) return;
      setChapters(await listChapters(found.book_id));
      setTimeline(timelineFor(await listMentions(found.book_id), found.id));
      setObservations(await listObservations(found.id));
      setRelations(await listRelationsFor(found.id));
      setCast((await listEntities(found.book_id, 'character')).filter((row) => row.id !== found.id));
      setBook(await getBook(found.book_id));
    });
  }, [id]);

  useFocusEffect(load);
  // A pass that lands while this page is open has to show up on it.
  useWorkRefresh(load);

  useEffect(() => {
    hasAnyKey().then(setKeyed);
  }, []);

  if (!entity) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.bg }}>
        <ActivityIndicator />
      </View>
    );
  }

  const fields = parseFields(entity.fields);
  const span = appearances(timeline);
  const bars = bucketize(timeline, chapters.length);
  const picked = bars.find((entry) => entry.index === bar) ?? null;
  const perBar = bars.length ? bars[0].to - bars[0].from + 1 : 1;

  async function save(changes: Parameters<typeof updateEntity>[1]) {
    await updateEntity(entity!.id, changes);
    load();
  }

  async function saveCast(changes: Parameters<typeof updateCast>[1]) {
    await updateCast(entity!.id, changes);
    load();
  }

  // Stored as typed, blanks and all — filtering here is what used to make ＋
  // look broken, since the row it adds is empty by definition. The empties go
  // on the way out instead.
  async function saveFields(next: CustomField[]) {
    await save({ fields: JSON.stringify(next) });
  }

  function confirmDelete() {
    Alert.alert(t('entity.deleteConfirm'), undefined, [
      { text: t('settings.cancel'), style: 'cancel' },
      {
        text: t('settings.delete'),
        style: 'destructive',
        onPress: async () => {
          await deleteEntity(entity!.id);
          router.back();
        },
      },
    ]);
  }

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}
    >
      <Stack.Screen options={{ title: entity.name, headerBackTitle: ' ' }} />

      <Hero
        eyebrow={t(`entity.kind_${entity.kind}`)}
        avatar={
          <Portrait
            name={entity.name}
            path={entity.portrait_path}
            hue={hueFrom(entity.name)}
            size={72}
            onPick={(uri) => save({ portrait_path: adoptImage(uri, 'portrait') })}
          />
        }
        facts={
          span
            ? (
              <>
                <Fact value={timeline.length} label={t('units.unit_chapters')} />
                <Fact value={t('units.chapterShort', { n: span.first + 1 })} label={t('entity.firstSeen')} />
                <Fact value={t('units.chapterShort', { n: span.last + 1 })} label={t('entity.lastSeen')} />
              </>
            )
            : undefined
        }
        actions={
          <>
            {observations.length > 0 && entity.kind === 'character' ? (
              <Action label={t('entity.polish')} tone="loud" onPress={() => setPolishOpen(true)} />
            ) : null}
            <Action label={t('entity.export')} onPress={() => setExporting(true)} />
          </>
        }
      >
        <NameField
          value={entity.name}
          autoFocus={!entity.name}
          onCommit={(next) => next !== entity.name && save({ name: next })}
        />
        <EditableLine
          value={entity.alias}
          placeholder={t('entity.alias')}
          onCommit={(value) => save({ alias: value.trim() || null })}
          style={{ color: palette.faint, fontSize: 14, marginTop: 2 }}
        />
      </Hero>

      <View style={{ marginTop: space.lg }}>
        <Writable empty={!entity.summary?.trim()}>
          <EditableLine
            value={entity.summary}
            placeholder={t('entity.summaryPlaceholder')}
            onCommit={(value) => save({ summary: value.trim() || null })}
            style={{ color: palette.dim, fontSize: 15, lineHeight: 22 }}
            multiline
            numberOfLines={10}
          />
        </Writable>
      </View>

      {entity.kind === 'character' && (
        <Block title={t('entity.analysis')}>
          <Section flush>
          <EditableRow
            label={t('entity.role')}
            value={entity.role}
            onCommit={(value) => saveCast({ role: value.trim() || null })}
          />
          <EditableRow
            label={t('entity.age')}
            value={entity.age}
            onCommit={(value) => saveCast({ age: value.trim() || null })}
          />
          <EditableRow
            label={t('entity.gender')}
            value={entity.gender}
            onCommit={(value) => saveCast({ gender: value.trim() || null })}
          />
          <EditableRow
            label={t('entity.appearance')}
            value={entity.appearance}
            onCommit={(value) => saveCast({ appearance: value.trim() || null })}
            multiline
          />
          <EditableRow
            label={t('entity.voice')}
            value={entity.voice}
            onCommit={(value) => saveCast({ voice: value.trim() || null })}
            multiline
          />
          <EditableRow
            label={t('entity.arc')}
            value={entity.arc}
            onCommit={(value) => saveCast({ arc: value.trim() || null })}
            multiline
            last
          />
          </Section>
        </Block>
      )}

      {timeline.length > 0 && span ? (
        <Block title={t('entity.timeline')}>
          <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <Sparkline
              bars={bars}
              tint={palette.accent}
              dim={palette.faint}
              height={30}
              selected={bar}
              onSelect={(next) => setBar(next?.index ?? null)}
            />
            <Text style={{ color: palette.dim, fontSize: 13, marginTop: space.sm }}>
              {picked
                ? t('entity.barDetail', {
                    range:
                      picked.from === picked.to
                        ? chapterLabel(chapters, picked.from)
                        : `${chapterLabel(chapters, picked.from)} – ${chapterLabel(chapters, picked.to)}`,
                    count: picked.count,
                  })
                : t('entity.appears', {
                    first: chapterLabel(chapters, span.first),
                    last: chapterLabel(chapters, span.last),
                    count: timeline.length,
                  })}
            </Text>
            {perBar > 1 && !picked && (
              <Text style={{ color: palette.faint, fontSize: 12, marginTop: 2 }}>
                {t('entity.barScale', { count: perBar })}
              </Text>
            )}
          </View>
        </Block>
      ) : null}

      {observations.length > 0 && (
        <Block title={t('entity.perChapter')} count={observations.length}>
          {observations.map((observation) => (
            <Item
              key={observation.id}
              badge={<Badge n={observation.chapter_idx + 1} tone="quiet" />}
              title={chapterLabel(chapters, observation.chapter_idx)}
              detail={
                [observation.appearance, observation.voice, observation.note]
                  .filter(Boolean)
                  .join(' · ') || undefined
              }
            />
          ))}
        </Block>
      )}

      {entity.kind === 'character' && (
        <Block
          title={t('entity.relations')}
          count={relations.length || undefined}
          action={{ label: '＋', onPress: () => setLinking(true) }}
        >
          {relations.length === 0 ? (
            <Empty
              text={t('entity.noRelations')}
              action={{ label: t('entity.addRelation'), onPress: () => setLinking(true) }}
            />
          ) : (
            <Section flush>
              {relations.map((relation, index) => (
                <RelationRow
                  key={relation.id}
                  relation={relation}
                  last={index === relations.length - 1}
                  onOpen={() => router.push(`/entity/${relation.other_id}`)}
                  onLabel={(label) => updateRelation(relation.id, { label }).then(load)}
                  onRemove={() => deleteRelation(relation.id).then(load)}
                />
              ))}
            </Section>
          )}
          <Row
            label={t('entity.openGraph')}
            value="›"
            onPress={() => router.push(`/book/${entity.book_id}/graph`)}
            last
          />
        </Block>
      )}

      <FieldsSection
        title={t('entity.fields')}
        fields={fields}
        onChange={saveFields}
      />

      <Section>
        <Row label={t('settings.delete')} onPress={confirmDelete} danger last />
      </Section>

      <AiRunSheet
        visible={polishOpen}
        title={t('entity.polish')}
        description={t('entity.polishWhat', { count: observations.length })}
        estimate={null}
        hasKey={keyed}
        onRun={async () => {
          await queuePolish(entity!.book_id, entity!.id, entity!.name);
          return t('work.queued', { count: 1 });
        }}
        onClose={() => setPolishOpen(false)}
      />

      <ExportSheet
        visible={exporting}
        input={
          book
            ? {
                book,
                text: '',
                chapters,
                annotations: [],
                profile: { entity, observations, relations },
              }
            : null
        }
        onClose={() => setExporting(false)}
      />

      <LinkSheet
        visible={linking}
        cast={cast}
        onClose={() => setLinking(false)}
        onPick={async (name) => {
          const existing = cast.find((row) => row.name === name);
          const otherId = existing?.id ?? (await createEntity(entity!.book_id, 'character', name));
          await addRelation({
            book_id: entity!.book_id,
            from_id: entity!.id,
            to_id: otherId,
            label: '',
          });
          setLinking(false);
          load();
        }}
      />
    </ScrollView>
  );
}

function NameField({ value, autoFocus, onCommit }: {
  value: string;
  autoFocus?: boolean;
  onCommit: (next: string) => void;
}) {
  const { t } = useTranslation();
  const palette = usePalette();
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <TextInput
      value={draft}
      onChangeText={setDraft}
      onBlur={() => onCommit(draft.trim())}
      autoFocus={autoFocus}
      placeholder={t('entity.namePlaceholder')}
      placeholderTextColor={palette.faint}
      style={[styles.name, { color: palette.text }]}
    />
  );
}

/**
 * A relation reads from this person outwards, so the row leads with who the
 * other one is and treats the label as the editable part. Editing the label
 * makes the relation the reader's, so a re-extraction stops overwriting it.
 */
function RelationRow({ relation, last, onOpen, onLabel, onRemove }: {
  relation: RelationEdge;
  last?: boolean;
  onOpen: () => void;
  onLabel: (label: string) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const palette = usePalette();
  const [label, setLabel] = useState(relation.label);
  useEffect(() => setLabel(relation.label), [relation.label]);
  return (
    <View
      style={[
        styles.fieldRow,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: palette.border },
      ]}
    >
      <Pressable onPress={onOpen} hitSlop={6} style={{ width: 96 }}>
        <Text numberOfLines={1} style={{ color: palette.accent, fontSize: 15 }}>
          {relation.other_name || t('entity.namePlaceholder')}
        </Text>
        {relation.source === 'ai' && (
          <Text style={{ color: palette.faint, fontSize: 11 }}>{t('entity.byAi')}</Text>
        )}
      </Pressable>
      <TextInput
        value={label}
        onChangeText={setLabel}
        onBlur={() => label !== relation.label && onLabel(label)}
        placeholder={t('entity.relationLabel')}
        placeholderTextColor={palette.faint}
        style={{ color: palette.text, fontSize: 16, flex: 1 }}
      />
      <Pressable onPress={onOpen} hitSlop={8}>
        <Text style={{ color: palette.dim, fontSize: 16 }}>›</Text>
      </Pressable>
      <Pressable onPress={onRemove} hitSlop={8}>
        <Text style={{ color: palette.faint, fontSize: 16 }}>✕</Text>
      </Pressable>
    </View>
  );
}

/** Someone already in the book, or a name that isn't there yet — one field for both. */
function LinkSheet({ visible, cast, onClose, onPick }: {
  visible: boolean;
  cast: Entity[];
  onClose: () => void;
  onPick: (name: string) => void;
}) {
  const { t } = useTranslation();
  const palette = usePalette();
  const [query, setQuery] = useState('');
  useEffect(() => { if (visible) setQuery(''); }, [visible]);

  const typed = query.trim();
  const matches = typed
    ? cast.filter((row) => row.name.includes(typed) || (row.alias ?? '').includes(typed))
    : cast;
  const isNew = typed.length > 0 && !cast.some((row) => row.name === typed);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={[styles.scrim, { backgroundColor: palette.scrim }]} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: palette.surface, borderColor: palette.border }]}
          onPress={(event) => event.stopPropagation()}
        >
          <Text style={{ color: palette.text, fontSize: 15, fontWeight: '600' }}>
            {t('entity.addRelation')}
          </Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('entity.relationSearch')}
            placeholderTextColor={palette.faint}
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.search, { color: palette.text, borderColor: palette.border }]}
          />
          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 280 }}>
            {isNew && (
              <Pressable onPress={() => onPick(typed)} style={styles.pick}>
                <Text style={{ color: palette.accent, fontSize: 16 }}>
                  {t('entity.relationCreate', { name: typed })}
                </Text>
              </Pressable>
            )}
            {matches.map((row) => (
              <Pressable key={row.id} onPress={() => onPick(row.name)} style={styles.pick}>
                <Text style={{ color: palette.text, fontSize: 16 }}>{row.name}</Text>
                {row.role ? (
                  <Text style={{ color: palette.dim, fontSize: 12 }}>{row.role}</Text>
                ) : null}
              </Pressable>
            ))}
            {!matches.length && !isNew && (
              <Text style={{ color: palette.dim, fontSize: 14, padding: space.md }}>
                {t('entity.relationEmpty')}
              </Text>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.lg,
  },
  name: { fontSize: 24, fontWeight: '700', padding: 0 },
  scrim: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: space.lg,
    paddingBottom: space.xxl,
  },
  search: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    fontSize: 16,
    marginTop: space.md,
  },
  pick: { paddingVertical: space.md },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
});

function chapterLabel(chapters: Chapter[], idx: number): string {
  const chapter = chapters.find((entry) => entry.idx === idx);
  return chapter?.title.trim() || `${idx + 1}`;
}

/** Nothing typed, nothing picked, nothing extracted — there is no profile here. */
function isBlank(entity: Entity): boolean {
  return (
    !entity.name.trim() &&
    !entity.alias &&
    !entity.summary &&
    !entity.portrait_path &&
    !entity.role &&
    !entity.appearance &&
    !entity.voice &&
    !entity.arc &&
    filledFields(parseFields(entity.fields)).length === 0
  );
}

function filledFields(fields: CustomField[]): CustomField[] {
  return fields.filter((field) => field.label.trim() || field.value.trim());
}
