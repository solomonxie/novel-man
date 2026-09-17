import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import type { TranslationUnit } from '../db/translation';
import { diffWords, hasChanges } from '../translate/diff';
import { radius, space, usePalette } from '../theme';

/**
 * The machine output is never overwritten in place, so this screen can always
 * show what changed, put it back, and turn a repeated fix into a glossary term
 * instead of the same edit thirty more times.
 */
export function UnitEditor({ unit, onSave, onRevert, onPromote, onClose }: {
  unit: TranslationUnit | null;
  onSave: (text: string) => void;
  onRevert: () => void;
  onPromote: (source: string, translation: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const palette = usePalette();
  const [draft, setDraft] = useState('');
  const [termSource, setTermSource] = useState('');
  const [termTarget, setTermTarget] = useState('');

  useEffect(() => {
    setDraft(unit?.edited ?? unit?.machine ?? '');
    setTermSource('');
    setTermTarget('');
  }, [unit]);

  if (!unit) return null;
  const changed = hasChanges(unit.machine, draft);

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: palette.bg }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.head}>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={{ color: palette.accent, fontSize: 16 }}>{t('settings.cancel')}</Text>
          </Pressable>
          <Text style={{ color: palette.text, fontSize: 16, fontWeight: '600' }}>
            {t('translate.editUnit')}
          </Text>
          <Pressable onPress={() => onSave(draft.trim())} hitSlop={12}>
            <Text style={{ color: palette.accent, fontSize: 16 }}>{t('settings.save')}</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}>
          <Text style={{ color: palette.dim, fontSize: 12 }}>{t('translate.source')}</Text>
          <Text style={{ color: palette.text, fontSize: 16, marginTop: space.xs, lineHeight: 24 }}>
            {unit.source}
          </Text>

          <Text style={{ color: palette.dim, fontSize: 12, marginTop: space.xl }}>
            {t('translate.target')}
          </Text>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            multiline
            style={[
              styles.input,
              { color: palette.text, backgroundColor: palette.surface, borderColor: palette.border },
            ]}
          />

          {changed && unit.machine ? (
            <View style={{ marginTop: space.lg }}>
              <Text style={{ color: palette.dim, fontSize: 12 }}>{t('translate.changes')}</Text>
              <Text style={{ fontSize: 15, lineHeight: 23, marginTop: space.xs }}>
                {diffWords(unit.machine, draft).map((piece, index) => (
                  <Text
                    key={index}
                    style={{
                      color:
                        piece.change === 'added'
                          ? palette.accent
                          : piece.change === 'removed'
                            ? palette.danger
                            : palette.text,
                      textDecorationLine: piece.change === 'removed' ? 'line-through' : 'none',
                    }}
                  >
                    {piece.text}
                  </Text>
                ))}
              </Text>
              <Pressable onPress={onRevert} style={{ marginTop: space.md }}>
                <Text style={{ color: palette.danger, fontSize: 15 }}>{t('translate.revert')}</Text>
              </Pressable>
            </View>
          ) : null}

          <View style={{ marginTop: space.xxl }}>
            <Text style={{ color: palette.dim, fontSize: 12 }}>{t('translate.promote')}</Text>
            <Text style={{ color: palette.faint, fontSize: 12, marginTop: space.xs }}>
              {t('translate.promoteHint')}
            </Text>
            <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.sm }}>
              <TextInput
                value={termSource}
                onChangeText={setTermSource}
                placeholder={t('translate.termSource')}
                placeholderTextColor={palette.faint}
                style={[styles.term, { color: palette.text, backgroundColor: palette.surface, borderColor: palette.border }]}
              />
              <TextInput
                value={termTarget}
                onChangeText={setTermTarget}
                placeholder={t('translate.termTarget')}
                placeholderTextColor={palette.faint}
                style={[styles.term, { color: palette.text, backgroundColor: palette.surface, borderColor: palette.border }]}
              />
            </View>
            <Pressable
              onPress={() =>
                termSource.trim() && termTarget.trim() && onPromote(termSource.trim(), termTarget.trim())
              }
              style={{ marginTop: space.md }}
            >
              <Text
                style={{
                  color: termSource.trim() && termTarget.trim() ? palette.accent : palette.faint,
                  fontSize: 15,
                }}
              >
                {t('translate.addTerm')}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: space.lg,
  },
  input: {
    marginTop: space.xs,
    minHeight: 110,
    padding: space.md,
    fontSize: 16,
    lineHeight: 24,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  term: {
    flex: 1,
    padding: space.sm + 2,
    fontSize: 15,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
