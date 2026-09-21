import { useCallback, useState } from 'react';
import { Alert, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from '../../src/navigation/router';
import { useTranslation } from 'react-i18next';

import {
  booksInList,
  deleteBookList,
  getBookList,
  renameBookList,
  type BookList,
} from '../../src/db/shelves';
import type { BookListItem } from '../../src/db/repo';
import { Row, Section } from '../../src/ui/primitives';
import { InlineText } from '../../src/ui/inline';
import { Shelf } from '../../src/ui/Shelf';
import { space, usePalette } from '../../src/theme';

/**
 * One list of books, and the two things that can be done to it. Favourites is
 * a list like any other except that it ships with the app: it is named in the
 * language the app is read in, and it has no way out.
 */
export default function ListPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const palette = usePalette();
  const [list, setList] = useState<BookList | null>(null);
  const [books, setBooks] = useState<BookListItem[]>([]);

  const load = useCallback(() => {
    if (!id) return;
    getBookList(id).then(setList);
    booksInList(id).then(setBooks);
  }, [id]);

  useFocusEffect(load);

  const name = list ? (list.system ? t('lists.favorites') : list.name) : '';

  function confirmDelete() {
    Alert.alert(t('lists.delete'), t('lists.deleteConfirm', { name }), [
      { text: t('settings.cancel'), style: 'cancel' },
      {
        text: t('lists.delete'),
        style: 'destructive',
        onPress: async () => {
          if (!id) return;
          await deleteBookList(id);
          router.back();
        },
      },
    ]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <Stack.Screen options={{ title: name, headerBackTitle: ' ' }} />

      {/* Renamed where it is read, like every other name in the app. A
          shipped list has no editable name and no way out: the heart on a
          book page has to have somewhere to go. */}
      {list && !list.system ? (
        <View style={{ paddingHorizontal: space.lg, paddingTop: space.md }}>
          <InlineText
            value={list.name}
            placeholder={t('lists.name')}
            onCommit={async (value) => {
              if (!value.trim() || !id) return;
              await renameBookList(id, value);
              load();
            }}
            style={{ color: palette.text, fontSize: 22, fontWeight: '700' }}
          />
        </View>
      ) : null}

      <Shelf books={books} empty={t('lists.emptyList')} />

      {list && !list.system ? (
        <View style={{ paddingHorizontal: space.lg, paddingBottom: space.xl }}>
          <Section>
            <Row label={t('lists.delete')} onPress={confirmDelete} danger last />
          </Section>
        </View>
      ) : null}
    </View>
  );
}
