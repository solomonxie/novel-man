import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import { listBooks, type BookListItem } from '../src/db/repo';
import { enqueueImport, subscribeToQueue, type ImportJob } from '../src/import/queue';
import { pickManuscript } from '../src/import/sources/picker';
import { fetchManuscript, FetchError } from '../src/import/sources/url';
import { supportedExtensions } from '../src/import/registry';
import { Cover, Row, Section } from '../src/ui/primitives';
import { AiKeysSettings } from '../src/settings/AiKeys';
import { BackupSettings } from '../src/settings/Backup';
import { CloudSettings } from '../src/settings/Cloud';
import { setUiLanguage, SUPPORTED, type UiLanguage } from '../src/i18n';
import { QueueSheet, QueueStrip } from '../src/ui/ImportQueue';
import { openWorkQueue, useWorkFeed } from '../src/ui/WorkQueue';
import { resumeWorkOnLaunch } from '../src/work/queue';
import { useWorkRefresh } from '../src/work/refresh';
import { PickerSheet } from '../src/ui/PickerSheet';
import { bookKinds } from '../src/books/kinds';
import { formatCount } from '../src/text/counts';
import { matchesBook, searchContent, type ContentHit } from '../src/search/library';
import { backUpIfAuto, restoreOnLaunch } from '../src/backup/icloud';
import { syncOnLaunch } from '../src/cloud/sync';
import { radius, space, usePalette } from '../src/theme';
import { appearances, setAppearance, useAppearance, type Appearance } from '../src/theme/appearance';

/** Two rows of three. Past that it's a scroll, and a scroll needs asking for. */
const VISIBLE = 6;
/** Long enough for the system picker to finish leaving the screen. */
const SHEET_AFTER_PICKER_MS = 350;
const LANGUAGE_LABELS: Record<UiLanguage, string> = { en: 'English', 'zh-Hans': '简体中文' };

export default function Home() {
  const { t, i18n } = useTranslation();
  const palette = usePalette();
  const appearance = useAppearance();
  const { width } = useWindowDimensions();
  const [books, setBooks] = useState<BookListItem[] | null>(null);
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [queueOpen, setQueueOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [pendingSource, setPendingSource] = useState<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  /** A picked file waiting on the one question only a person can answer. */
  const [pendingBook, setPendingBook] = useState<{ uri: string; name: string } | null>(null);
  const [hits, setHits] = useState<ContentHit[]>([]);
  const work = useWorkFeed();

  const refresh = useCallback(() => {
    listBooks().then(setBooks).catch(() => setBooks([]));
  }, []);

  useFocusEffect(refresh);

  useEffect(() => {
    void (async () => {
      // Pull back before pushing up. Backing an empty shelf over a good
      // backup is exactly how a reinstall would lose what it came for.
      const restored = await restoreOnLaunch().catch(() => null);
      if (restored) refresh();
      await backUpIfAuto().catch(() => undefined);
    })();
    syncOnLaunch().catch(() => undefined);
    resumeWorkOnLaunch().catch(() => undefined);
  }, [refresh]);

  // A finished task usually changed something on the shelf.
  useWorkRefresh(refresh);

  useEffect(() => subscribeToQueue((next) => {
    setJobs((previous) => {
      const done = next.filter((job) => job.status === 'done').length;
      if (done !== previous.filter((job) => job.status === 'done').length) refresh();
      return next;
    });
  }), [refresh]);

  async function addFromFiles() {
    try {
      const picked = await pickManuscript();
      // Asked after the file is in hand, not before: the name on screen is
      // most of the answer, and a sheet opened before the system picker is
      // what wedges it on iOS. The wait is the same constraint from the other
      // side — the picker resolves as it starts dismissing, and a modal
      // presented into that animation never appears.
      if (picked) setTimeout(() => setPendingBook(picked), SHEET_AFTER_PICKER_MS);
    } catch (error) {
      Alert.alert(t('import.failed'), String(error));
    }
  }

  // iOS refuses to present the file picker while the sheet is still animating
  // away, and the failed attempt leaves the picker unusable until a reload.
  function runSource(choice: string) {
    if (choice === 'files') void addFromFiles();
    else setLinkOpen(true);
  }

  async function addFromLink() {
    setLinkError(null);
    try {
      const fetched = await fetchManuscript(link);
      setLink('');
      setLinkOpen(false);
      setPendingBook(fetched);
    } catch (error) {
      setLinkError(describeFetch(error, t));
    }
  }

  const library = useMemo(
    () => (query.trim() ? (books ?? []).filter((book) => matchesBook(book, query)) : books ?? []),
    [books, query]
  );

  // Searching inside the manuscripts costs a query per keystroke, so it waits
  // for a pause. Titles filter instantly; the text catches up.
  useEffect(() => {
    if (query.trim().length < 2) {
      setHits([]);
      return;
    }
    const timer = setTimeout(() => {
      searchContent(query).then(setHits).catch(() => setHits([]));
    }, 220);
    return () => clearTimeout(timer);
  }, [query]);

  const gridWidth = Math.floor((width - space.lg * 2 - space.md * 2) / 3);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.bg }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: space.xxl * 2 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.search, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Text style={{ color: palette.faint, fontSize: 15 }}>🔍</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('shelf.search')}
            placeholderTextColor={palette.faint}
            style={{ flex: 1, color: palette.text, fontSize: 16 }}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Text style={{ color: palette.faint, fontSize: 16 }}>✕</Text>
            </Pressable>
          )}
        </View>

        <QueueStrip jobs={jobs} onPress={() => setQueueOpen(true)} />

        {books === null ? (
          <View style={styles.center}><ActivityIndicator /></View>
        ) : (
          <>
            {hits.length > 0 && (
              <View style={{ paddingHorizontal: space.lg, marginTop: space.md }}>
                <Text style={[styles.shelfTitle, { color: palette.text, marginBottom: space.sm }]}>
                  {t('shelf.inTheText', { count: hits.length })}
                </Text>
                {hits.map((hit, index) => (
                  <Pressable
                    key={`${hit.bookId}-${hit.offset}`}
                    onPress={() => router.push(`/reader/${hit.bookId}?at=${hit.offset}`)}
                    style={[
                      styles.hit,
                      { backgroundColor: palette.surface, borderColor: palette.border },
                      index > 0 && { marginTop: space.sm },
                    ]}
                  >
                    <Text numberOfLines={1} style={{ color: palette.dim, fontSize: 12 }}>
                      {hit.title}
                    </Text>
                    <Text numberOfLines={2} style={{ color: palette.text, fontSize: 14, marginTop: 2 }}>
                      {hit.excerpt}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}

            <View style={{ marginTop: space.lg }}>
              <View style={styles.shelfHead}>
                <Text style={[styles.shelfTitle, { color: palette.text }]}>
                  {t('shelf.sectionLibrary')}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
                  {library.length > VISIBLE && (
                    <Pressable onPress={() => setExpanded((was) => !was)} hitSlop={8}>
                      <Text style={{ color: palette.accent, fontSize: 15 }}>
                        {expanded ? t('shelf.less') : t('shelf.more', { count: library.length - VISIBLE })}
                      </Text>
                    </Pressable>
                  )}
                  <Pressable onPress={() => setSourceOpen(true)} hitSlop={12}>
                    <Text style={{ color: palette.accent, fontSize: 26 }}>＋</Text>
                  </Pressable>
                </View>
              </View>

              {books.length === 0 ? (
                <View style={{ paddingHorizontal: space.lg }}>
                  <Text style={{ color: palette.text, fontSize: 16 }}>{t('shelf.empty')}</Text>
                  <Text style={{ color: palette.dim, marginTop: space.xs }}>{t('shelf.emptyHint')}</Text>
                  <Text style={{ color: palette.faint, marginTop: space.xs, fontSize: 12 }}>
                    {supportedExtensions.map((extension) => `.${extension}`).join('  ')}
                  </Text>
                </View>
              ) : library.length === 0 ? (
                <Text style={{ color: palette.dim, paddingHorizontal: space.lg }}>
                  {t('shelf.noMatches')}
                </Text>
              ) : (
                <View style={styles.grid}>
                  {(expanded ? library : library.slice(0, VISIBLE)).map((book) => (
                    <BookTile key={book.id} book={book} width={gridWidth} />
                  ))}
                </View>
              )}
            </View>

            {/* Settings are sections of this page, not destinations behind it.
                A page whose only job is holding four rows gets deleted. */}
            <View style={{ paddingHorizontal: space.lg }}>
              <Text style={[styles.shelfTitle, { color: palette.text, marginTop: space.xxl }]}>
                {t('settings.title')}
              </Text>

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
                {/* Work is started from a book's own pages and then watched
                    from wherever you are — so it needs a door that is always
                    in the same place, not only a strip that appears mid-run. */}
                <Row
                  label={t('work.open')}
                  value={
                    work.counts.pending + work.counts.running > 0
                      ? t('work.busy', { count: work.counts.pending + work.counts.running })
                      : t('work.idle')
                  }
                  onPress={openWorkQueue}
                  last
                />
              </Section>

              <AiKeysSettings />
              <CloudSettings />
              <BackupSettings />
            </View>
          </>
        )}
      </ScrollView>

      <QueueSheet jobs={jobs} visible={queueOpen} onClose={() => setQueueOpen(false)} />

      <PickerSheet
        visible={sourceOpen}
        title={t('shelf.add')}
        options={[
          { id: 'files', label: t('shelf.fromFiles'), detail: supportedExtensions.map((e) => `.${e}`).join(' ') },
          { id: 'link', label: t('shelf.fromLink'), detail: t('shelf.fromLinkHint') },
        ]}
        onPick={(choice) => {
          setSourceOpen(false);
          if (Platform.OS === 'ios') setPendingSource(choice);
          else runSource(choice);
        }}
        onDismiss={() => {
          if (!pendingSource) return;
          runSource(pendingSource);
          setPendingSource(null);
        }}
        onClose={() => setSourceOpen(false)}
      />

      <PickerSheet
        visible={pendingBook !== null}
        title={t('shelf.kindTitle')}
        options={bookKinds.map((kind) => ({
          id: kind.id,
          label: t(`kind.${kind.id}`),
          detail: t(`kind.${kind.id}Hint`),
        }))}
        onPick={(kind) => {
          if (pendingBook) enqueueImport({ ...pendingBook, kind });
          setPendingBook(null);
        }}
        // Dismissing without choosing still imports: the answer has a default,
        // and losing the file over an unanswered question would be worse.
        onClose={() => {
          if (pendingBook) enqueueImport(pendingBook);
          setPendingBook(null);
        }}
      />

      <Modal visible={linkOpen} transparent animationType="fade" onRequestClose={() => setLinkOpen(false)}>
        <Pressable style={[styles.scrim, { backgroundColor: palette.scrim }]} onPress={() => setLinkOpen(false)}>
          <Pressable
            style={[styles.dialog, { backgroundColor: palette.surface, borderColor: palette.border }]}
            onPress={(event) => event.stopPropagation()}
          >
            <Text style={{ color: palette.text, fontSize: 17, fontWeight: '600' }}>
              {t('shelf.fromLink')}
            </Text>
            <TextInput
              value={link}
              onChangeText={setLink}
              placeholder="https://…"
              placeholderTextColor={palette.faint}
              autoCapitalize="none"
              autoCorrect={false}
              style={[
                styles.linkInput,
                { color: palette.text, borderColor: palette.border },
              ]}
            />
            <Text style={{ color: palette.dim, fontSize: 12 }}>{t('shelf.linkHint')}</Text>
            {linkError ? (
              <Text style={{ color: palette.danger, fontSize: 13, marginTop: space.sm }}>{linkError}</Text>
            ) : null}
            <Pressable onPress={addFromLink} style={{ paddingVertical: space.md, alignItems: 'center' }}>
              <Text style={{ color: palette.accent, fontSize: 16 }}>{t('shelf.fetch')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Applies the moment it's picked — the page behind repaints under it. */}
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

      {/* Picking a value never leaves the page. */}
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
    </SafeAreaView>
  );
}

function BookTile({ book, width }: { book: BookListItem; width: number }) {
  const palette = usePalette();
  // A book you've started says how far in you are; one you haven't says how
  // long it is. Both answer "should I open this now?".
  const started = (book.offset ?? 0) > 0;
  return (
    <Pressable onPress={() => router.push(`/book/${book.id}`)} style={{ width }}>
      <Cover title={book.title} hue={book.cover_hue} width={width} path={book.cover_path} />
      <Text numberOfLines={2} style={{ color: palette.text, fontSize: 13, marginTop: space.xs }}>
        {book.title}
      </Text>
      <Text numberOfLines={1} style={{ color: palette.dim, fontSize: 11 }}>
        {started
          ? `${Math.min(99, Math.round(((book.offset ?? 0) / Math.max(1, book.char_count)) * 100))}%`
          : formatCount(book.word_count, book.language)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginHorizontal: space.lg,
    marginTop: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  shelfHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    marginBottom: space.md,
  },
  shelfTitle: { fontSize: 22, fontWeight: '700' },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.md,
    paddingHorizontal: space.lg,
    marginTop: space.md,
  },
  center: { alignItems: 'center', justifyContent: 'center', padding: space.xxl },
  hit: {
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  scrim: { flex: 1, justifyContent: 'center', padding: space.xl },
  dialog: { borderRadius: radius.lg, padding: space.xl, borderWidth: StyleSheet.hairlineWidth },
  linkInput: {
    marginTop: space.lg,
    marginBottom: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
    fontSize: 15,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
});

function describeFetch(error: unknown, t: TFunction): string {
  if (error instanceof FetchError) {
    if (error.code === 'sign-in') return t('shelf.linkSignIn');
    if (error.code === 'unsupported') return t('import.unsupported', { ext: error.detail });
  }
  return t('shelf.linkFailed');
}
