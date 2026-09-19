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
import { router, Stack, useFocusEffect, useLocalSearchParams } from '../src/navigation/router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import { bookKinds, DEFAULT_KIND, kindOf } from '../src/books/kinds';
import {
  enqueueGutenberg,
  enqueueImport,
  enqueuePaper,
  enqueueStandardEbook,
  enqueueTranslation,
} from '../src/import/queue';
import { pickManuscript } from '../src/import/sources/picker';
import { fetchManuscript, FetchError } from '../src/import/sources/url';
import { supportedExtensions } from '../src/import/registry';
import { readCatalog, refreshCatalog, type Catalog } from '../src/sources/ebible';
import {
  fetchGutenbergIndex,
  readGutenbergBook,
  type GutenbergEdition,
} from '../src/sources/gutenberg';
import {
  fetchStandardEbooksIndex,
  StandardEbooksError,
  testStandardEbooks,
} from '../src/sources/standardEbooks';
import {
  forgetStandardEbooksEmail,
  saveStandardEbooksEmail,
  standardEbooksEmail,
} from '../src/sources/standardEbooksEmail';
import { indexState, replaceIndex, type IndexState } from '../src/sources/catalog';
import { authorLine } from '../src/sources/arxiv';
import { sourcesFor } from '../src/sources/registry';
import { takeChoice, type Choice } from '../src/sources/chosen';
import { esvKey, forgetEsvKey, saveEsvKey } from '../src/sources/esvKey';
import { addEsvBook, ESV_SOURCE, ESV_TITLE } from '../src/sources/esvBook';
import { clearCached, countCached } from '../src/sources/passages';
import { EsvError, lookUpEsv } from '../src/sources/esv';
import { findRemoteBook } from '../src/db/repo';
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
  /** Folded until asked for: to anyone without a key it is four rows of no. */
  const [esvShown, setEsvShown] = useState(false);
  /** Which source blocks are open; each is its own question. */
  const [openSources, setOpenSources] = useState<Set<string>>(new Set());
  const [esvDraft, setEsvDraft] = useState('');
  const [esvTested, setEsvTested] = useState<string | null>(null);
  /** Tested and answered, not merely present: a refused key buys 1,189 empty chapters. */
  const [esvOk, setEsvOk] = useState(false);
  /** The last four characters of what is actually stored — enough to tell two
   *  keys apart without ever showing one. */
  const [esvTail, setEsvTail] = useState('');
  const [esvBusy, setEsvBusy] = useState(false);
  const [esvOnShelf, setEsvOnShelf] = useState<string | null>(null);
  const [esvSaved, setEsvSaved] = useState(0);
  /** The other source that is nobody's to give away: a membership, not a key. */
  const [seEmail, setSeEmail] = useState<string | null>(null);
  const [seOpen, setSeOpen] = useState(false);
  const [seDraft, setSeDraft] = useState('');
  const [seTested, setSeTested] = useState<string | null>(null);
  const [seOk, setSeOk] = useState(false);
  const [seBusy, setSeBusy] = useState(false);

  function toggleSource(id: string) {
    setOpenSources((was) => {
      const next = new Set(was);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const kind = kindOf(kindId);
  const sources = sourcesFor(kind.sources);
  const wantsCatalog = kind.sources.includes('ebible');
  const wantsStandardEbooks = kind.sources.includes('standardebooks');

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
        } else if (id === 'standardebooks') {
          const rows = await fetchStandardEbooksIndex(await standardEbooksEmail());
          await replaceIndex('standardebooks', rows, (done, total) =>
            setUpdateFraction(total ? done / total : 0)
          );
        }
        await readStates();
      } catch (problem) {
        setCatalogError(
          problem instanceof StandardEbooksError
            ? t(`add.se_${problem.code}`)
            : t('add.updateFailed')
        );
      } finally {
        setUpdating(null);
      }
    },
    [readStates, t]
  );

  useEffect(() => {
    if (!wantsCatalog) return;
    esvKey().then((token) => {
      setEsvKeyed(Boolean(token));
      setEsvTail(token ? token.slice(-4) : '');
    });
    findRemoteBook(ESV_SOURCE).then((found) => setEsvOnShelf(found?.id ?? null));
    countCached(ESV_SOURCE).then(setEsvSaved);
  }, [wantsCatalog]);

  useEffect(() => {
    if (!wantsStandardEbooks) return;
    standardEbooksEmail().then(setSeEmail);
  }, [wantsStandardEbooks]);

  /** The root feed, which is the cheapest question their door answers. */
  async function testSeEmail() {
    setSeBusy(true);
    setSeTested(null);
    try {
      await testStandardEbooks(await standardEbooksEmail());
      setSeOk(true);
    } catch (problem) {
      setSeOk(false);
      setSeTested(
        t(`add.se_${problem instanceof StandardEbooksError ? problem.code : 'offline'}`)
      );
    } finally {
      setSeBusy(false);
    }
  }

  /** One verse, which is how you find out whether a key works at all. */
  async function testEsvKey() {
    setEsvBusy(true);
    setEsvTested(null);
    try {
      await lookUpEsv('John 1:1', await esvKey());
      setEsvOk(true);
      setEsvTested(null);
    } catch (problem) {
      setEsvOk(false);
      setEsvTested(t(`lookup.${problem instanceof EsvError ? problem.code : 'offline'}`));
    } finally {
      setEsvBusy(false);
    }
  }

  /**
   * The whole book at once, and none of its words. Every chapter is known in
   * advance, so the shelf gets a bible with its structure and fetches each
   * chapter as it is opened.
   */
  async function putEsvOnShelf() {
    setEsvBusy(true);
    try {
      const existing = await findRemoteBook(ESV_SOURCE);
      const bookId = existing?.id ?? (await addEsvBook());
      setEsvOnShelf(bookId);
      router.replace(`/book/${bookId}`);
    } finally {
      setEsvBusy(false);
    }
  }

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
      else if (choice.source === 'standardebooks') id = enqueueStandardEbook(choice.book, kindId);
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
      automaticallyAdjustKeyboardInsets
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

      {/* What the reader already has, and the two doors that need no source
          at all. A file and a link are the same act: bring this in. */}
      {kind.sources.includes('files') || kind.sources.includes('link') ? (
        <Section title={t('add.directImport')}>
          {file ? (
            <Row
              label={file.name}
              value={t('add.chosen')}
              detail={t('add.changeFile')}
              onPress={chooseFile}
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
      ) : null}

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

      {/* One block per project, folded. A source is a list to keep, not a
          website to interrogate — so what it offers (fetch the list, search
          what you have, hand over a credential) belongs together, under the
          name of the project it belongs to. */}
      {!file
        ? sources.map((source) => {
            const state = states[source.id];
            const busyHere = updating === source.id;
            // A source whose door is shut says so on the folded row, so the
            // block is not opened to find out.
            const locked = Boolean(source.credential) && !seEmail;
            const open = openSources.has(source.id);
            return (
              <Section key={source.id} title={t(`source.${source.id}`)}>
                <Row
                  label={t(`source.${source.id}Detail`)}
                  detail={
                    locked
                      ? t('add.seNeedsEmail')
                      : source.indexed
                        ? state
                          ? t('add.indexAsOf', {
                              count: state.count,
                              date: new Date(state.fetchedAt).toLocaleDateString(i18n.language),
                            })
                          : t('add.indexMissing')
                        : undefined
                  }
                  value={`${locked ? t('add.sourceClosed') : ''}  ${open ? '▴' : '▾'}`}
                  onPress={() => toggleSource(source.id)}
                  last={!open}
                />
                {open ? (
                  <>
                    {/* The credential first: nothing under it works without one. */}
                    {source.credential ? (
                      <>
                        <Row
                          label={t('add.seEmailRow')}
                          detail={seEmail ?? t('add.seWhy')}
                          value={seEmail ? t('add.seSet') : t('add.seNotSet')}
                          onPress={() => setSeOpen((was) => !was)}
                        />
                        {seOpen ? (
                          <View style={[styles.keyBox, { borderColor: palette.border }]}>
                            <TextInput
                              value={seDraft}
                              onChangeText={setSeDraft}
                              placeholder={t('add.seEmailPlaceholder')}
                              placeholderTextColor={palette.faint}
                              autoCapitalize="none"
                              autoCorrect={false}
                              autoFocus
                              keyboardType="email-address"
                              style={[styles.input, { color: palette.text, borderColor: palette.border }]}
                            />
                            <Text style={{ color: palette.dim, fontSize: 12 }}>
                              {t('add.seStaysHere')}
                            </Text>
                            <Pressable
                              onPress={() => {
                                if (!seDraft.trim()) return;
                                saveStandardEbooksEmail(seDraft).then(async () => {
                                  setSeEmail(await standardEbooksEmail());
                                  setSeDraft('');
                                  setSeOpen(false);
                                  setSeOk(false);
                                  void testSeEmail();
                                });
                              }}
                              style={styles.fetch}
                            >
                              <Text style={{ color: palette.accent, fontSize: 16 }}>
                                {t('add.seSave')}
                              </Text>
                            </Pressable>
                          </View>
                        ) : null}
                        {seEmail ? (
                          <Row
                            label={t('add.seTest')}
                            detail={seTested ?? undefined}
                            alarm={Boolean(seTested)}
                            value={
                              seBusy
                                ? t('add.seTesting')
                                : seOk
                                  ? t('add.seWorks')
                                  : seTested
                                    ? t('add.seRetest')
                                    : t('add.seTestNow')
                            }
                            onPress={seBusy ? undefined : testSeEmail}
                          />
                        ) : null}
                      </>
                    ) : null}

                    {/* `apt update`, one source at a time, on the reader's say-so.
                        Shown even when it can't run yet: a row that says what it
                        is waiting for is the way to a book, and a row that isn't
                        there is a dead end. */}
                    {source.indexed ? (
                      <Row
                        label={t('add.listRow')}
                        detail={
                          state
                            ? t('add.indexAsOf', {
                                count: state.count,
                                date: new Date(state.fetchedAt).toLocaleDateString(i18n.language),
                              })
                            : t('add.indexMissing')
                        }
                        value={
                          locked
                            ? t('add.seNeedsEmail')
                            : busyHere
                              ? updateFraction
                                ? `${Math.round(updateFraction * 100)}%`
                                : t('add.updating')
                              : state
                                ? t('add.update')
                                : t('add.getList')
                        }
                        onPress={locked || updating ? undefined : () => update(source.id)}
                      />
                    ) : null}

                    {/* Searching reads the kept list off the device — so it says
                        which of the two steps above is still owed. */}
                    {source.indexed ? (
                      <Row
                        label={t('add.searchList')}
                        value={
                          locked
                            ? t('add.seNeedsEmail')
                            : state
                              ? '›'
                              : t('add.listFirst')
                        }
                        onPress={
                          locked || !state
                            ? undefined
                            : () =>
                                router.push({
                                  pathname: '/source/find',
                                  params: { kind: kindId, source: source.id },
                                })
                        }
                        last={!source.find && !(source.credential && seEmail)}
                      />
                    ) : null}

                    {/* A source with a page of its own: a firehose to query, or
                        a shelf of editions to pick from. */}
                    {source.find && !locked ? (
                      <Row
                        label={t('add.browse')}
                        detail={source.indexed ? undefined : t(`source.${source.id}Hint`)}
                        value="›"
                        onPress={() =>
                          router.push({ pathname: source.find!, params: { kind: kindId } })
                        }
                        last={!(source.credential && seEmail)}
                      />
                    ) : null}

                    {source.credential && seEmail ? (
                      <Row
                        label={t('add.seForget')}
                        onPress={() =>
                          forgetStandardEbooksEmail().then(() => {
                            setSeEmail(null);
                            setSeOpen(false);
                            setSeTested(null);
                            setSeOk(false);
                          })
                        }
                        danger
                        last
                      />
                    ) : null}
                  </>
                ) : null}
              </Section>
            );
          })
        : null}
      {wantsStandardEbooks && !file && openSources.has('standardebooks') ? (
        <Hint>{t('add.seHowToGet')}</Hint>
      ) : null}

      {/* A licensed edition cannot be a row beside the others, because there is
          no file to fetch — but this is exactly where someone looking for it
          will look, so this is where it says so. */}
      {wantsCatalog && !file ? (
        <Section title={t('add.esvTitle')}>
          {/* One row until it is asked for: what it is, where it stands, and a
              tap that opens the rest. */}
          <Row
            label={ESV_TITLE}
            detail={t('add.esvWhy')}
            value={`${
              esvOnShelf
                ? t('add.esvOnShelf')
                : esvKeyed
                  ? t('add.esvKeySet', { tail: esvTail })
                  : t('add.esvKeyNone')
            }  ${esvShown ? '▴' : '▾'}`}
            onPress={() => setEsvShown((was) => !was)}
            last={!esvShown}
          />
          {esvShown ? (
            <>
              <Row
                label={t('add.esvKeyRow')}
                value={esvKeyed ? t('add.esvKeySet', { tail: esvTail }) : t('add.esvKeyNone')}
                onPress={() => setEsvOpen((was) => !was)}
              />
              {/* Under the row it belongs to, inside the same card: a field that
                  opens a screen away from what was tapped reads as a different
                  question. */}
              {esvOpen ? (
                <View style={[styles.keyBox, { borderColor: palette.border }]}>
                  <TextInput
                    value={esvDraft}
                    onChangeText={setEsvDraft}
                    placeholder={t('lookup.paste')}
                    placeholderTextColor={palette.faint}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoFocus
                    style={[styles.input, { color: palette.text, borderColor: palette.border }]}
                  />
                  <Text style={{ color: palette.dim, fontSize: 12 }}>{t('lookup.keyStaysHere')}</Text>
                  <Pressable
                    onPress={() => {
                      if (!esvDraft.trim()) return;
                      saveEsvKey(esvDraft).then(async () => {
                        setEsvKeyed(true);
                        setEsvTail(((await esvKey()) ?? '').slice(-4));
                        setEsvDraft('');
                        setEsvOpen(false);
                        setEsvOk(false);
                        void testEsvKey();
                      });
                    }}
                    style={styles.fetch}
                  >
                    <Text style={{ color: palette.accent, fontSize: 16 }}>{t('lookup.save')}</Text>
                  </Pressable>
                </View>
              ) : null}
              {esvKeyed ? (
                <Row
                  label={t('add.esvTest')}
                  // Why it failed is a sentence, and a sentence goes under the
                  // label rather than into the narrow column beside it.
                  detail={esvTested ?? undefined}
                  alarm={Boolean(esvTested)}
                  value={
                    esvBusy
                      ? t('add.esvTesting')
                      : esvOk
                        ? t('add.esvKeyWorks')
                        : esvTested
                          ? t('add.esvRetest')
                          : t('add.esvTestNow')
                  }
                  onPress={esvBusy ? undefined : testEsvKey}
                />
              ) : null}
              {/* A book of 1,189 chapters that can never fetch one is worse than no
                  book at all, so this waits for the key to have answered. */}
              <Row
                label={esvOnShelf ? t('add.esvOnShelf') : t('add.esvAdd', { title: ESV_TITLE })}
                detail={esvOnShelf ? undefined : t('add.esvAddWhat')}
                value={
                  esvOnShelf || esvOk
                    ? '›'
                    : esvKeyed
                      ? t('add.esvTestFirst')
                      : t('add.esvNeedsKey')
                }
                onPress={
                  esvBusy || !(esvOk || esvOnShelf)
                    ? undefined
                    : esvOnShelf
                      ? () => router.replace(`/book/${esvOnShelf}`)
                      : putEsvOnShelf
                }
                last={!esvKeyed}
              />
              {esvSaved ? (
                <Row
                  label={t('lookup.savedCount', { count: esvSaved })}
                  detail={t('lookup.savedHint')}
                  value={t('lookup.clear')}
                  onPress={() => clearCached(ESV_SOURCE).then(() => setEsvSaved(0))}
                />
              ) : null}
              {esvKeyed ? (
                <Row
                  label={t('lookup.forget')}
                  onPress={() =>
                    forgetEsvKey().then(() => {
                      setEsvKeyed(false);
                      setEsvOpen(false);
                      setEsvTested(null);
                      setEsvOk(false);
                      setEsvTail('');
                    })
                  }
                  danger
                  last
                />
              ) : null}
            </>
          ) : null}
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

            {choice.source === 'standardebooks' ? (
              <Row
                label={choice.book.title}
                detail={choice.book.author || undefined}
                value={t('source.standardebooks')}
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
  if (choice.source === 'standardebooks') {
    // Stated once, in the list, and carried here unaltered — there is no
    // second feed to re-read it from.
    const stated = [choice.book.language, choice.book.rights].filter(Boolean).join(' · ');
    return `${stated}\n${t('add.standardebooksWhat')}`;
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
  /** Inside the card, under its row, separated by a rule rather than a gap. */
  keyBox: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
  },
  commit: {
    marginTop: space.xl,
    paddingVertical: space.lg,
    borderRadius: radius.md,
    alignItems: 'center',
  },
});
