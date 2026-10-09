import { useCallback, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router, Stack, useFocusEffect } from '../src/navigation/router';
import { useTranslation } from 'react-i18next';
import i18n from '../src/i18n';

import { flaggedCount } from '../src/books/flags';
import { listBooks } from '../src/db/repo';
import { AiKeysSettings } from '../src/settings/AiKeys';
import { BackupSettings } from '../src/settings/Backup';
import { CloudSettings } from '../src/settings/Cloud';
import { DemoModeSettings } from '../src/settings/DemoMode';
import { setUiLanguage, SUPPORTED, type UiLanguage } from '../src/i18n';
import { appearances, setAppearance, useAppearance, type Appearance } from '../src/theme/appearance';
import { openWorkQueue, useWorkFeed } from '../src/ui/WorkQueue';
import { PickerSheet } from '../src/ui/PickerSheet';
import { Row, Section } from '../src/ui/primitives';
import { offers } from '../src/store/scope';
import { space, usePalette } from '../src/theme';

const LANGUAGE_LABELS: Record<UiLanguage, string> = { en: 'English', 'zh-Hans': '简体中文' };

/**
 * Everything that is set rather than read.
 *
 * These were sections of the shelf, on the argument that a page whose only job
 * is holding four rows gets deleted. They outgrew it: keys for seven vendors,
 * a cloud, backups, copies, a demo library, and under all of it the utilities.
 * The shelf had become a settings screen with some books at the top.
 *
 * So all of it lives here, reached by the last row on the shelf, and what
 * stays on the shelf is the shelf.
 *
 * No `onRemoved` on the backups: restoring one changes the library, and the
 * shelf reloads on focus anyway, so coming back from here is the refresh.
 */
export default function SettingsPage() {
  const { t } = useTranslation();
  const palette = usePalette();
  const appearance = useAppearance();
  const work = useWorkFeed();
  const [languageOpen, setLanguageOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  /**
   * The shelf, for one number. Loaded here rather than passed in: the flag
   * count is the whole of what the row says, and a page that reads it itself
   * is right the moment it is opened — including straight after fixing one.
   */
  const [books, setBooks] = useState<Awaited<ReturnType<typeof listBooks>>>([]);

  useFocusEffect(
    useCallback(() => {
      listBooks().then(setBooks).catch(() => undefined);
    }, [])
  );

  const flagged = useMemo(() => flaggedCount(books), [books]);

  const running = work.counts.pending + work.counts.running;

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <Stack.Screen options={{ title: t('settings.title'), headerBackTitle: ' ' }} />
      <ScrollView
        contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}
        keyboardShouldPersistTaps="handled"
      >
        <Section title={t('settings.general')}>
          <Row
            label={t('settings.language')}
            value={LANGUAGE_LABELS[i18n.language as UiLanguage] ?? 'English'}
            onPress={() => setLanguageOpen(true)}
          />
          <Row
            label={t('settings.appearance')}
            value={t(`settings.appearance_${appearance}`)}
            onPress={() => setAppearanceOpen(true)}
          />
          {/* Work is started from a book's own pages and then watched from
              wherever you are — so it needs a door that is always in the same
              place, not only a strip that appears mid-run. */}
          <Row
            label={t('work.open')}
            value={running > 0 ? t('work.busy', { count: running }) : t('work.idle')}
            onPress={openWorkQueue}
            last
          />
        </Section>

        {/* The things you do *to* a library rather than with it. Under the
            preferences because they are rarer still: a Goodreads export
            arrives once, and the flag count is read when something feels
            wrong, not daily.

            Flagged works leads with its number because the number is the
            whole point — a library quietly rots one missing cover at a time,
            and nothing else would ever say so. */}
        <Section title={t('more.utilities')}>
          <Row
            label={t('flags.row')}
            detail={t('flags.rowWhy')}
            value={flagged > 0 ? t('flags.count', { count: flagged }) : t('flags.clear')}
            onPress={() => router.push('/flagged')}
          />
          {offers('goodreads') ? (
            <Row
              label={t('source.goodreads')}
              detail={t('source.goodreadsDetail')}
              value="›"
              onPress={() => router.push('/source/goodreads')}
            />
          ) : null}
          <Row
            label={t('source.csv')}
            detail={t('source.csvDetail')}
            value="›"
            onPress={() => router.push('/source/csv')}
            last
          />
        </Section>

        <AiKeysSettings />
        <CloudSettings />
        <BackupSettings />
        {/* Last, under everything a reader actually sets: this one is for the
            author, and it swaps the whole library. */}
        <DemoModeSettings />
      </ScrollView>

      <PickerSheet
        visible={languageOpen}
        title={t('settings.language')}
        options={SUPPORTED.map((code) => ({ id: code, label: LANGUAGE_LABELS[code] }))}
        selectedId={i18n.language}
        onPick={(code) => {
          setUiLanguage(code as UiLanguage);
          setLanguageOpen(false);
        }}
        onClose={() => setLanguageOpen(false)}
      />

      <PickerSheet
        visible={appearanceOpen}
        title={t('settings.appearance')}
        options={appearances.map((option) => ({
          id: option,
          label: t(`settings.appearance_${option}`),
          detail: option === 'system' ? t('settings.appearanceSystemHint') : undefined,
        }))}
        selectedId={appearance}
        onPick={(option) => {
          setAppearance(option as Appearance);
          setAppearanceOpen(false);
        }}
        onClose={() => setAppearanceOpen(false)}
      />
    </View>
  );
}
