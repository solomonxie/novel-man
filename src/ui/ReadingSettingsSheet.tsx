import { useState } from 'react';
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

/** Applies live to the page behind it — you judge type by reading it, not by a number. */
export function ReadingSettingsSheet({ visible, settings, targets, ready, target, onTarget, onChange, onClose }: {
  visible: boolean;
  settings: ReadingSettings;
  /** Only offered when this book has a translation to show. */
  targets?: string[];
  /** Of those, the ones the chapter on screen actually has. */
  ready?: string[];
  target?: string | null;
  onTarget?: (code: string) => void;
  onChange: (next: ReadingSettings) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  /** One menu unfolds at a time, under the control it belongs to. */
  const [open, setOpen] = useState<'spacing' | 'font' | 'language' | null>(null);
  const palette = readingThemes[settings.theme];
  const ink = palette.text;

  const hasTargets = !!targets && targets.length > 0;
  const shownTarget = target ?? targets?.[0] ?? null;

  /** What the reading page is showing, said as the language it is showing. */
  const languageValue =
    settings.bilingual === 'off'
      ? t('reader.bilingual_off')
      : settings.bilingual === 'both'
        ? t('reader.bilingual_both')
        : labelFor(shownTarget ?? '') || t('reader.bilingual_target');
  const languageMissing = settings.bilingual !== 'off' && !!ready && !!shownTarget && !ready.includes(shownTarget);

  /**
   * A language this chapter has not been translated into is shown greyed
   * rather than hidden: it is a fact about the chapter, not about the book,
   * and hiding it would make the menu change shape as you read.
   */
  const has = (code: string | null) => !ready || !code || ready.includes(code);

  const languageOptions = [
    {
      id: 'off',
      label: t('reader.bilingual_off'),
      active: settings.bilingual === 'off',
      onPress: () => onChange({ ...settings, bilingual: 'off' as Bilingual }),
    },
    ...(targets ?? []).map((code) => ({
      id: code,
      label: labelFor(code) || code,
      active: settings.bilingual === 'target' && code === shownTarget,
      disabled: !has(code),
      onPress: () => {
        onTarget?.(code);
        onChange({ ...settings, bilingual: 'target' as Bilingual });
      },
    })),
    {
      id: 'both',
      label: t('reader.bilingual_both'),
      active: settings.bilingual === 'both',
      disabled: !(targets ?? []).some((code) => has(code)),
      onPress: () => onChange({ ...settings, bilingual: 'both' as Bilingual }),
    },
  ];

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

          {/* The two numbers side by side: both are the same kind of nudge,
              and a row each pushed everything worth seeing off the screen. */}
          <View style={[styles.row, { gap: space.lg }]}>
            <View style={styles.stepperRow}>
              <Text style={{ color: ink, fontSize: 14 }}>Aa</Text>
              <Stepper label={`${settings.fontSize}pt`} ink={ink} onStep={(d) => step('fontSize', d)} />
            </View>
            {/* A rule between them: two numbers side by side with nothing
                between read as one setting with four buttons. */}
            <View style={[styles.divider, { backgroundColor: ink + '22' }]} />
            <View style={styles.stepperRow}>
              <Text style={{ color: ink, fontSize: 14 }}>{t('reader.margins')}</Text>
              <Stepper label={`${settings.margin}`} ink={ink} onStep={(d) => step('margin', d)} />
            </View>
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

          {/* Three choices, three words, one row. Each was a paragraph of
              buttons before, which is a settings page pretending to be a
              reading one — what you want to see here is the page behind it. */}
          <View style={[styles.row, { marginTop: space.lg }]}>
            <Dropdown
              name={t('reader.spacing')}
              value={t(`reader.spacing_${settings.spacing}`)}
              open={open === 'spacing'}
              palette={palette}
              onPress={() => setOpen(open === 'spacing' ? null : 'spacing')}
            />
            <Dropdown
              name={t('reader.font')}
              value={settings.serif ? t('reader.serif') : t('reader.sans')}
              open={open === 'font'}
              palette={palette}
              onPress={() => setOpen(open === 'font' ? null : 'font')}
            />
            {/* A language is named, never called "the translation": which one
                it is is the whole question when a book has two. */}
            {hasTargets ? (
              <Dropdown
                name={t('reader.bilingual')}
                value={languageValue}
                muted={languageMissing}
                open={open === 'language'}
                palette={palette}
                onPress={() => setOpen(open === 'language' ? null : 'language')}
              />
            ) : null}
          </View>

          {open ? (
            <View style={styles.row}>
              <Menu
                shown={open === 'spacing'}
                palette={palette}
                options={SPACINGS.map((spacing) => ({
                  id: spacing,
                  label: t(`reader.spacing_${spacing}`),
                  active: spacing === settings.spacing,
                  onPress: () => onChange({ ...settings, spacing }),
                }))}
                onPicked={() => setOpen(null)}
              />
              <Menu
                shown={open === 'font'}
                palette={palette}
                options={[
                  {
                    id: 'sans',
                    label: t('reader.sans'),
                    active: !settings.serif,
                    onPress: () => onChange({ ...settings, serif: false }),
                  },
                  {
                    id: 'serif',
                    label: t('reader.serif'),
                    active: !!settings.serif,
                    onPress: () => onChange({ ...settings, serif: true }),
                  },
                ]}
                onPicked={() => setOpen(null)}
              />
              {hasTargets ? (
                <Menu
                  shown={open === 'language'}
                  palette={palette}
                  options={languageOptions}
                  onPicked={() => setOpen(null)}
                />
              ) : null}
            </View>
          ) : null}

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
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
      <Pressable onPress={() => onStep(-1)} hitSlop={12}>
        <Text style={{ color: ink, fontSize: 22 }}>⊖</Text>
      </Pressable>
      <Text style={{ color: ink, fontSize: 13, minWidth: 34, textAlign: 'center' }}>{label}</Text>
      <Pressable onPress={() => onStep(1)} hitSlop={12}>
        <Text style={{ color: ink, fontSize: 22 }}>⊕</Text>
      </Pressable>
    </View>
  );
}

/** A control that says what it is, what it is set to, and that it opens. */
function Dropdown({ name, value, muted, open, palette, onPress }: {
  name: string;
  value: string;
  /** Set, but not what this chapter can show. */
  muted?: boolean;
  open: boolean;
  palette: (typeof readingThemes)[ReadingTheme];
  onPress: () => void;
}) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={[styles.label, { color: palette.dim, marginTop: 0 }]}>{name}</Text>
      <Pressable
        onPress={onPress}
        style={[
          styles.segment,
          { borderColor: open ? palette.accent : palette.text + '33', borderWidth: open ? 2 : 1 },
        ]}
      >
        <Text numberOfLines={1} style={{ color: muted ? palette.dim : palette.text, fontSize: 13 }}>
          {value}  {open ? '⌃' : '⌄'}
        </Text>
      </Pressable>
    </View>
  );
}

/** The options of one dropdown, under its own column and nowhere else. */
function Menu({ shown, options, palette, onPicked }: {
  shown: boolean;
  options: { id: string; label: string; active: boolean; disabled?: boolean; onPress: () => void }[];
  palette: (typeof readingThemes)[ReadingTheme];
  onPicked: () => void;
}) {
  if (!shown) return <View style={{ flex: 1 }} />;
  return (
    <View style={[styles.menu, { borderColor: palette.text + '33' }]}>
      {options.map((option, index) => (
        <Pressable
          key={option.id}
          disabled={option.disabled}
          onPress={() => {
            option.onPress();
            onPicked();
          }}
          style={[
            styles.menuItem,
            index < options.length - 1 && {
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderColor: palette.text + '22',
            },
          ]}
        >
          <Text
            numberOfLines={1}
            style={{
              color: option.disabled
                ? palette.dim
                : option.active
                  ? palette.accent
                  : palette.text,
              fontSize: 13,
              flex: 1,
            }}
          >
            {option.label}
          </Text>
          {option.active && !option.disabled ? (
            <Text style={{ color: palette.accent, fontSize: 13 }}>✓</Text>
          ) : null}
        </Pressable>
      ))}
    </View>
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
  divider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', marginVertical: space.xs },
  stepperRow: {
    flex: 1,
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
    alignItems: 'center',
    paddingVertical: space.sm + 2,
    borderRadius: radius.sm,
  },
  /** Unfolds in its own column, so it is obvious which control it belongs to. */
  menu: {
    flex: 1,
    marginTop: space.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
  },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.sm + 2 },
});
