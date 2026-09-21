import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { radius, space, usePalette } from '../theme';

/** A note is written against the sentence, so the sentence stays on screen. */
export function NoteSheet({ visible, quote, note, onSave, onDelete, onClose }: {
  visible: boolean;
  quote: string;
  note: string | null;
  onSave: (note: string) => void;
  /** Only where there is already a mark to take off — see the row below. */
  onDelete?: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const palette = usePalette();
  const [draft, setDraft] = useState(note ?? '');
  useEffect(() => setDraft(note ?? ''), [note, visible]);

  // Hidden is not mounted: a Modal left in the tree keeps a sheet-sized
  // view on the page, which is the white band under everything.
  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={[styles.scrim, { backgroundColor: palette.scrim }]} onPress={onClose}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable
            style={[styles.sheet, { backgroundColor: palette.surface, borderColor: palette.border }]}
            onPress={(event) => event.stopPropagation()}
          >
            <View style={styles.head}>
              <Pressable onPress={onClose} hitSlop={12}>
                <Text style={{ color: palette.accent, fontSize: 16 }}>{t('settings.cancel')}</Text>
              </Pressable>
              <Text style={{ color: palette.text, fontSize: 15, fontWeight: '600' }}>
                {t('reader.note')}
              </Text>
              <Pressable onPress={() => onSave(draft.trim())} hitSlop={12}>
                <Text style={{ color: palette.accent, fontSize: 16 }}>{t('settings.save')}</Text>
              </Pressable>
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
              value={draft}
              onChangeText={setDraft}
              placeholder={t('reader.notePlaceholder')}
              placeholderTextColor={palette.faint}
              multiline
              autoFocus
              style={{ color: palette.text, fontSize: 16, minHeight: 120, marginTop: space.md }}
            />
            {/* Clearing the text leaves the highlight behind, which is the
                right answer to "I changed my mind about the note" and the
                wrong one to "I changed my mind about the mark". This is the
                second question, so it is asked away from Save. */}
            {onDelete ? (
              <Pressable onPress={onDelete} style={[styles.remove, { borderColor: palette.border }]}>
                <Text style={{ color: palette.danger, fontSize: 15 }}>{t('settings.delete')}</Text>
              </Pressable>
            ) : null}
          </Pressable>
        </KeyboardAvoidingView>
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
    padding: space.lg,
    paddingBottom: space.xxl,
  },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  remove: {
    marginTop: space.lg,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  quote: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: space.lg,
    paddingLeft: space.md,
    borderLeftWidth: 3,
  },
});
