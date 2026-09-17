import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as Clipboard from 'expo-clipboard';

import {
  getBook,
  listAnnotations,
  listChapters,
  removeAnnotation,
  type Annotation,
  type Book,
  type Chapter,
} from '../../../src/db/repo';
import { shareQuoteText } from '../../../src/share/quote';
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

  const load = useCallback(() => {
    if (!id) return;
    listAnnotations(id).then(setAnnotations);
    listChapters(id).then(setChapters);
    getBook(id).then(setBook);
  }, [id]);

  useFocusEffect(load);

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
      const chapter = chapters.find((c) => entry.start >= c.start && entry.start < c.end) ?? null;
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
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen options={{ title: t('book.notes') }} />

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

          {groups.map(({ chapter, items }) => (
            <View key={chapter?.id ?? 'none'} style={{ marginTop: space.xl }}>
              <Text style={{ color: palette.text, fontSize: 15, fontWeight: '700' }}>
                {chapter ? chapter.title.trim() || `${chapter.idx + 1}` : t('notes.unplaced')}
              </Text>
              {items.map((entry) => (
                <Pressable
                  key={entry.id}
                  onPress={() =>
                    router.push(`/reader/${id}?chapter=${chapter?.idx ?? 0}&at=${entry.start}`)
                  }
                  onLongPress={() => confirmRemove(entry)}
                  style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}
                >
                  <View style={{ flexDirection: 'row', gap: space.sm }}>
                    <View style={{ width: 3, borderRadius: 2, backgroundColor: entry.color ?? palette.accent }} />
                    <Text style={{ color: palette.text, fontSize: 15, flex: 1 }}>{entry.quote}</Text>
                  </View>
                  {entry.note ? (
                    <Text style={{ color: palette.dim, fontSize: 14, marginTop: space.sm }}>{entry.note}</Text>
                  ) : null}
                  <View style={styles.cardFoot}>
                    <Text style={{ color: palette.faint, fontSize: 11 }}>
                      {new Date(entry.created_at).toLocaleDateString()}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: space.lg }}>
                      <Pressable onPress={() => Clipboard.setStringAsync(entry.quote)} hitSlop={8}>
                        <Text style={{ color: palette.accent, fontSize: 12 }}>{t('reader.copy')}</Text>
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
  cardFoot: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: space.sm,
  },
});
