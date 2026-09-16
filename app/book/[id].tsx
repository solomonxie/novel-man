import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import {
  countEntities,
  createEntity,
  deleteBook,
  getBook,
  getProgress,
  listAnnotations,
  listChapters,
  listEntities,
  updateBook,
  type Book,
  type Chapter,
  type Entity,
  type EntityKind,
} from '../../src/db/repo';
import { Cover, PrimaryAction, Row, Section } from '../../src/ui/primitives';
import { pickImage } from '../../src/ui/fields';
import { InlineText } from '../../src/ui/inline';
import { formatCount, formatDuration, readingMinutes } from '../../src/text/counts';
import { space, usePalette } from '../../src/theme';

export default function BookPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const palette = usePalette();
  const [book, setBook] = useState<Book | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [characters, setCharacters] = useState<Entity[]>([]);
  const [places, setPlaces] = useState<Entity[]>([]);
  const [offset, setOffset] = useState(0);
  const [noteCount, setNoteCount] = useState(0);
  const [jumpOpen, setJumpOpen] = useState(false);

  const load = useCallback(() => {
    if (!id) return;
    getBook(id).then(setBook);
    listChapters(id).then(setChapters);
    listEntities(id, 'character').then(setCharacters);
    listEntities(id, 'place').then(setPlaces);
    getProgress(id).then(setOffset);
    listAnnotations(id).then((rows) => setNoteCount(rows.length));
  }, [id]);

  useFocusEffect(load);

  if (!book) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.bg }}>
        <ActivityIndicator />
      </View>
    );
  }

  const current = chapters.find((chapter) => offset >= chapter.start && offset < chapter.end);
  const minutes = readingMinutes(book.word_count, book.language);

  async function edit(field: 'title' | 'author' | 'year' | 'edition', value: string) {
    await updateBook(book!.id, { [field]: value.trim() || null });
    load();
  }

  async function pickCover() {
    const uri = await pickImage();
    if (!uri) return;
    await updateBook(book!.id, { cover_path: uri });
    load();
  }

  async function addEntity(kind: EntityKind) {
    const name = kind === 'character' ? t('entity.newCharacter') : t('entity.newPlace');
    const entityId = await createEntity(book!.id, kind, name);
    router.push(`/entity/${entityId}`);
  }

  function confirmDelete() {
    Alert.alert(t('book.delete'), t('book.deleteConfirm'), [
      { text: t('settings.cancel'), style: 'cancel' },
      {
        text: t('book.delete'),
        style: 'destructive',
        onPress: async () => {
          await deleteBook(book!.id);
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
      <Stack.Screen options={{ title: book.title, headerBackTitle: ' ' }} />

      <View style={{ flexDirection: 'row', gap: space.lg }}>
        <Pressable onPress={pickCover}>
          <Cover title={book.title} hue={book.cover_hue} width={104} path={book.cover_path} />
          <View style={[styles.coverBadge, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <Text style={{ fontSize: 11 }}>✎</Text>
          </View>
        </Pressable>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <InlineText
            value={book.title}
            placeholder={t('book.title')}
            onCommit={(value) => edit('title', value)}
            style={{ color: palette.text, fontSize: 21, fontWeight: '700' }}
            multiline
          />
          <InlineText
            value={book.author}
            placeholder={t('book.author')}
            onCommit={(value) => edit('author', value)}
            style={{ color: palette.dim, fontSize: 15, marginTop: 2 }}
          />
          <View style={{ flexDirection: 'row', gap: space.lg, marginTop: 2 }}>
            <InlineText
              value={book.year}
              placeholder={t('book.year')}
              onCommit={(value) => edit('year', value)}
              style={{ color: palette.dim, fontSize: 14 }}
            />
            <InlineText
              value={book.edition}
              placeholder={t('book.edition')}
              onCommit={(value) => edit('edition', value)}
              style={{ color: palette.dim, fontSize: 14 }}
            />
          </View>
          <Text style={{ color: palette.dim, fontSize: 13, marginTop: space.sm }}>
            {formatCount(book.word_count, book.language)} · {chapters.length} · {formatDuration(minutes)}
          </Text>
          <Text style={{ color: palette.faint, fontSize: 12, marginTop: 2 }}>
            {t('book.importedFrom', { name: book.source_name })}
          </Text>
        </View>
      </View>

      <PrimaryAction
        label={current ? t('book.continue', { chapter: label(current, t) }) : t('book.start')}
        onPress={() => router.push(`/reader/${book.id}`)}
        style={{ marginTop: space.lg }}
      />

      <Section title={t('book.chapters')}>
        {chapters.length === 0 ? (
          <Row label={t('book.noChapters')} last />
        ) : (
          <Row
            label={t('book.jumpTo')}
            value={`${chapters.length}  ›`}
            onPress={() => setJumpOpen(true)}
            last
          />
        )}
      </Section>

      <Section title={t('book.notes')}>
        <Row
          label={t('book.notesRow')}
          value={`${noteCount}  ›`}
          onPress={() => router.push(`/book/${book.id}/notes`)}
          last
        />
      </Section>

      <EntitySection
        title={t('book.characters')}
        entities={characters}
        onAdd={() => addEntity('character')}
      />
      <EntitySection title={t('book.places')} entities={places} onAdd={() => addEntity('place')} />

      <Section title={t('book.sections')}>
        <Row label={t('book.arcs')} value={t('book.comingSoon')} />
        <Row label={t('book.translations')} value={t('book.comingSoon')} />
        <Row label={t('book.illustrations')} value={t('book.comingSoon')} />
        <Row label={t('book.animations')} value={t('book.comingSoon')} last />
      </Section>

      <Section>
        <Row label={t('book.delete')} onPress={confirmDelete} danger last />
      </Section>

      <ChapterJump
        visible={jumpOpen}
        chapters={chapters}
        currentId={current?.id}
        onClose={() => setJumpOpen(false)}
        onPick={(chapter) => {
          setJumpOpen(false);
          router.push(`/reader/${book.id}?chapter=${chapter.idx}`);
        }}
      />
    </ScrollView>
  );
}

function EntitySection({ title, entities, onAdd }: {
  title: string;
  entities: Entity[];
  onAdd: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Section title={title} action={{ label: '＋', onPress: onAdd }}>
      {entities.length === 0 ? (
        <Row label={t('book.none')} last />
      ) : (
        entities.map((entity, index) => (
          <Row
            key={entity.id}
            label={entity.name}
            value={entity.alias ?? '›'}
            onPress={() => router.push(`/entity/${entity.id}`)}
            last={index === entities.length - 1}
          />
        ))
      )}
    </Section>
  );
}

/** A 500-chapter list is a picker, not a page section. */
function ChapterJump({ visible, chapters, currentId, onClose, onPick }: {
  visible: boolean;
  chapters: Chapter[];
  currentId?: string;
  onClose: () => void;
  onPick: (chapter: Chapter) => void;
}) {
  const { t } = useTranslation();
  const palette = usePalette();
  const [query, setQuery] = useState('');
  const shown = query.trim()
    ? chapters.filter((chapter) =>
        `${chapter.idx + 1} ${chapter.title}`.toLowerCase().includes(query.trim().toLowerCase())
      )
    : chapters;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: palette.bg }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: space.lg }}>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={{ color: palette.accent, fontSize: 16 }}>{t('settings.cancel')}</Text>
          </Pressable>
          <Text style={{ color: palette.text, fontSize: 16, fontWeight: '600' }}>{t('book.jumpTo')}</Text>
          <View style={{ width: 50 }} />
        </View>
        <ScrollView>
          {shown.map((chapter) => (
            <Pressable
              key={chapter.id}
              onPress={() => onPick(chapter)}
              style={{ paddingHorizontal: space.xl, paddingVertical: space.md }}
            >
              <Text
                numberOfLines={1}
                style={{ color: chapter.id === currentId ? palette.accent : palette.text, fontSize: 15 }}
              >
                {chapter.idx + 1}  {chapter.title.trim() || '—'}
                {chapter.confident ? '' : '  ⚠'}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function label(chapter: Chapter, t: (key: string) => string): string {
  return chapter.title.trim() || `${chapter.idx + 1}`;
}

const styles = StyleSheet.create({
  coverBadge: {
    position: 'absolute',
    right: -6,
    bottom: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
