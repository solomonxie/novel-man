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
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import { bookKinds, DEFAULT_KIND, kindOf } from '../src/books/kinds';
import { enqueueGutenberg, enqueueImport, enqueuePaper, enqueueTranslation } from '../src/import/queue';
import { pickManuscript } from '../src/import/sources/picker';
import { fetchManuscript, FetchError } from '../src/import/sources/url';
import { supportedExtensions } from '../src/import/registry';
import { readCatalog, refreshCatalog, type Catalog } from '../src/sources/ebible';
import {
  fetchGutenbergIndex,
  readGutenbergBook,
  type GutenbergEdition,
} from '../src/sources/gutenberg';
import { indexState, replaceIndex, type IndexState } from '../src/sources/catalog';
import { authorLine } from '../src/sources/arxiv';
import { sourcesFor } from '../src/sources/registry';
import { takeChoice, type Choice } from '../src/sources/chosen';
import { esvKey, forgetEsvKey, saveEsvKey } from '../src/sources/esvKey';
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
  const { kind: kindParam } = useLocalSearchParams<{ kind?: string }>();
  const { t, i18n } = useTranslation();
  const palette = usePalette();

  const [kindId, setKindId] = useState(kindParam ?? DEFAULT_KIND);
  const [file, setFile] = useState<{ uri: string; name: string } | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [catalog, setCatalog] = useState<Catalog | null>(null);
  /** What the kept index knows, per source, and which one is being refreshed. */
  const [states, setStates] = useState<Record<string, IndexState | null>>({});
  const [updating, setUpdating] = useState<string | null>(null);
  const [updateFraction, setUpdateFraction] = useState(0);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  /** What came back from a find page: a translation, or a book. */
  const [choice, setChoice] = useState<Choice | null>(null);
  /** Gutenberg states the size and the terms on the book's feed, not the search. */
  const [edition, setEdition] = useState<GutenbergEdition | null>(null);
  const [apocrypha, setApocrypha] = useState(false);
  const [canonOpen, setCanonOpen] = useState(false);
  const [kindOpen, setKindOpen] = useState(false);
  /** The one edition that is asked rather than owned — see `lookup`. */
  const [esvKeyed, setEsvKeyed] = useState(false);
  const [esvOpen, setEsvOpen] = useState(false);
  const [esvDraft, setEsvDraft] = useState('');

  const kind = kindOf(kindId);
  const sources = sourcesFor(kind.sources);
  const indexed = sources.filter((source) => source.indexed);
  const wantsCatalog = kind.sources.includes('ebible');

  const readStates = useCallback(async () => {
    const found: Record<string, IndexState | null> = {};
    for (const source of sources) found[source.id] = await indexState(source.id);
    setStates(found);
  }, [kindId]);

  /** `apt update`, one source at a time, on the reader's say-so. */
  const update = useCallback(
    async (id: string) => {
      setUpdating(id);
      setUpdateFraction(0);
      setCatalogError(null);
      try {
        if (id === 'ebible') setCatalog(await refreshCatalog());
        else if (id === 'gutenberg') {
          const rows = await fetchGutenbergIndex();
          await replaceIndex('gutenberg', rows, (done, total) =>
            setUpdateFraction(total ? done / total : 0)
          );
        }
        await readStates();
      } catch {
        setCatalogError(t('add.updateFailed'));
      } finally {
        setUpdating(null);
      }
    },
    [readStates, t]
  );

  useEffect(() => {
    if (wantsCatalog) esvKey().then((token) => setEsvKeyed(Boolean(token)));
  }, [wantsCatalog]);

  useEffect(() => {
    if (wantsCatalog && !catalog) {
      const cached = readCatalog();
      if (cached) setCatalog(cached);
    }
    void readStates();
  }, [wantsCatalog, catalog, readStates]);


  // A find page hands its answer back by leaving it here and popping itself,
  // so this page takes it on the way back rather than being pushed again.
  useFocusEffect(
    useCallback(() => {
      const taken = takeChoice();
      if (taken) setChoice(taken);
    }, [])
  );

  // What Gutenberg will actually hand over, read once a book is chosen.
  useEffect(() => {
    if (choice?.source !== 'gutenberg') {
      setEdition(null);
      return;
    }
    let live = true;
    readGutenbergBook(choice.book)
      .then((found) => live && setEdition(found))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [choice]);

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

  const fromSource = choice !== null && !file;
  const ready = fromSource || file !== null;

  function commit() {
    let id: string;
    if (fromSource && choice) {
      if (choice.source === 'ebible') id = enqueueTranslation(choice.translation, apocrypha);
      else if (choice.source === 'arxiv') id = enqueuePaper(choice.paper, kindId);
      else id = enqueueGutenberg(choice.book, kindId);
    } else if (file) {
      id = enqueueImport({ ...file, kind: kindId });
    } else {
      return;
    }
    // Somewhere that shows what is happening. Going back to the page you came
    // from reads as nothing having happened at all.
    router.replace(`/job/${id}`);
  }

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen options={{ title: t('add.title'), headerBackTitle: ' ' }} />

      {/* One row, not a row of chips: five kinds laid out flat is a wall of
          buttons for a question with one answer, and the answer is usually the
          one already there. */}
      <Section flush>
        <Row
          label={t('add.kindTitle')}
          detail={t(`kind.${kindId}Hint`)}
          value={`${t(`kind.${kindId}`)}  ▾`}
          onPress={() => setKindOpen(true)}
          last
        />
      </Section>

      <Section title={t('add.whereFrom')}>
        {file ? (
          <Row
            label={file.name}
            value={t('add.chosen')}
            detail={t('add.changeFile')}
            onPress={chooseFile}
            last={false}
          />
        ) : null}
        {/* A source is a list to keep, not a website to interrogate: ⟳ fetches
            it once and the search below reads it off the device. */}
        {sources.map((source) => {
          const state = states[source.id];
          const busyHere = updating === source.id;
          return (
            <Row
              key={source.id}
              label={t(`source.${source.id}`)}
              detail={
                source.indexed
                  ? state
                    ? t('add.indexAsOf', {
                        count: state.count,
                        date: new Date(state.fetchedAt).toLocaleDateString(i18n.language),
                      })
                    : t('add.indexMissing')
                  : t(`source.${source.id}Detail`)
              }
              value={
                source.indexed
                  ? busyHere
                    ? updateFraction
                      ? `${Math.round(updateFraction * 100)}%`
                      : t('add.updating')
                    : state
                      ? t('add.update')
                      : t('add.getList')
                  : `${t('add.find')}  ›`
              }
              onPress={
                source.indexed
                  ? updating
                    ? undefined
                    : () => update(source.id)
                  : () => router.push({ pathname: source.find!, params: { kind: kindId } })
              }
              last={false}
            />
          );
        })}
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

      {/* A licensed edition cannot be a row beside the others, because there is
          no file to fetch — but this is exactly where someone looking for it
          will look, so this is where it says so. */}
      {wantsCatalog && !file ? (
        <Section title={t('add.esvTitle')}>
          <Row
            label={t('lookup.title')}
            detail={t('add.esvWhy')}
            value="›"
            onPress={() => router.push('/lookup')}
          />
          <Row
            label={t('add.esvKeyRow')}
            value={esvKeyed ? t('add.esvKeySet') : t('add.esvKeyNone')}
            onPress={() => setEsvOpen((was) => !was)}
            last={!esvKeyed}
          />
          {esvKeyed ? (
            <Row
              label={t('lookup.forget')}
              onPress={() =>
                forgetEsvKey().then(() => {
                  setEsvKeyed(false);
                  setEsvOpen(false);
                })
              }
              danger
              last
            />
          ) : null}
        </Section>
      ) : null}

      {esvOpen && wantsCatalog && !file ? (
        <View style={[styles.link, { borderColor: palette.border, backgroundColor: palette.surface }]}>
          <TextInput
            value={esvDraft}
            onChangeText={setEsvDraft}
            placeholder={t('lookup.paste')}
            placeholderTextColor={palette.faint}
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.input, { color: palette.text, borderColor: palette.border }]}
          />
          <Text style={{ color: palette.dim, fontSize: 12 }}>{t('lookup.keyStaysHere')}</Text>
          <Pressable
            onPress={() => {
              if (!esvDraft.trim()) return;
              saveEsvKey(esvDraft).then(() => {
                setEsvKeyed(true);
                setEsvDraft('');
                setEsvOpen(false);
              });
            }}
            style={styles.fetch}
          >
            <Text style={{ color: palette.accent, fontSize: 16 }}>{t('lookup.save')}</Text>
          </Pressable>
        </View>
      ) : null}

      {/* A page of its own, not a field down here: a field at the foot of a
          form is a field under the keyboard the moment anyone uses it. */}
      {indexed.length && !file ? (
        <Section>
          <Row
            label={t('add.findTitle')}
            detail={t('add.findAcross', {
              sources: indexed.map((source) => t(`source.${source.id}`)).join(' · '),
            })}
            value="›"
            onPress={() => router.push({ pathname: '/source/find', params: { kind: kindId } })}
            last
          />
        </Section>
      ) : null}

      {fromSource && choice ? (
        <>
          <Section title={t('add.about')}>
            {choice.source === 'ebible' ? (
              <>
                <Row
                  label={t('add.translation')}
                  value={`${choice.translation.abbr}  ›`}
                  detail={`${choice.translation.title} · ${choice.translation.copyright}`}
                  onPress={() => router.push({ pathname: '/source/ebible', params: { kind: kindId } })}
                  last={choice.translation.extraBooks === 0}
                />
                {/* One question, and only where the edition has a second answer. */}
                {choice.translation.extraBooks > 0 ? (
                  <Row
                    label={t('add.canon')}
                    value={
                      apocrypha
                        ? t('add.canonAll', { count: choice.translation.extraBooks })
                        : t('add.canon66')
                    }
                    onPress={() => setCanonOpen(true)}
                    last
                  />
                ) : null}
              </>
            ) : null}

            {choice.source === 'gutenberg' ? (
              <Row
                label={choice.book.title}
                detail={choice.book.author || undefined}
                value={t('source.gutenberg')}
                last
              />
            ) : null}

            {choice.source === 'arxiv' ? (
              <Row
                label={choice.paper.title}
                detail={authorLine(choice.paper) || undefined}
                value={choice.paper.category}
                last
              />
            ) : null}
          </Section>

          <Hint>{aboutLine(choice, { apocrypha, edition }, t)}</Hint>
        </>
      ) : null}

      <Pressable
        onPress={commit}
        disabled={!ready}
        style={[styles.commit, { backgroundColor: ready ? palette.accent : palette.sunken }]}
      >
        <Text
          style={{
            color: ready ? palette.onAccent : palette.faint,
            fontSize: 17,
            fontWeight: '600',
          }}
        >
          {fromSource ? t('add.download') : t('add.commit')}
        </Text>
      </Pressable>
      <Hint>{t('add.free')}</Hint>

      <PickerSheet
        visible={kindOpen}
        title={t('add.kindTitle')}
        selectedId={kindId}
        options={bookKinds.map((entry) => ({
          id: entry.id,
          label: t(`kind.${entry.id}`),
          detail: t(`kind.${entry.id}Hint`),
        }))}
        onPick={(picked) => {
          setKindOpen(false);
          setKindId(picked);
          // A file already chosen still applies; a book chosen from a source
          // this kind doesn't have is no longer an answer.
          if (choice && !kindOf(picked).sources.includes(choice.source)) setChoice(null);
        }}
        onClose={() => setKindOpen(false)}
      />

      <PickerSheet
        visible={canonOpen}
        title={t('add.canon')}
        options={[
          { id: 'protestant', label: t('add.canon66') },
          {
            id: 'all',
            label: t('add.canonAll', {
              count: choice?.source === 'ebible' ? choice.translation.extraBooks : 0,
            }),
            detail: t('add.canonAllHint'),
          },
        ]}
        selectedId={apocrypha ? 'all' : 'protestant'}
        onPick={(picked) => {
          setApocrypha(picked === 'all');
          setCanonOpen(false);
        }}
        onClose={() => setCanonOpen(false)}
      />
    </ScrollView>
  );
}

/** What the source says you will get, in the source's own units. */
function aboutLine(
  choice: Choice,
  state: { apocrypha: boolean; edition: GutenbergEdition | null },
  t: TFunction
): string {
  if (choice.source === 'ebible') {
    const { books, extraBooks, chapters, verses } = choice.translation;
    return `${t('add.willGet', {
      books: state.apocrypha ? books : books - extraBooks,
      chapters,
      verses,
    })}\n${t('add.structureIncluded')}`;
  }
  if (choice.source === 'arxiv') {
    const stated = [choice.paper.published, choice.paper.id, choice.paper.journal]
      .filter(Boolean)
      .join(' · ');
    return `${stated}\n${t('add.paperWhat')}`;
  }
  if (!state.edition) return t('add.reading');
  const stated = [state.edition.language, state.edition.rights, sizeOf(state.edition.bytes)]
    .filter(Boolean)
    .join(' · ');
  return `${stated}\n${t('add.gutenbergWhat')}`;
}

function sizeOf(bytes: number): string {
  if (!bytes) return '';
  return bytes >= 1_000_000
    ? `${(bytes / 1_000_000).toFixed(1)} MB`
    : `${Math.round(bytes / 1000)} KB`;
}

function describeFetch(error: unknown, t: TFunction): string {
  if (error instanceof FetchError) {
    if (error.code === 'sign-in') return t('shelf.linkSignIn');
    if (error.code === 'unsupported') return t('import.unsupported', { ext: error.detail });
  }
  return t('shelf.linkFailed');
}

const styles = StyleSheet.create({
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
