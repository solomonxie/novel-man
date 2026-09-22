import { Pressable, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { router } from '../navigation/router';
import { Cover } from './primitives';
import { formatCount } from '../text/counts';
import { isRecord, statusOf } from '../books/record';
import type { BookListItem } from '../db/repo';
import { space, usePalette } from '../theme';
import { trace } from '../dev/trace';

/** One book on a shelf — the whole shelf, a list of them, or a tag's worth. */
export function BookTile({ book, width }: { book: BookListItem; width: number }) {
  const palette = usePalette();
  const { t } = useTranslation();
  // A book you've started says how far in you are; one you haven't says how
  // long it is. Both answer "should I open this now?".
  const started = (book.offset ?? 0) > 0;
  const status = statusOf(book.status);
  return (
    <Pressable
      onPress={() => {
        trace(`tap ${book.title}`);
        router.push(`/book/${book.id}`);
      }}
      style={{ width }}
    >
      <Cover title={book.title} hue={book.cover_hue} width={width} path={book.cover_path} />
      <Text numberOfLines={2} style={{ color: palette.text, fontSize: 13, marginTop: space.xs }}>
        {book.title}
      </Text>
      {/* A book with no words has no length and no progress, so the line says
          the only two things that are true of it: what you gave it, and where
          it stands. */}
      <Text numberOfLines={1} style={{ color: palette.dim, fontSize: 11 }}>
        {isRecord(book)
          ? book.stars
            ? '★'.repeat(book.stars)
            : status
              ? t(`status.${status}`)
              : t('status.none')
          : started
            ? `${Math.min(99, Math.round(((book.offset ?? 0) / Math.max(1, book.char_count)) * 100))}%`
            : formatCount(book.word_count, book.language)}
      </Text>
    </Pressable>
  );
}
