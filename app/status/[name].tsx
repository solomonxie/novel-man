import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams } from '../../src/navigation/router';
import { useTranslation } from 'react-i18next';

import { listBooks, type BookListItem } from '../../src/db/repo';
import { shelfOf, statusOf } from '../../src/books/record';
import { Shelf } from '../../src/ui/Shelf';
import { usePalette } from '../../src/theme';

/**
 * One shelf, whole. The home page shows a row of each and runs off the edge,
 * which is right for carrying on with something and wrong for looking through
 * everything — 137 books read is a sideways scroll nobody finishes.
 *
 * Grouped by `shelfOf` rather than by a query on `status`, so this page holds
 * exactly the books the count on the home page was counting.
 */
export default function StatusPage() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const { t } = useTranslation();
  const palette = usePalette();
  const [books, setBooks] = useState<BookListItem[]>([]);
  const status = statusOf(name);

  const load = useCallback(() => {
    if (!status) return;
    listBooks().then((all) => setBooks(all.filter((book) => shelfOf(book) === status)));
  }, [status]);

  useFocusEffect(load);

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <Stack.Screen
        options={{
          title: status ? t(`shelf.shelf_${status}`) : '',
          headerBackTitle: ' ',
        }}
      />
      <Shelf books={books} empty={t('shelf.noneHere')} />
    </View>
  );
}
