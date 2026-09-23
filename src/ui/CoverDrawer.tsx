import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { artDirect, coverPrompt, type CoverMaterial } from '../ai/cover';
import { drawImage, NoImageKey } from '../ai/image';
import { writeImage } from '../storage/files';
import { updateBook, type Book } from '../db/repo';
import { radius, space, usePalette } from '../theme';

/** Three lines of prompt, and a proof big enough to judge. */
const LINE = 22;
const PROMPT_LINES = 4;
const PREVIEW = 160;

/**
 * A cover drawn to order, for the books that have none anywhere.
 *
 * It is unfolded in place rather than opened as a sheet, because the thing
 * being decided is on the page behind it: the cover it would replace. The
 * prompt is offered written, since nobody wants to describe their own book
 * from a blank field — and it is a field rather than a fixed sentence, because
 * the reader knows what the book looks like in their head and the app does not.
 *
 * What comes back is not kept until it is chosen. An unasked-for cover written
 * straight over the old one is a cover you cannot undo.
 */
export function CoverDrawer({ book, material, onDrawn }: {
  book: Book;
  /** What the shelf knows that could be drawn — see `ai/cover`. */
  material: CoverMaterial;
  onDrawn: () => void;
}) {
  const { t } = useTranslation();
  const palette = usePalette();
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [directing, setDirecting] = useState(false);
  const [drawn, setDrawn] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    setPrompt(coverPrompt(material));
    // Only when the book itself changes: a reload must not rewrite what is
    // being typed into the prompt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id]);

  useEffect(() => () => abort.current?.abort(), []);

  /**
   * The step that makes a cover rather than an illustration of the plot: a
   * text model reads the briefs and names one image. It answers into the same
   * field, so what it decided can be read and argued with before a picture is
   * paid for.
   */
  async function direct() {
    if (directing) return;
    setDirecting(true);
    setFailure(null);
    abort.current = new AbortController();
    try {
      setPrompt(await artDirect(material, abort.current.signal));
    } catch (problem) {
      setFailure(String(problem));
    } finally {
      setDirecting(false);
    }
  }

  async function draw() {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setFailure(null);
    setDrawn(null);
    abort.current = new AbortController();
    try {
      const bytes = await drawImage(prompt.trim(), 'portrait', abort.current.signal);
      // Kept under its own name, beside the cover rather than over it.
      setDrawn(writeImage(`drawn-${book.id}-${Date.now().toString(36)}.png`, bytes));
    } catch (problem) {
      setFailure(problem instanceof NoImageKey ? t('draw.noKey') : String(problem));
    } finally {
      setBusy(false);
    }
  }

  async function keep() {
    if (!drawn) return;
    await updateBook(book.id, { cover_path: drawn });
    setDrawn(null);
    onDrawn();
  }

  return (
    <View style={styles.panel}>
      <TextInput
        value={prompt}
        onChangeText={setPrompt}
        placeholder={t('draw.placeholder')}
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

      <View style={styles.buttons}>
        <Pressable onPress={direct} disabled={directing || busy} hitSlop={8}>
          <Text
            style={{
              color: directing || busy ? palette.faint : palette.accent,
              fontSize: 15,
              fontWeight: '600',
            }}
          >
            {directing ? t('draw.directing') : t('draw.direct')}
          </Text>
        </Pressable>
        <Pressable onPress={draw} disabled={busy || directing || !prompt.trim()} hitSlop={8}>
          <Text
            style={{
              color: busy || directing || !prompt.trim() ? palette.faint : palette.accent,
              fontSize: 15,
              fontWeight: '600',
            }}
          >
            {busy ? t('draw.drawing') : drawn ? t('draw.again') : t('draw.submit')}
          </Text>
        </Pressable>
      </View>

      {busy || directing ? <ActivityIndicator style={{ marginTop: space.md }} /> : null}

      {failure ? (
        <Text style={{ color: palette.danger, fontSize: 13, marginTop: space.sm }}>{failure}</Text>
      ) : null}

      {drawn ? (
        <Pressable onPress={keep} style={{ marginTop: space.md, gap: space.xs }}>
          <Image
            source={{ uri: drawn }}
            style={{ width: PREVIEW, height: Math.round(PREVIEW * 1.5), borderRadius: radius.sm }}
            resizeMode="cover"
          />
          <Text style={{ color: palette.accent, fontSize: 13, fontWeight: '600' }}>
            {t('draw.keep')}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { paddingHorizontal: space.lg, paddingVertical: space.md, gap: space.sm },
  buttons: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  field: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    fontSize: 14,
    lineHeight: LINE,
  },
});
