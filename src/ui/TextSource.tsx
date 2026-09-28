import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import type { Book } from '../db/repo';
import { keptCatalogs, searchIndex, type IndexedBook } from '../sources/catalog';
import { Hint, Row, Section } from './primitives';
import { radius, space, usePalette } from '../theme';

/**
 * Where a book's words come from, asked of a book that already exists.
 *
 * This is the second half of the workflow and the reason the first half can
 * be so short. Adding a book names the work — a title, an author, a number on
 * the back of it — and says nothing about whether anybody can supply the
 * text. That is a different question with different answers, and most of them
 * depend on the book: Gutenberg has it or it does not, the reader has a file
 * or they do not.
 *
 * So the kept lists are searched for this book by name, here, at the moment
 * the question is actually being asked. What comes back is every edition on
 * the device that could be this book, beside the two doors that need no
 * catalog at all.
 */
export function TextSource({ book, onFile, onLink, onPick, onClose }: {
  book: Book;
  onFile: () => void;
  onLink: () => void;
  /** An edition from a kept list, to be confirmed and fetched. */
  onPick: (hit: IndexedBook) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const [found, setFound] = useState<IndexedBook[] | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        // Only the lists that hand over a manuscript. Open Library gives a
        // record and no file, and a bible builds its own book out of the
        // download rather than filling one in — neither can answer this.
        const sources = (await keptCatalogs())
          .map((row) => row.source)
          .filter((source) => source === 'gutenberg' || source === 'standardebooks');
        /**
         * The author first, because it is what separates one Emma from
         * another — then the title alone when that finds nothing.
         *
         * Every word of the query has to appear in a row, and the two ends
         * rarely agree on all of them: a record saying "Emma: A Novel" finds
         * no Gutenberg row, because Gutenberg calls it "Emma" and has no word
         * "novel" anywhere. Narrow first and widen once is what gets both the
         * precision and the book.
         */
        const asked = [book.title, book.author ?? ''].filter(Boolean).join(' ');
        let rows = await searchIndex(asked, sources, 12);
        if (!rows.length && book.author) rows = await searchIndex(book.title, sources, 12);
        if (live) setFound(rows);
      } catch {
        if (live) setFound([]);
      }
    })();
    return () => {
      live = false;
    };
  }, [book.title, book.author]);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={[styles.scrim, { backgroundColor: palette.scrim }]} onPress={onClose}>
        <Pressable
          onPress={(event) => event.stopPropagation()}
          style={[
            styles.sheet,
            {
              backgroundColor: palette.bg,
              borderColor: palette.border,
              paddingBottom: Math.max(insets.bottom, space.md) + space.lg,
            },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: palette.faint }]} />
          <Text numberOfLines={2} style={[styles.title, { color: palette.text }]}>
            {t('book.textSource')}
          </Text>
          <ScrollView bounces={false} keyboardShouldPersistTaps="handled">
            <Section title={t('book.textYours')} flush>
              <Row
                label={t('book.addTextFile')}
                detail={t('book.addTextWhat')}
                value="›"
                onPress={onFile}
              />
              <Row
                label={t('book.addTextLink')}
                detail={t('shelf.fromLinkHint')}
                value="›"
                onPress={onLink}
                last
              />
            </Section>

            {found === null ? (
              <ActivityIndicator style={{ marginTop: space.xl }} />
            ) : found.length ? (
              <Section title={t('book.textFound', { count: found.length })}>
                {found.map((hit, index) => (
                  <Row
                    key={`${hit.source}-${hit.extId}`}
                    label={hit.title}
                    detail={[hit.author, hit.language, t(`source.${hit.source.split(':')[0]}`)]
                      .filter(Boolean)
                      .join(' · ')}
                    value="›"
                    onPress={() => onPick(hit)}
                    last={index === found.length - 1}
                  />
                ))}
              </Section>
            ) : (
              <Hint>{t('book.textNoneFound')}</Hint>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    maxHeight: '85%',
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: space.md,
    opacity: 0.5,
  },
  title: { fontSize: 19, fontWeight: '700', marginBottom: space.sm },
});
