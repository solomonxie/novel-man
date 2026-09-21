import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Keyboard,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useKeyboardLift } from './keyboard';
import { useDragDismiss } from './dismiss';
import { Grabber } from './primitives';
import { radius, space, usePalette } from '../theme';

/** How far the sheet starts below where it lands. Far enough to read as a rise. */
const ENTER = 28;
const APPEAR_MS = 140;
const LEAVE_MS = 120;

/**
 * A note is written against the sentence, so the sentence stays on screen.
 *
 * It opens in one movement, which is the whole reason this is hand-animated.
 * The obvious build — a sliding `Modal`, an autofocused field and a
 * `KeyboardAvoidingView` — plays three animations in sequence and waits for
 * each: the modal slides (a third of a second), only then can the field take
 * focus, the keyboard then rises, and the sheet jumps afterwards to get out of
 * its way. Here the modal presents with no animation of its own, so the field
 * is focused on the first frame, and the sheet rides the keyboard's own
 * timing up — one motion, about as long as the keyboard takes.
 */
export function NoteSheet({ visible, quote, note, onSave, onDelete, onClose }: {
  visible: boolean;
  quote: string;
  note: string | null;
  onSave: (note: string) => void;
  /** Only where there is already a mark to take off — see the corner button. */
  onDelete?: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const palette = usePalette();
  const [draft, setDraft] = useState(note ?? '');
  /**
   * The same text, kept where a callback can read it late. An input method
   * that composes — pinyin, kana, handwriting — holds what is being typed as
   * marked text that no `onChangeText` has reported yet, and dismissing the
   * keyboard is what commits it. Save dismisses first and reads this after,
   * so a note typed in Chinese is not thrown away for being half-typed.
   */
  const latest = useRef(note ?? '');
  useEffect(() => {
    setDraft(note ?? '');
    latest.current = note ?? '';
  }, [note, visible]);

  const lift = useKeyboardLift();
  const drag = useDragDismiss(() => leave(onClose));
  const appear = useRef(new Animated.Value(0)).current;
  const field = useRef<TextInput>(null);

  useEffect(() => {
    if (!visible) return;
    appear.setValue(0);
    Animated.timing(appear, {
      toValue: 1,
      duration: APPEAR_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
  }, [appear, visible]);

  // Hidden is not mounted: a Modal left in the tree keeps a sheet-sized
  // view on the page, which is the white band under everything.
  if (!visible) return null;

  /**
   * Leaving is the same trade as arriving. The keyboard is dismissed first so
   * it falls with the sheet rather than after it, and the caller — which is
   * what actually unmounts this — is told once the sheet is gone.
   */
  function leave(then: () => void) {
    Keyboard.dismiss();
    Animated.timing(appear, {
      toValue: 0,
      duration: LEAVE_MS,
      easing: Easing.in(Easing.quad),
      useNativeDriver: false,
    }).start(then);
  }

  const rise = Animated.add(
    Animated.add(
      appear.interpolate({ inputRange: [0, 1], outputRange: [ENTER, 0] }),
      Animated.multiply(lift, -1)
    ),
    drag.translateY
  );

  return (
    <Modal
      visible
      transparent
      animationType="none"
      onRequestClose={() => leave(onClose)}
      // Focused from here rather than by `autoFocus`: inside a modal, autofocus
      // can fire while the thing is still being presented, and a focus the
      // system drops is a keyboard that never comes up at all.
      onShow={() => field.current?.focus()}
    >
      <View style={StyleSheet.absoluteFill}>
        <Animated.View
          style={[StyleSheet.absoluteFill, { backgroundColor: palette.scrim, opacity: appear }]}
        />
        <Pressable style={StyleSheet.absoluteFill} onPress={() => leave(onClose)} />

        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: palette.surface,
              borderColor: palette.border,
              opacity: appear,
              transform: [{ translateY: rise }],
            },
          ]}
        >
          <View {...drag.handlers}>
            <Grabber />
            <View style={styles.head}>
            <Pressable onPress={() => leave(onClose)} hitSlop={12}>
              <Text style={{ color: palette.accent, fontSize: 16 }}>{t('settings.cancel')}</Text>
            </Pressable>
            <Text style={{ color: palette.text, fontSize: 15, fontWeight: '600' }}>
              {t('reader.note')}
            </Text>
            <View style={styles.headRight}>
              {/* Taking the mark off is a different question from clearing the
                  note, so it is not the Save button with an empty field. It
                  sits in the corner, small and red, and every caller asks
                  before it does anything — which is why it can live this close
                  to Save. It does not animate out: the sheet has to still be
                  there if the question is answered no. */}
              {onDelete ? (
                <Pressable
                  onPress={onDelete}
                  hitSlop={10}
                  style={[styles.delete, { borderColor: palette.border }]}
                >
                  <Text style={{ color: palette.danger, fontSize: 13 }}>{t('settings.delete')}</Text>
                </Pressable>
              ) : null}
              <Pressable onPress={() => leave(() => onSave(latest.current.trim()))} hitSlop={12}>
                <Text style={{ color: palette.accent, fontSize: 16 }}>{t('settings.save')}</Text>
              </Pressable>
            </View>
            </View>
          </View>

          {/* Only where there is one. A note about the book quotes nothing,
              and an empty rule above the field is a passage that failed to
              load rather than one that was never there. */}
          {quote ? (
            <Text numberOfLines={3} style={[styles.quote, { color: palette.dim, borderColor: palette.border }]}>
              {quote}
            </Text>
          ) : null}

          <TextInput
            ref={field}
            value={draft}
            onChangeText={(next) => {
              latest.current = next;
              setDraft(next);
            }}
            placeholder={t('reader.notePlaceholder')}
            placeholderTextColor={palette.faint}
            multiline
            style={{ color: palette.text, fontSize: 16, minHeight: 120, marginTop: space.md }}
          />
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
  headRight: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  delete: {
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  quote: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: space.lg,
    paddingLeft: space.md,
    borderLeftWidth: 3,
  },
});
