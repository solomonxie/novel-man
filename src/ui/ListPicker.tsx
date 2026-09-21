import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  createBookList,
  listBookLists,
  listsHolding,
  setInList,
  type BookList,
} from '../db/shelves';
import { useKeyboardHeight } from './keyboard';
import { useDragDismiss } from './dismiss';
import { Grabber } from './primitives';
import { radius, space, usePalette } from '../theme';

/**
 * Which lists this book is in, answered in one place. It is a menu rather than
 * a section of the page because a book belongs to a list the way a song
 * belongs to a playlist — it is a thing you do once and then never look at
 * again from this side. The lists themselves are read on the shelf.
 *
 * The field both filters and creates: typing a name nobody has used yet offers
 * to make it, which is the same keystroke either way and means a new list
 * never needs a screen of its own.
 */
export function ListPicker({ visible, bookId, onClose, onChanged }: {
  visible: boolean;
  bookId: string;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const { t } = useTranslation();
  const palette = usePalette();
  const { height } = useWindowDimensions();
  const keyboard = useKeyboardHeight();
  const drag = useDragDismiss(leave);
  const appear = useRef(new Animated.Value(0)).current;

  const [all, setAll] = useState<BookList[]>([]);
  const [holding, setHolding] = useState<string[]>([]);
  const [query, setQuery] = useState('');

  const load = useCallback(() => {
    listBookLists().then(setAll).catch(() => undefined);
    listsHolding(bookId)
      .then((lists) => setHolding(lists.map((list) => list.id)))
      .catch(() => undefined);
  }, [bookId]);

  useEffect(() => {
    if (!visible) return;
    setQuery('');
    load();
    appear.setValue(0);
    Animated.timing(appear, {
      toValue: 1,
      duration: 140,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
  }, [appear, load, visible]);

  if (!visible) return null;

  function leave() {
    Keyboard.dismiss();
    Animated.timing(appear, {
      toValue: 0,
      duration: 120,
      easing: Easing.in(Easing.quad),
      useNativeDriver: false,
    }).start(onClose);
  }

  const nameOf = (list: BookList) => (list.system ? t('lists.favorites') : list.name);

  async function toggle(list: BookList) {
    await setInList(list.id, bookId, !holding.includes(list.id));
    load();
    onChanged?.();
  }

  async function create() {
    const wanted = query.trim();
    if (!wanted) return;
    const id = await createBookList(wanted);
    await setInList(id, bookId, true);
    setQuery('');
    load();
    onChanged?.();
  }

  const needle = query.trim().toLowerCase();
  const shown = needle ? all.filter((list) => nameOf(list).toLowerCase().includes(needle)) : all;
  const exists = all.some((list) => nameOf(list).toLowerCase() === needle);

  return (
    <Modal visible transparent animationType="none" onRequestClose={leave}>
      <View style={StyleSheet.absoluteFill}>
        <Animated.View
          style={[StyleSheet.absoluteFill, { backgroundColor: palette.scrim, opacity: appear }]}
        />
        <Pressable style={StyleSheet.absoluteFill} onPress={leave} />

        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: palette.surface,
              borderColor: palette.border,
              maxHeight: height * 0.7,
              // It stays put and shortens instead: a sheet this tall, lifted
              // by a keyboard, leaves the screen at the top.
              paddingBottom: keyboard ? keyboard + space.md : space.xxl,
              opacity: appear,
              transform: [
                {
                  translateY: Animated.add(
                    appear.interpolate({ inputRange: [0, 1], outputRange: [28, 0] }),
                    drag.translateY
                  ),
                },
              ],
            },
          ]}
        >
          <View {...drag.handlers}>
            <Grabber />
            <View style={styles.head}>
              <Text style={{ color: palette.text, fontSize: 15, fontWeight: '600' }}>
                {t('lists.addTo')}
              </Text>
              <Pressable onPress={leave} hitSlop={12}>
                <Text style={{ color: palette.accent, fontSize: 16 }}>{t('lists.done')}</Text>
              </Pressable>
            </View>
          </View>

          <View style={[styles.field, { borderColor: palette.border, backgroundColor: palette.bg }]}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t('lists.findOrCreate')}
              placeholderTextColor={palette.faint}
              style={{ flex: 1, color: palette.text, fontSize: 16 }}
              returnKeyType="done"
              onSubmitEditing={() => (exists ? undefined : create())}
            />
          </View>

          <ScrollView style={{ marginTop: space.sm }} keyboardShouldPersistTaps="handled">
            {needle && !exists ? (
              <Pressable
                onPress={create}
                style={({ pressed }) => [styles.row, pressed && { backgroundColor: palette.sunken }]}
              >
                <Text style={{ color: palette.accent, fontSize: 16, flex: 1 }}>
                  {t('lists.createNamed', { name: query.trim() })}
                </Text>
                <Text style={{ color: palette.accent, fontSize: 16 }}>＋</Text>
              </Pressable>
            ) : null}

            {shown.map((list) => {
              const held = holding.includes(list.id);
              return (
                <Pressable
                  key={list.id}
                  onPress={() => toggle(list)}
                  style={({ pressed }) => [styles.row, pressed && { backgroundColor: palette.sunken }]}
                >
                  <Text style={{ color: held ? palette.accent : palette.text, fontSize: 16, flex: 1 }}>
                    {nameOf(list)}
                  </Text>
                  <Text style={{ color: palette.dim, fontSize: 13 }}>
                    {t('lists.count', { count: list.books })}
                  </Text>
                  <Text style={{ color: palette.accent, fontSize: 16, width: 18, textAlign: 'right' }}>
                    {held ? '✓' : ''}
                  </Text>
                </Pressable>
              );
            })}

            {!shown.length && !needle ? (
              <Text style={{ color: palette.dim, fontSize: 14, padding: space.md }}>
                {t('lists.noneYet')}
              </Text>
            ) : null}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: space.lg,
    paddingBottom: space.xxl,
  },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 4,
  },
});
