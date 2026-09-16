import { ScrollView, Text } from 'react-native';
import { Stack, router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Hint, Row, Section } from '../../src/ui/primitives';
import { setUiLanguage, SUPPORTED, type UiLanguage } from '../../src/i18n';
import { space, usePalette } from '../../src/theme';

const LANGUAGE_LABELS: Record<UiLanguage, string> = { en: 'English', 'zh-Hans': '简体中文' };

export default function Settings() {
  const { t, i18n } = useTranslation();
  const palette = usePalette();

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl }}
    >
      <Stack.Screen options={{ title: t('settings.title'), headerBackTitle: ' ' }} />

      <Section title={t('settings.language')}>
        {SUPPORTED.map((language, index) => (
          <Row
            key={language}
            label={LANGUAGE_LABELS[language]}
            value={i18n.language === language ? '✓' : undefined}
            onPress={() => setUiLanguage(language)}
            last={index === SUPPORTED.length - 1}
          />
        ))}
      </Section>

      <Section title={t('settings.ai')}>
        <Row label={t('settings.ai')} value="›" onPress={() => router.push('/settings/ai-keys')} last />
      </Section>
      <Hint>{t('settings.aiHint')}</Hint>

      <Section title={t('settings.cloud')}>
        <Row label={t('settings.connect')} value={t('settings.notBuilt')} last />
      </Section>
      <Hint>{t('settings.cloudHint')}</Hint>

      <Section title={t('settings.backup')}>
        <Row label="Export bundle…" value={t('settings.notBuilt')} last />
      </Section>
      <Hint>{t('settings.backupHint')}</Hint>

      <Text style={{ height: space.xxl }} />
    </ScrollView>
  );
}
