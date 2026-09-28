import { Pressable, StyleSheet, Text } from 'react-native';

import { router } from '../navigation/router';
import type { MetaHit } from '../search/library';
import { radius, space, usePalette } from '../theme';

/**
 * Something a search found that is not a book: a chapter, a person, a note, a
 * sentence. Where a book is recognised by its cover, these are read — so they
 * are a small card of words rather than a row with a picture, and they say
 * where they live before they say what they are.
 */
export type ResultRow = {
  key: string;
  /** Where the thing lives — the book, and the part of it if it has one. */
  context: string;
  label: string;
  excerpt?: string;
  onPress: () => void;
};

// A note opens the page it lives on rather than a page of its own: what you
// wrote is read next to everything else you wrote about that book.
const routes: Record<MetaHit['kind'], (hit: MetaHit) => string> = {
  chapter: (hit) => `/chapter/${hit.id}`,
  character: (hit) => `/entity/${hit.id}`,
  place: (hit) => `/place/${hit.id}`,
  term: (hit) => `/term/${hit.id}`,
  card: (hit) => `/card/${hit.id}`,
  note: (hit) => `/book/${hit.bookId}/notes`,
};

export function toRow(hit: MetaHit): ResultRow {
  return {
    key: `${hit.kind}-${hit.id}`,
    context: hit.context,
    label: hit.label,
    excerpt: hit.excerpt,
    onPress: () => router.push(routes[hit.kind](hit)),
  };
}

export function HitCard({ row }: { row: ResultRow }) {
  const palette = usePalette();
  return (
    <Pressable
      onPress={row.onPress}
      style={({ pressed }) => [
        styles.hit,
        { backgroundColor: pressed ? palette.sunken : palette.surface, borderColor: palette.border },
      ]}
    >
      <Text numberOfLines={1} style={{ color: palette.dim, fontSize: 12 }}>{row.context}</Text>
      <Text numberOfLines={2} style={{ color: palette.text, fontSize: 14, marginTop: 2 }}>
        {row.label}
      </Text>
      {row.excerpt ? (
        <Text numberOfLines={2} style={{ color: palette.dim, fontSize: 12, marginTop: 2 }}>
          {row.excerpt}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: {
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: space.sm,
  },
});
