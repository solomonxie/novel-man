import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import { bookKinds, DEFAULT_KIND, kindOf } from '../src/books/kinds';
import { enqueueImport, enqueueTranslation } from '../src/import/queue';
import { pickManuscript } from '../src/import/sources/picker';
import { fetchManuscript, FetchError } from '../src/import/sources/url';
import { supportedExtensions } from '../src/import/registry';
import { readCatalog, refreshCatalog, type Catalog, type Translation } from '../src/scripture/ebible';
import { Hint, Row, Section } from '../src/ui/primitives';
import { PickerSheet } from '../src/ui/PickerSheet';
import { radius, space, usePalette } from '../src/theme';

/**
 * The kind comes first because it decides everything under it: which sources
 * are worth offering, what else to ask, and what the book page will be. Rows
 * appear as they become answerable — one page, not a wizard, same as the shelf
 * it was opened from.
 */
export default function AddBook() {
  const { kind: kindParam, translation: translationParam } = useLocalSearchParams<{
    kind?: string;
    translation?: string;
  }>();
  const { t, i18n } = useTranslation();
  const palette = usePalette();

  const [kindId, setKindId] = useState(kindParam ?? DEFAULT_KIND);
  const [file, setFile] = useState<{ uri: string; name: string } | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [updating, setUpdating] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [translation, setTranslation] = useState<Translation | null>(null);
  const [apocrypha, setApocrypha] = useState(false);
  const [canonOpen, setCanonOpen] = useState(false);

  const kind = kindOf(kindId);
  const wantsScripture = kind.sources.includes('scripture');

  const update = useCallback(async () => {
    setUpdating(true);
    setCatalogError(null);
    try {
      setCatalog(await refreshCatalog());
    } catch {
      setCatalogError(t('add.updateFailed'));
    } finally {
      setUpdating(false);
    }
  }, [t]);

  useEffect(() => {
    if (!wantsScripture || catalog) return;
    const cached = readCatalog();
    if (cached) setCatalog(cached);
    else void update();
  }, [wantsScripture, catalog, update]);

  // Coming back from the translation list, which replaces this page rather
  // than stacking a second one on top of it.
  useEffect(() => {
    if (!translationParam || !catalog) return;
    const found = catalog.translations.find((entry) => entry.id === translationParam);
    if (found) setTranslation(found);
  }, [translationParam, catalog]);

  async function chooseFile() {
    try {
      const picked = await pickManuscript();
      if (picked) setFile(picked);
    } catch (error) {
      Alert.alert(t('import.failed'), String(error));
    }
  }

  async function fetchLink() {
    setLinkError(null);
    setBusy(true);
    try {
      const fetched = await fetchManuscript(link);
      setLink('');
      setLinkOpen(false);
      setFile(fetched);
    } catch (error) {
      setLinkError(describeFetch(error, t));
    } finally {
      setBusy(false);
    }
  }

  const ready = wantsScripture && translation ? true : file !== null;

  function commit() {
    if (wantsScripture && translation && !file) enqueueTranslation(translation, apocrypha);
    else if (file) enqueueImport({ ...file, kind: kindId });
    else return;
    router.back();
  }

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen options={{ title: t('add.title'), headerBackTitle: ' ' }} />

      <Section title={t('add.kindTitle')} flush>
        <View style={styles.chips}>
          {bookKinds.map((entry) => {
            const on = entry.id === kindId;
            return (
              <Pressable
                key={entry.id}
                onPress={() => {
                  setKindId(entry.id);
                  // A file already chosen still applies; a translation only
                  // means anything to the kind that asked for one.
                  if (!kindOf(entry.id).sources.includes('scripture')) setTranslation(null);
                }}
                style={[
                  styles.chip,
                  { borderColor: on ? palette.accent : palette.border },
                  on && { backgroundColor: palette.soft },
                ]}
              >
                <Text style={{ color: on ? palette.accent : palette.text, fontSize: 15 }}>
                  {t(`kind.${entry.id}`)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Section>
      <Hint>{t(`kind.${kindId}Hint`)}</Hint>

      <Section title={t('add.whereFrom')}>
        {file ? (
          <Row
            label={file.name}
            value={t('add.chosen')}
            detail={t('add.changeFile')}
            onPress={chooseFile}
            last={!wantsScripture || translation !== null}
          />
        ) : null}
        {wantsScripture ? (
          <Row
            label={t('add.sourceEbible')}
            detail={
              catalog
                ? t('add.catalogAsOf', {
                    count: catalog.translations.length,
                    date: new Date(catalog.fetchedAt).toLocaleDateString(i18n.language),
                  })
                : t('add.noCatalog')
            }
            value={updating ? t('add.updating') : t('add.update')}
            onPress={updating ? undefined : update}
            last={false}
          />
        ) : null}
        {kind.sources.includes('files') && !file ? (
          <Row
            label={t('shelf.fromFiles')}
            detail={supportedExtensions.map((extension) => `.${extension}`).join(' ')}
            onPress={chooseFile}
            last={!kind.sources.includes('link')}
          />
        ) : null}
        {kind.sources.includes('link') && !file ? (
          <Row
            label={t('shelf.fromLink')}
            detail={t('shelf.fromLinkHint')}
            onPress={() => setLinkOpen((was) => !was)}
            last
          />
        ) : null}
      </Section>

      {linkOpen && !file ? (
        <View style={[styles.link, { borderColor: palette.border, backgroundColor: palette.surface }]}>
          <TextInput
            value={link}
            onChangeText={setLink}
            placeholder="https://…"
            placeholderTextColor={palette.faint}
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.input, { color: palette.text, borderColor: palette.border }]}
          />
          <Text style={{ color: palette.dim, fontSize: 12 }}>{t('shelf.linkHint')}</Text>
          {linkError ? (
            <Text style={{ color: palette.danger, fontSize: 13, marginTop: space.sm }}>
              {linkError}
            </Text>
          ) : null}
          <Pressable onPress={fetchLink} disabled={busy} style={styles.fetch}>
            {busy ? (
              <ActivityIndicator />
            ) : (
              <Text style={{ color: palette.accent, fontSize: 16 }}>{t('shelf.fetch')}</Text>
            )}
          </Pressable>
        </View>
      ) : null}

      {catalogError ? <Hint>{catalogError}</Hint> : null}

      {wantsScripture && !file ? (
        <>
          <Section title={t('add.about')}>
            <Row
              label={t('add.translation')}
              value={translation ? `${translation.title}  ›` : `${t('add.choose')}  ›`}
              detail={translation ? `${translation.language} · ${translation.copyright}` : undefined}
              onPress={
                catalog
                  ? () => router.push({ pathname: '/scripture/translations', params: { kind: kindId } })
                  : undefined
              }
              last={!translation || translation.extraBooks === 0}
            />
            {/* One question, and only where the edition has a second answer. */}
            {translation && translation.extraBooks > 0 ? (
              <Row
                label={t('add.canon')}
                value={apocrypha
                  ? t('add.canonAll', { count: translation.extraBooks })
                  : t('add.canon66')}
                onPress={() => setCanonOpen(true)}
                last
              />
            ) : null}
          </Section>
          {translation ? (
            <Hint>
              {t('add.willGet', {
                books: apocrypha ? translation.books : translation.books - translation.extraBooks,
                chapters: translation.chapters,
                verses: translation.verses,
              })}
              {'\n'}
              {t('add.structureIncluded')}
            </Hint>
          ) : null}
        </>
      ) : null}

      <Pressable
        onPress={commit}
        disabled={!ready}
        style={[
          styles.commit,
          { backgroundColor: ready ? palette.accent : palette.sunken },
        ]}
      >
        <Text
          style={{
            color: ready ? palette.onAccent : palette.faint,
            fontSize: 17,
            fontWeight: '600',
          }}
        >
          {wantsScripture && translation && !file ? t('add.install') : t('add.commit')}
        </Text>
      </Pressable>
      <Hint>{t('add.free')}</Hint>

      <PickerSheet
        visible={canonOpen}
        title={t('add.canon')}
        options={[
          { id: 'protestant', label: t('add.canon66') },
          {
            id: 'all',
            label: t('add.canonAll', { count: translation?.extraBooks ?? 0 }),
            detail: t('add.canonAllHint'),
          },
        ]}
        selectedId={apocrypha ? 'all' : 'protestant'}
        onPick={(choice) => {
          setApocrypha(choice === 'all');
          setCanonOpen(false);
        }}
        onClose={() => setCanonOpen(false)}
      />
    </ScrollView>
  );
}

function describeFetch(error: unknown, t: TFunction): string {
  if (error instanceof FetchError) {
    if (error.code === 'sign-in') return t('shelf.linkSignIn');
    if (error.code === 'unsupported') return t('import.unsupported', { ext: error.detail });
  }
  return t('shelf.linkFailed');
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, padding: space.md },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  link: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: space.lg,
    marginTop: space.sm,
  },
  input: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: space.sm,
    fontSize: 16,
    marginBottom: space.sm,
  },
  fetch: { paddingVertical: space.md, alignItems: 'center' },
  commit: {
    marginTop: space.xl,
    paddingVertical: space.lg,
    borderRadius: radius.md,
    alignItems: 'center',
  },
});
