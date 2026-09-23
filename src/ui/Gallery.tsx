import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { promptFor, type Subject } from '../ai/imagery';
import { imageUri } from '../storage/files';
import { radius, space, usePalette } from '../theme';
import { Block, Empty } from './detail';
import type { Drawing } from '../db/repo';

const LINE = 22;
const PROMPT_LINES = 5;
const THUMB = 88;

/**
 * Everything drawn for one thing, and the way to draw another.
 *
 * The same block on a person, a place, a term, a chapter and a book, because
 * it is the same question in each — what does this look like — and a reader
 * who has learned it once should not meet a second arrangement of it.
 *
 * The prompt arrives written: nobody wants to describe a character they have
 * been reading for four hundred chapters from a blank field. It stays a field,
 * because the reader has a picture in mind and the app does not. Submitting
 * queues it — drawing takes half a minute and costs money, and a page you have
 * to stay on for either is a page that owns you.
 */
export function Gallery({ title, subject, images, onSubmit, onOpen, empty }: {
  title: string;
  /** What a new drawing would be of; nothing means the block is view-only. */
  subject?: Subject;
  images: Drawing[];
  onSubmit: (prompt: string) => void;
  onOpen: (image: Drawing) => void;
  empty?: string;
}) {
  const { t } = useTranslation();
  const palette = usePalette();
  const [drawing, setDrawing] = useState(false);
  /**
   * The field follows what the page knows until somebody types in it, and is
   * theirs from then on.
   *
   * Written once into state, it was written before the page had loaded what it
   * was describing — the chapter notes arrive a moment after the name does —
   * so the prompt went out with the name and none of the description, and the
   * drawing came back of nobody in particular. Derived, it is right whenever
   * the page is, and an edit still survives a reload.
   */
  const [edited, setEdited] = useState<string | null>(null);
  const prompt = edited ?? (subject ? promptFor(subject) : '');

  return (
    <Block
      title={title}
      count={images.length || undefined}
      action={
        subject
          ? {
              label: drawing ? t('gallery.cancel') : t('gallery.draw'),
              onPress: () => setDrawing((was) => !was),
            }
          : undefined
      }
    >
      {drawing && subject ? (
        <View style={{ gap: space.sm, paddingBottom: space.sm }}>
          <TextInput
            value={prompt}
            onChangeText={setEdited}
            placeholder={t('gallery.placeholder')}
            placeholderTextColor={palette.faint}
            multiline
            style={[
              styles.field,
              {
                color: palette.text,
                backgroundColor: palette.bg,
                borderColor: palette.border,
                minHeight: LINE * PROMPT_LINES,
              },
            ]}
          />
          <Pressable
            onPress={() => {
              if (!prompt.trim()) return;
              setDrawing(false);
              setEdited(null);
              onSubmit(prompt.trim());
            }}
            hitSlop={8}
          >
            <Text
              style={{
                color: prompt.trim() ? palette.accent : palette.faint,
                fontSize: 15,
                fontWeight: '600',
                textAlign: 'right',
              }}
            >
              {t('gallery.submit')}
            </Text>
          </Pressable>
          <Text style={{ color: palette.faint, fontSize: 12 }}>{t('gallery.queued')}</Text>
        </View>
      ) : null}

      {images.length === 0 ? (
        drawing ? null : <Empty text={empty ?? t('gallery.empty')} />
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
          {images.map((image) => (
            <Pressable key={image.id} onPress={() => onOpen(image)}>
              <Image source={{ uri: imageUri(image.path) }} style={styles.thumb} resizeMode="cover" />
            </Pressable>
          ))}
        </ScrollView>
      )}
    </Block>
  );
}

const styles = StyleSheet.create({
  field: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    fontSize: 14,
    lineHeight: LINE,
  },
  strip: { gap: space.sm, paddingVertical: space.xs },
  thumb: { width: THUMB, height: Math.round(THUMB * 1.5), borderRadius: radius.sm },
});
