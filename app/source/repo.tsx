import { useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router, Stack } from '../../src/navigation/router';
import { useTranslation } from 'react-i18next';

import { choose } from '../../src/sources/chosen';
import { searchUrl } from '../../src/sources/repo';
import { RepoError, resolveRepoBible, type RepoEdition } from '../../src/sources/repoBible';
import { Hint, PrimaryAction, Row, Section } from '../../src/ui/primitives';
import { space, usePalette } from '../../src/theme';

/**
 * Two fields, in the order the job is actually done. The editions people ask
 * for by name — NIV, NKJV, 和合本修訂 — are the ones no catalog may carry, and
 * looking for them is a search somebody else's site does better than we could:
 * so the first field opens that search in the browser, and the second takes
 * back the link they found.
 *
 * What comes back is somebody's repository, not a publisher's feed. This says
 * what it found and how big it is before anything is fetched, because that is
 * the only thing standing between a reader and an accidental 200 MB.
 */
export default function FindInRepo() {
  const { t } = useTranslation();
  const palette = usePalette();
  const [query, setQuery] = useState('');
  const [link, setLink] = useState('');
  const [found, setFound] = useState<RepoEdition | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function read() {
    setBusy(true);
    setProblem(null);
    setFound(null);
    try {
      setFound(await resolveRepoBible(link));
    } catch (error) {
      setProblem(
        error instanceof RepoError
          ? t(`repo.err_${error.code}`, { detail: error.detail ?? '' })
          : t('repo.err_offline', { detail: '' })
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      <Stack.Screen options={{ title: t('repo.title'), headerBackTitle: ' ' }} />

      <Section title={t('repo.searchTitle')}>
        <View style={[styles.box, { borderColor: palette.border }]}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('repo.searchPlaceholder')}
            placeholderTextColor={palette.faint}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={() => Linking.openURL(searchUrl(query))}
            style={[styles.input, { color: palette.text, borderColor: palette.border }]}
          />
        </View>
        <Row
          label={t('repo.searchGo')}
          detail={t('repo.searchWhat')}
          value="›"
          onPress={() => Linking.openURL(searchUrl(query))}
          last
        />
      </Section>
      <Hint>{t('repo.searchHint')}</Hint>

      <Section title={t('repo.linkTitle')}>
        <View style={[styles.box, { borderColor: palette.border }]}>
          <TextInput
            value={link}
            onChangeText={(next) => {
              setLink(next);
              // A different link is a different answer; the old one stops being one.
              setFound(null);
              setProblem(null);
            }}
            placeholder="https://github.com/…"
            placeholderTextColor={palette.faint}
            autoCapitalize="none"
            autoCorrect={false}
            multiline
            style={[styles.input, { color: palette.text, borderColor: palette.border }]}
          />
        </View>
        <Row
          label={busy ? t('repo.reading') : t('repo.read')}
          detail={problem ?? t('repo.readWhat')}
          alarm={Boolean(problem)}
          value={busy ? undefined : '›'}
          onPress={busy || !link.trim() ? undefined : read}
          last
        />
        {busy ? <ActivityIndicator style={{ paddingVertical: space.md }} /> : null}
      </Section>
      <Hint>{t('repo.formats')}</Hint>

      {found ? (
        <>
          <Section title={t('repo.foundTitle')}>
            <Row
              label={found.title}
              detail={`${found.ref.owner}/${found.ref.repo}`}
              value={t('repo.fileCount', { count: found.files.length })}
            />
            <Row
              label={t('repo.size')}
              detail={found.files.length > 1 ? t('repo.perBook') : found.files[0]}
              value={sizeOf(found.bytes)}
              last
            />
          </Section>
          <Hint>{t('repo.yours')}</Hint>
          <PrimaryAction
            label={t('repo.use')}
            onPress={() => {
              choose({ source: 'repo', edition: found });
              router.back();
            }}
            style={{ marginTop: space.lg }}
          />
        </>
      ) : null}
    </ScrollView>
  );
}

function sizeOf(bytes: number): string {
  if (!bytes) return '—';
  return bytes >= 1_000_000
    ? `${(bytes / 1_000_000).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1000))} KB`;
}

const styles = StyleSheet.create({
  /** A field is a row of the card, ruled off from the row under it. */
  box: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.lg,
  },
  input: { paddingVertical: space.md, fontSize: 16 },
});
