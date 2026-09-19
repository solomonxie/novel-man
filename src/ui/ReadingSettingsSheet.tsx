import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  FONT_RANGE,
  MARGIN_RANGE,
  type Bilingual,
  type ReadingSettings,
} from '../reader/settings';
import { labelFor } from '../translate/languages';
import { radius, readingThemes, space, type ReadingTheme } from '../theme';

const THEMES: ReadingTheme[] = ['paper', 'sepia', 'grey', 'night'];
const SPACINGS: ReadingSettings['spacing'][] = ['compact', 'normal', 'loose'];
const BILINGUAL: Bilingual[] = ['off', 'target', 'both'];

/** Applies live to the page behind it — you judge type by reading it, not by a number. */
export function ReadingSettingsSheet({ visible, settings, targets, target, onTarget, onChange, onClose }: {
  visible: boolean;
  settings: ReadingSettings;
  /** Only offered when this book has a translation to show. */
  targets?: string[];
  target?: string | null;
  onTarget?: (code: string) => void;
  onChange: (next: ReadingSettings) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const palette = readingThemes[settings.theme];
  const ink = palette.text;

  const step = (key: 'fontSize' | 'margin', direction: -1 | 1) => {
    const range = key === 'fontSize' ? FONT_RANGE : MARGIN_RANGE;
    const next = Math.min(range.max, Math.max(range.min, settings[key] + direction * range.step));
    onChange({ ...settings, [key]: next });
  };

  // Hidden is not mounted: a Modal left in the tree keeps a sheet-sized
  // view on the page, which is the white band under everything.
  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: palette.bg }]}
          onPress={(event) => event.stopPropagation()}
        >
          <View style={[styles.grabber, { backgroundColor: palette.dim }]} />

          <View style={styles.stepperRow}>
            <Text style={{ color: ink, fontSize: 15 }}>Aa</Text>
            <Stepper label={`${settings.fontSize}pt`} ink={ink} onStep={(d) => step('fontSize', d)} />
          </View>

          <View style={styles.stepperRow}>
            <Text style={{ color: ink, fontSize: 15 }}>{t('reader.margins')}</Text>
            <Stepper label={`${settings.margin}`} ink={ink} onStep={(d) => step('margin', d)} />
          </View>

          <Text style={[styles.label, { color: palette.dim }]}>{t('reader.theme')}</Text>
          <View style={styles.row}>
            {THEMES.map((theme) => (
              <Pressable
                key={theme}
                onPress={() => onChange({ ...settings, theme })}
                style={[
                  styles.swatch,
                  {
                    backgroundColor: readingThemes[theme].bg,
                    borderColor: theme === settings.theme ? palette.accent : readingThemes[theme].dim,
                    borderWidth: theme === settings.theme ? 2 : StyleSheet.hairlineWidth,
                  },
                ]}
              >
                <Text style={{ color: readingThemes[theme].text, fontSize: 13 }}>
                  {t(`reader.theme_${theme}`)}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={[styles.label, { color: palette.dim }]}>{t('reader.spacing')}</Text>
          <View style={styles.row}>
            {SPACINGS.map((spacing) => (
              <Segment
                key={spacing}
                label={t(`reader.spacing_${spacing}`)}
                active={spacing === settings.spacing}
                ink={ink}
                accent={palette.accent}
                onPress={() => onChange({ ...settings, spacing })}
              />
            ))}
          </View>

          <Text style={[styles.label, { color: palette.dim }]}>{t('reader.font')}</Text>
          <View style={styles.row}>
            <Segment label={t('reader.sans')} active={!settings.serif} ink={ink}
                accent={palette.accent}
              onPress={() => onChange({ ...settings, serif: false })} />
            <Segment label={t('reader.serif')} active={settings.serif} ink={ink}
                accent={palette.accent}
              onPress={() => onChange({ ...settings, serif: true })} />
          </View>

          {targets && targets.length > 0 && (
            <>
              <Text style={[styles.label, { color: palette.dim }]}>{t('reader.bilingual')}</Text>
              <View style={styles.row}>
                {BILINGUAL.map((mode) => (
                  <Segment
                    key={mode}
                    label={t(`reader.bilingual_${mode}`)}
                    active={mode === settings.bilingual}
                    ink={ink}
                accent={palette.accent}
                    onPress={() => onChange({ ...settings, bilingual: mode })}
                  />
                ))}
              </View>
              {settings.bilingual !== 'off' && targets.length > 1 && (
                <View style={[styles.row, { marginTop: space.sm }]}>
                  {targets.map((code) => (
                    <Segment
                      key={code}
                      label={labelFor(code)}
                      active={code === target}
                      ink={ink}
                accent={palette.accent}
                      onPress={() => onTarget?.(code)}
                    />
                  ))}
                </View>
              )}
            </>
          )}

          {/* A grabber is a hint and the scrim is a guess. One button says it. */}
          <Pressable onPress={onClose} style={[styles.done, { borderColor: ink + '33' }]}>
            <Text style={{ color: palette.accent, fontSize: 16, fontWeight: '600' }}>
              {t('reader.done')}
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Stepper({ label, ink, onStep }: {
  label: string;
  ink: string;
  onStep: (direction: -1 | 1) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
      <Pressable onPress={() => onStep(-1)} hitSlop={12}>
        <Text style={{ color: ink, fontSize: 22 }}>⊖</Text>
      </Pressable>
      <Text style={{ color: ink, fontSize: 14, minWidth: 44, textAlign: 'center' }}>{label}</Text>
      <Pressable onPress={() => onStep(1)} hitSlop={12}>
        <Text style={{ color: ink, fontSize: 22 }}>⊕</Text>
      </Pressable>
    </View>
  );
}

function Segment({ label, active, ink, accent, onPress }: {
  label: string;
  active: boolean;
  ink: string;
  accent: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.segment, { borderColor: active ? accent : ink + '33', borderWidth: active ? 2 : 1 }]}
    >
      <Text style={{ color: ink, fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: space.lg,
    paddingBottom: space.xxl,
  },
  grabber: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: space.lg },
  done: {
    marginTop: space.xl,
    paddingVertical: space.md + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.sm,
  },
  label: { fontSize: 12, letterSpacing: 0.6, marginTop: space.lg, marginBottom: space.sm },
  row: { flexDirection: 'row', gap: space.sm },
  swatch: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: space.md,
    borderRadius: radius.sm,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: space.sm + 2,
    borderRadius: radius.sm,
  },
});
