import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams } from '../../src/navigation/router';
import { useTranslation } from 'react-i18next';

import { booksTagged } from '../../src/db/shelves';
import type { BookListItem } from '../../src/db/repo';
import { Shelf } from '../../src/ui/Shelf';
import { usePalette } from '../../src/theme';

/** Everything filed under one word. The tag is the whole page; it has no row. */
export default function TagPage() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const { t } = useTranslation();
  const palette = usePalette();
  const [books, setBooks] = useState<BookListItem[]>([]);

  const load = useCallback(() => {
    if (!name) return;
    booksTagged(name).then(setBooks);
  }, [name]);

  useFocusEffect(load);

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <Stack.Screen options={{ title: name ?? '', headerBackTitle: ' ' }} />
      <Shelf books={books} empty={t('lists.emptyTag')} />
    </View>
  );
}
