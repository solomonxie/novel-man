import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from '../../../src/navigation/router';
import { useTranslation } from 'react-i18next';
import Clipboard from '@react-native-clipboard/clipboard';

import {
  getBook,
  listAnnotations,
  listChapters,
  removeAnnotation,
  removeAnnotations,
  updateAnnotation,
  type Annotation,
  type Book,
  type Chapter,
} from '../../../src/db/repo';
import { shareQuoteText } from '../../../src/share/quote';
import { NoteSheet } from '../../../src/ui/NoteSheet';
import { radius, space, usePalette } from '../../../src/theme';

type Filter = 'all' | 'highlight' | 'note' | 'bookmark';

export default function Notes() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const palette = usePalette();
  const [annotations, setAnnotations] = useState<Annotation[] | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [book, setBook] = useState<Book | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  /**
   * Clearing out a read's worth of marks one long-press at a time is the
   * tedious way; the mode exists so a batch is one decision, not twenty.
   */
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  /** Tapping a mark opens what you wrote on it; the book is a button away. */
  const [editing, setEditing] = useState<Annotation | null>(null);

  const load = useCallback(() => {
    if (!id) return;
    listAnnotations(id).then(setAnnotations);
    listChapters(id).then(setChapters);
    getBook(id).then(setBook);
  }, [id]);

  useFocusEffect(load);

  function openInBook(entry: Annotation, chapter: Chapter | null) {
    router.push(
      entry.chapter_id
        ? `/reader/${id}?chapter=${chapter?.idx ?? 0}`
        : `/reader/${id}?chapter=${chapter?.idx ?? 0}&at=${entry.start}`
    );
  }

  function toggle(id: string) {
    setPicked((was) => {
      const next = new Set(was);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function endSelecting() {
    setSelecting(false);
    setPicked(new Set());
  }

  function confirmRemovePicked() {
    const ids = [...picked];
    if (!ids.length) return;
    Alert.alert(t('notes.deleteSelectedConfirm', { count: ids.length }), undefined, [
      { text: t('settings.cancel'), style: 'cancel' },
      {
        text: t('settings.delete'),
        style: 'destructive',
        onPress: async () => {
          await removeAnnotations(ids);
          endSelecting();
          load();
        },
      },
    ]);
  }

  // Grouped by chapter in reading order — not by date. You look for a note
  // where it happened in the story, not when you made it.
  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matching = (annotations ?? []).filter((entry) => {
      if (filter !== 'all' && entry.kind !== filter) return false;
      if (!needle) return true;
      return `${entry.quote} ${entry.note ?? ''}`.toLowerCase().includes(needle);
    });
    const byChapter = new Map<string, { chapter: Chapter | null; items: Annotation[] }>();
    for (const entry of matching) {
      const chapter =
        (entry.chapter_id
          ? chapters.find((c) => c.id === entry.chapter_id)
          : chapters.find((c) => entry.start >= c.start && entry.start < c.end)) ?? null;
      const key = chapter?.id ?? 'none';
      if (!byChapter.has(key)) byChapter.set(key, { chapter, items: [] });
      byChapter.get(key)!.items.push(entry);
    }
    return [...byChapter.values()].sort(
      (a, b) => (a.chapter?.idx ?? -1) - (b.chapter?.idx ?? -1)
    );
  }, [annotations, chapters, query, filter]);

  const total = annotations?.length ?? 0;

  function confirmRemove(entry: Annotation) {
    Alert.alert(t('notes.deleteConfirm'), undefined, [
      { text: t('settings.cancel'), style: 'cancel' },
      {
        text: t('settings.delete'),
        style: 'destructive',
        onPress: async () => {
          await removeAnnotation(entry.id);
          load();
        },
      },
    ]);
  }

  if (annotations === null) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.bg }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 3 }}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen
        options={{
          title: selecting ? t('notes.selected', { count: picked.size }) : t('book.notes'),
          headerRight: () =>
            total === 0 ? null : (
              <Pressable onPress={() => (selecting ? endSelecting() : setSelecting(true))} hitSlop={8}>
                <Text style={{ color: palette.accent, fontSize: 16 }}>
                  {selecting ? t('notes.selectDone') : t('notes.select')}
                </Text>
              </Pressable>
            ),
        }}
      />

      {total === 0 ? (
        <Text style={{ color: palette.dim, textAlign: 'center', marginTop: space.xxl }}>
          {t('notes.empty')}
        </Text>
      ) : (
        <>
          <View style={[styles.search, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <Text style={{ color: palette.faint }}>🔍</Text>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t('notes.search')}
              placeholderTextColor={palette.faint}
              style={{ flex: 1, color: palette.text, fontSize: 16 }}
            />
          </View>

          <View style={styles.filters}>
            {(['all', 'highlight', 'note', 'bookmark'] as Filter[]).map((option) => (
              <Pressable
                key={option}
                onPress={() => setFilter(option)}
                style={[
                  styles.chip,
                  {
                    borderColor: option === filter ? palette.accent : palette.border,
                    backgroundColor: option === filter ? palette.accent : palette.surface,
                  },
                ]}
              >
                <Text style={{ color: option === filter ? palette.onAccent : palette.text, fontSize: 13 }}>
                  {t(`notes.filter_${option}`)}
                </Text>
              </Pressable>
            ))}
          </View>

          {selecting && picked.size === 0 ? (
            <Text style={{ color: palette.dim, fontSize: 13, marginTop: space.md }}>
              {t('notes.selectHint')}
            </Text>
          ) : null}

          {groups.map(({ chapter, items }) => (
            <View key={chapter?.id ?? 'none'} style={{ marginTop: space.xl }}>
              <Text style={{ color: palette.text, fontSize: 15, fontWeight: '700' }}>
                {chapter ? chapter.title.trim() || `${chapter.idx + 1}` : t('notes.unplaced')}
              </Text>
              {items.map((entry) => (
                <Pressable
                  key={entry.id}
                  onPress={() => (selecting ? toggle(entry.id) : setEditing(entry))}
                  // The long-press that deleted one is now the way into picking
                  // several — with the one pressed already picked.
                  onLongPress={() => {
                    if (selecting) return confirmRemove(entry);
                    setSelecting(true);
                    toggle(entry.id);
                  }}
                  style={[
                    styles.card,
                    {
                      backgroundColor: palette.surface,
                      borderColor: picked.has(entry.id) ? palette.accent : palette.border,
                    },
                    picked.has(entry.id) && styles.cardPicked,
                  ]}
                >
                  <View style={{ flexDirection: 'row', gap: space.sm }}>
                    {selecting ? (
                      <View
                        style={[
                          styles.check,
                          { borderColor: picked.has(entry.id) ? palette.accent : palette.border },
                          picked.has(entry.id) && { backgroundColor: palette.accent },
                        ]}
                      >
                        {picked.has(entry.id) ? (
                          <Text style={{ color: palette.onAccent, fontSize: 12, lineHeight: 14 }}>✓</Text>
                        ) : null}
                      </View>
                    ) : null}
                    <View style={{ width: 3, borderRadius: 2, backgroundColor: entry.color ?? palette.accent }} />
                    <View style={{ flex: 1, gap: space.sm }}>
                      {entry.note ? (
                        <Text style={{ color: palette.dim, fontSize: 14 }}>{entry.note}</Text>
                      ) : null}
                      <Text style={{ color: palette.text, fontSize: 15 }}>{entry.quote}</Text>
                    </View>
                  </View>
                  <View style={styles.cardFoot}>
                    <Text style={{ color: palette.faint, fontSize: 11 }}>
                      {new Date(entry.created_at).toLocaleDateString()}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: space.lg }}>
                      {selecting ? null : (
                        <>
                      <Pressable onPress={() => Clipboard.setString(entry.quote)} hitSlop={8}>
                        <Text style={{ color: palette.accent, fontSize: 12 }}>{t('reader.copy')}</Text>
                      </Pressable>
                      <Pressable onPress={() => confirmRemove(entry)} hitSlop={8}>
                        <Text style={{ color: palette.danger, fontSize: 12 }}>
                          {t('settings.delete')}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() =>
                          shareQuoteText({
                            text: entry.quote,
                            title: book?.title ?? '',
                            author: book?.author,
                            chapter: chapter?.title.trim() || null,
                            note: entry.note,
                          })
                        }
                        hitSlop={8}
                      >
                        <Text style={{ color: palette.accent, fontSize: 12 }}>{t('reader.share')}</Text>
                      </Pressable>
                      {/* The jump the card itself used to be: still here, but
                          it has to be asked for now. */}
                      <Pressable onPress={() => openInBook(entry, chapter)} hitSlop={8}>
                        <Text style={{ color: palette.accent, fontSize: 12 }}>
                          {t('notes.inBook')}  ›
                        </Text>
                      </Pressable>
                        </>
                      )}
                    </View>
                  </View>
                </Pressable>
              ))}
            </View>
          ))}

          {groups.length === 0 && (
            <Text style={{ color: palette.dim, textAlign: 'center', marginTop: space.xxl }}>
              {t('notes.noMatches')}
            </Text>
          )}
        </>
      )}
    </ScrollView>

      {/* Only once something is picked: a delete button over an empty
          selection is a button that can only disappoint. */}
      {selecting && picked.size > 0 ? (
        <View style={[styles.bar, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Pressable onPress={confirmRemovePicked} style={styles.barButton}>
            <Text style={{ color: palette.danger, fontSize: 16, fontWeight: '600' }}>
              {t('notes.deleteSelected', { count: picked.size })}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {/* A bookmark stays a bookmark; for the rest, what you write is what
          decides whether it is a note or just a highlight. */}
      <NoteSheet
        visible={editing !== null}
        quote={editing?.quote ?? ''}
        note={editing?.note ?? null}
        onSave={(note) => {
          const mark = editing;
          setEditing(null);
          if (!mark) return;
          void updateAnnotation(mark.id, {
            note: note || null,
            kind: mark.kind === 'bookmark' ? 'bookmark' : note ? 'note' : 'highlight',
          }).then(load);
        }}
        onClose={() => setEditing(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  filters: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: space.xs + 2,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  card: {
    marginTop: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  cardPicked: { borderWidth: 1 },
  check: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingBottom: space.xl,
  },
  barButton: { paddingVertical: space.md, alignItems: 'center' },
  cardFoot: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: space.sm,
  },
});
