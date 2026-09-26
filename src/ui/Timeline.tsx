import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '../navigation/router';

import {
  addEvent,
  dayOf,
  deleteEvent,
  editEvent,
  fromDay,
  listEvents,
  type ReadingEvent,
} from '../db/timeline';
import { Block } from './detail';
import { Row } from './primitives';
import { radius, space, usePalette } from '../theme';

/**
 * When this book was read, as a short list of moments.
 *
 * Most of it writes itself — a status changing, a chapter marked done, the
 * dates a Goodreads import brought over — but every row can be moved or
 * removed, because a reading history is mostly older than the app and nobody's
 * memory of it is a timestamp. Adding one by hand is the same form as editing
 * one, which is why there is only one form.
 */
export function Timeline({ bookId, reload }: { bookId: string; reload?: number }) {
  const { t, i18n } = useTranslation();
  const palette = usePalette();
  const [events, setEvents] = useState<ReadingEvent[]>([]);
  /** The row being edited, `new` while one is being written. */
  const [editing, setEditing] = useState<string | null>(null);
  const [day, setDay] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(() => {
    listEvents(bookId).then(setEvents).catch(() => undefined);
  }, [bookId, reload]);

  useFocusEffect(load);

  function open(event: ReadingEvent | null) {
    setEditing(event?.id ?? 'new');
    setDay(dayOf(event?.at ?? Date.now()));
    setNote(event?.note ?? '');
  }

  async function save() {
    const at = fromDay(day, editing === 'new' ? Date.now() : 0);
    if (at === null) {
      Alert.alert(t('timeline.badDay'), t('timeline.badDayHint'));
      return;
    }
    if (editing === 'new') {
      if (!note.trim()) return;
      await addEvent({ bookId, kind: 'note', at, note: note.trim(), source: 'manual' });
    } else if (editing) {
      await editEvent(editing, { at, note: note.trim() || null });
    }
    setEditing(null);
    load();
  }

  function remove(event: ReadingEvent) {
    Alert.alert(labelOf(event, t), t('timeline.removeWhat'), [
      { text: t('settings.cancel'), style: 'cancel' },
      {
        text: t('settings.delete'),
        style: 'destructive',
        onPress: () => void deleteEvent(event.id).then(load),
      },
    ]);
  }

  return (
    <Block title={t('timeline.title')}>
      {events.length === 0 && editing === null ? (
        <Text style={{ color: palette.dim, fontSize: 14, paddingHorizontal: space.xs }}>
          {t('timeline.empty')}
        </Text>
      ) : null}

      {events.map((event) => (
        <View key={event.id}>
          <Row
            label={labelOf(event, t)}
            detail={event.kind === 'note' ? undefined : event.note ?? undefined}
            value={new Date(event.at).toLocaleDateString(i18n.language)}
            onPress={() => (editing === event.id ? setEditing(null) : open(event))}
            onLongPress={() => remove(event)}
            last={editing === event.id}
          />
          {editing === event.id ? form() : null}
        </View>
      ))}

      {editing === 'new' ? form() : null}

      <View style={styles.footer}>
        <Pressable
          onPress={() => (editing === 'new' ? setEditing(null) : open(null))}
          hitSlop={8}
        >
          <Text style={{ color: palette.accent, fontSize: 14, fontWeight: '600' }}>
            {editing === 'new' ? t('lists.done') : t('timeline.add')}
          </Text>
        </Pressable>
      </View>
    </Block>
  );

  /** One form, whether a moment is being remembered or corrected. */
  function form() {
    return (
      <View style={[styles.box, { borderColor: palette.border }]}>
        <TextInput
          value={day}
          onChangeText={setDay}
          placeholder="2026-09-25"
          placeholderTextColor={palette.faint}
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.input, { color: palette.text, borderColor: palette.border }]}
        />
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder={t('timeline.notePlaceholder')}
          placeholderTextColor={palette.faint}
          multiline
          style={[styles.input, { color: palette.text, borderColor: palette.border }]}
        />
        <Pressable onPress={save} style={styles.act}>
          <Text style={{ color: palette.accent, fontSize: 16 }}>{t('timeline.save')}</Text>
        </Pressable>
      </View>
    );
  }
}

/** What happened, in the words somebody would use for it. */
function labelOf(event: ReadingEvent, t: ReturnType<typeof useTranslation>['t']): string {
  if (event.kind === 'status') return t(`timeline.became_${event.label ?? 'none'}`);
  if (event.kind === 'chapter') {
    return t('timeline.finishedChapter', {
      what: event.label?.trim() || `${(event.chapter_idx ?? 0) + 1}`,
    });
  }
  return event.note?.trim() || t('timeline.aMoment');
}

const styles = StyleSheet.create({
  box: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    gap: space.sm,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    fontSize: 15,
  },
  act: { alignSelf: 'flex-end', paddingVertical: space.sm, paddingHorizontal: space.sm },
  footer: { flexDirection: 'row', gap: space.lg, paddingHorizontal: space.xs, paddingTop: space.sm },
});
