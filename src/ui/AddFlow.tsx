import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import { router, useFocusEffect } from '../navigation/router';
import { DEFAULT_KIND, kindOf, type BookSource } from '../books/kinds';
import {
  enqueueGutenberg,
  enqueueImport,
  enqueuePaper,
  enqueueRepoBible,
  enqueueStandardEbook,
  enqueueTranslation,
} from '../import/queue';
import { pickManuscript } from '../import/sources/picker';
import { fetchManuscript, FetchError } from '../import/sources/url';
import { supportedExtensions } from '../import/registry';
import { readGutenbergBook, type GutenbergEdition } from '../sources/gutenberg';
import { standardEbooksEmail } from '../sources/standardEbooksEmail';
import { indexState, keptIndexes } from '../sources/catalog';
import { SUBJECT_PREFIX } from '../sources/openLibrary';
import { authorLine } from '../sources/arxiv';
import { publicSources } from '../sources/registry';
import { takeChoice, type Choice } from '../sources/chosen';
import { addEsvBook, ESV_SOURCE, ESV_TITLE } from '../sources/esvBook';
import { EsvKeyRows, type EsvKeyState } from '../settings/EsvKey';
import { findRemoteBook } from '../db/repo';
import { keepByHand, keepWork } from '../books/save';
import { queueBookLookup } from '../analysis/runs';
import { hasAnyKey } from '../ai/keys';
import { Row } from './primitives';
import { KindList } from './KindList';
import { OptionRows } from './OptionRows';
import { radius, space, usePalette } from '../theme';

/**
 * Adding a book, as one menu that goes deeper instead of a page of everything.
 *
 * Three levels and never more: what is it, where is it from, and whatever that
 * answer still needs. Each replaces the one before it in the same card, so the
 * menu is always one question tall and going back is going back one answer —
 * a form that shows every row for every path is a form where most rows are
 * about somebody else's book.
 *
 * A catalog is the exception: searching one needs a field, a keyboard and a
 * list, so those open their own page. Everything short — a title, a link, a
 * key — is answered here.
 */

/** The one edition that is nobody's to hand over, and so not a source. */
const ESV = 'esv';

type Door = BookSource | typeof ESV;

/** What a source row leads to: more of this menu, or a page of its own. */
const OWN_PAGE: Partial<Record<BookSource, string>> = {
  gutenberg: '/source/find',
  standardebooks: '/source/find',
  ebible: '/source/ebible',
  repo: '/source/repo',
  arxiv: '/source/arxiv',
  openlibrary: '/source/openlibrary',
  goodreads: '/source/goodreads',
};

/** The order they are offered in: what you already have, then where to look. */
const ORDER: Door[] = [
  'files',
  'link',
  'gutenberg',
  'standardebooks',
  'openlibrary',
  // A bible's own doors, in the order somebody wanting one would try them: the
  // catalog of editions, the one edition that needs a key, then the repository
  // that carries what no catalog is allowed to.
  'ebible',
  ESV,
  'repo',
  'arxiv',
];

export function AddFlow({ kind: initialKind, onStep, onDone }: {
  /** Set when the caller already knows: the menu opens at "where from". */
  kind?: string;
  /** Every level change, so a host that scrolls can keep the menu in view. */
  onStep?: () => void;
  /** Committed — the host closes the menu. */
  onDone?: () => void;
}) {
  const { t } = useTranslation();
  const palette = usePalette();

  const [kindId, setKindId] = useState<string | null>(initialKind ?? null);
  const [sourceId, setSourceId] = useState<Door | null>(null);
  /** Chosen rather than assumed — a record starts on the default and says so. */
  const [kindChosen, setKindChosen] = useState(Boolean(initialKind));
  const [typeOpen, setTypeOpen] = useState(false);

  const [file, setFile] = useState<{ uri: string; name: string } | null>(null);
  const [link, setLink] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');

  const [choice, setChoice] = useState<Choice | null>(null);
  const [edition, setEdition] = useState<GutenbergEdition | null>(null);
  const [apocrypha, setApocrypha] = useState(false);
  const [canonOpen, setCanonOpen] = useState(false);

  const [kept, setKept] = useState<Record<string, number>>({});
  const [seEmail, setSeEmail] = useState<string | null>(null);
  const [esvState, setEsvState] = useState<EsvKeyState>({
    keyed: false, ok: false, busy: false, tail: '',
  });
  const [esvOnShelf, setEsvOnShelf] = useState<string | null>(null);
  /** Whether an AI pass can be offered at all — see the record's own row. */
  const [keyed, setKeyed] = useState(false);

  const kind = kindId ? kindOf(kindId) : null;
  // The ESV is offered wherever eBible is: it is an edition of the same book,
  // and the reason it is not in that catalog is a licence rather than a kind.
  const doors = kind
    ? ORDER.filter((door) =>
        door === ESV ? kind.sources.includes('ebible') : kind.sources.includes(door)
      )
    : [];

  const readKept = useCallback(async () => {
    const counts: Record<string, number> = {};
    for (const source of publicSources) {
      if (source.id === 'openlibrary') {
        const lists = await keptIndexes(`${SUBJECT_PREFIX}:`);
        counts[source.id] = lists.reduce((total, list) => total + list.count, 0);
      } else if (source.indexed) {
        counts[source.id] = (await indexState(source.id))?.count ?? 0;
      }
    }
    setKept(counts);
  }, []);

  // A page opened from here hands its answer back by leaving it where this can
  // take it on the way through.
  useFocusEffect(
    useCallback(() => {
      const taken = takeChoice();
      if (taken) {
        setChoice(taken);
        // Coming back from a catalog's page is arriving at its own level of
        // this menu: what was chosen, and the one button that spends anything.
        setSourceId(taken.source);
      }
      void readKept();
    }, [readKept])
  );

  useEffect(() => {
    hasAnyKey().then(setKeyed).catch(() => undefined);
    standardEbooksEmail().then(setSeEmail).catch(() => undefined);
    findRemoteBook(ESV_SOURCE).then((found) => setEsvOnShelf(found?.id ?? null));
  }, []);

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

  useEffect(() => {
    onStep?.();
    // The host scrolls the new level into view; what changed is the level.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kindId, sourceId, choice, file]);

  function back() {
    setLinkError(null);
    setTypeOpen(false);
    if (sourceId) {
      // A record was reached from the top of the menu, not through a type, so
      // this is the way back to the top.
      if (sourceId === 'record') {
        setKindId(null);
        setKindChosen(false);
      }
      setSourceId(null);
      setChoice(null);
      setFile(null);
      return;
    }
    setKindId(null);
    setKindChosen(false);
  }

  async function chooseFile() {
    try {
      const picked = await pickManuscript();
      if (picked) setFile(picked);
    } catch (problem) {
      Alert.alert(t('import.failed'), String(problem));
    }
  }

  async function fetchLink() {
    setLinkError(null);
    setBusy(true);
    try {
      setFile(await fetchManuscript(link));
      setLink('');
    } catch (problem) {
      setLinkError(describeFetch(problem, t));
    } finally {
      setBusy(false);
    }
  }

  /** Every chapter of a bible is known in advance; none of its words are here. */
  async function putEsvOnShelf() {
    const existing = await findRemoteBook(ESV_SOURCE);
    const bookId = existing?.id ?? (await addEsvBook());
    onDone?.();
    router.push(`/book/${bookId}`);
  }

  const named = title.trim();
  /** What the button will do, and whether there is anything for it to do. */
  const action: 'keep' | 'download' | 'commit' | null =
    choice?.source === 'openlibrary' || (sourceId === 'record' && named.length > 0)
      ? 'keep'
      : choice
        ? 'download'
        : file
          ? 'commit'
          : null;

  /**
   * A record typed from memory knows a title and not much else, and the one
   * thing that can fill the rest in is a model that has read the book. So the
   * form offers it as its own action rather than leaving the reader to find it
   * on the page afterwards — the book is written first either way, because a
   * pass needs something to write its answer onto.
   */
  async function keepAndLookUp() {
    if (!kindId || !named) return;
    onDone?.();
    const id = await keepByHand({ title: named, author, kind: kindId });
    await queueBookLookup(id, named);
    router.push(`/book/${id}`);
  }

  async function commit() {
    if (!kindId) return;
    onDone?.();
    if (choice?.source === 'openlibrary') {
      router.push(`/book/${await keepWork(choice.work, kindId)}`);
      return;
    }
    if (sourceId === 'record' && named) {
      router.push(`/book/${await keepByHand({ title: named, author, kind: kindId })}`);
      return;
    }
    let id: string;
    if (choice) {
      if (choice.source === 'ebible') id = enqueueTranslation(choice.translation, apocrypha);
      else if (choice.source === 'repo') id = enqueueRepoBible(choice.edition);
      else if (choice.source === 'arxiv') id = enqueuePaper(choice.paper, kindId);
      else if (choice.source === 'standardebooks') id = enqueueStandardEbook(choice.book, kindId);
      else if (choice.source === 'gutenberg') id = enqueueGutenberg(choice.book, kindId);
      else return;
    } else if (file) {
      id = enqueueImport({ ...file, kind: kindId });
    } else {
      return;
    }
    // Somewhere that shows what is happening, rather than the page you came from.
    router.push(`/job/${id}`);
  }

  /** ‹ and the answers so far — the only way back up, and the only breadcrumb. */
  function crumb() {
    return (
      <Pressable
        onPress={back}
        style={({ pressed }) => [
          styles.crumb,
          { borderColor: palette.border, backgroundColor: pressed ? palette.sunken : 'transparent' },
        ]}
      >
        <Text style={{ color: palette.accent, fontSize: 17 }}>‹</Text>
        <Text numberOfLines={1} style={{ color: palette.dim, fontSize: 13, flex: 1 }}>
          {[kindId && sourceId !== 'record' && t(`kind.${kindId}`), sourceId && labelOf(sourceId, t)]
            .filter(Boolean)
            .join('  ·  ')}
        </Text>
      </Pressable>
    );
  }

  // Level one. Nothing under it can be offered until this is answered — except
  // the book with nothing to answer about: no file, no catalog, no type that
  // decides which doors are worth showing. It sits under all of them, last.
  if (!kindId || (sourceId === 'record' && !kindChosen)) {
    if (sourceId !== 'record') {
      return (
        <>
          <KindList
            topRule={false}
            onPick={(picked) => {
              setKindChosen(true);
              setKindId(picked);
            }}
          />
          {/* Two doors that are not a type. A shelf brought over from
              somewhere else is a library rather than a book — nothing about it
              answers "what is it" — and a book with nothing behind it has no
              type to decide which doors to offer. Both sit under all of them,
              and the one that fetches nothing is last. */}
          <Row
            label={t('source.goodreads')}
            detail={t('source.goodreadsDetail')}
            value="›"
            onPress={() =>
              router.push({
                pathname: '/source/goodreads',
                params: { kind: DEFAULT_KIND, source: 'goodreads' },
              })
            }
          />
          <Row
            label={t('add.recordSource')}
            detail={t('add.recordWhy')}
            value="⌄"
            onPress={() => {
              setKindId(DEFAULT_KIND);
              setSourceId('record');
            }}
            last
          />
        </>
      );
    }
  }

  // Level two: where this kind of book can come from.
  if (!sourceId) {
    return (
      <>
        {crumb()}
        {doors.map((door, index) => {
          const locked = door === 'standardebooks' && !seEmail;
          const page = door === ESV ? undefined : OWN_PAGE[door];
          return (
            <Row
              key={door}
              label={labelOf(door, t)}
              detail={locked ? t('add.seNeedsEmail') : detailOf(door, t)}
              alarm={locked}
              value={
                door === ESV
                  ? esvOnShelf
                    ? t('add.esvOnShelf')
                    : '⌄'
                  : kept[door]
                    ? `${kept[door].toLocaleString()}  ${page ? '›' : ''}`
                    : page
                      ? '›'
                      : '⌄'
              }
              onPress={() =>
                page
                  ? router.push({ pathname: page, params: { kind: kindId, source: door } })
                  : setSourceId(door)
              }
              last={index === doors.length - 1}
            />
          );
        })}
      </>
    );
  }

  // Level three: whatever the answer above still needs.
  return (
    <>
      {crumb()}

      {sourceId === 'record' ? (
        <>
          {/* The type is asked here rather than before, because a record has
              no doors for it to choose between — all it decides is which
              sections the book's own page will have. */}
          <Row
            label={t(`kind.${kindId}`)}
            detail={t(`kind.${kindId}Hint`)}
            value={typeOpen ? '⌃' : '⌄'}
            onPress={() => setTypeOpen((was) => !was)}
            last={!typeOpen}
          />
          {typeOpen ? (
            <KindList
              selectedId={kindId ?? undefined}
              onPick={(picked) => {
                setTypeOpen(false);
                setKindId(picked);
              }}
            />
          ) : null}
        <View style={styles.form}>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder={t('add.recordTitlePlaceholder')}
            placeholderTextColor={palette.faint}
            autoFocus
            style={[styles.input, { color: palette.text, borderColor: palette.border }]}
          />
          <TextInput
            value={author}
            onChangeText={setAuthor}
            placeholder={t('add.recordAuthorPlaceholder')}
            placeholderTextColor={palette.faint}
            style={[styles.input, { color: palette.text, borderColor: palette.border }]}
          />
        </View>
        <Row
          label={t('add.recordLookUp')}
          detail={t('book.lookUpWhat')}
          value={!keyed ? t('add.needsKey') : named ? '›' : t('add.needsTitle')}
          alarm={!keyed}
          onPress={keyed && named ? keepAndLookUp : undefined}
          last
        />
        </>
      ) : null}

      {sourceId === 'files' ? (
        <Row
          label={file ? file.name : t('shelf.fromFiles')}
          detail={
            file ? t('add.changeFile') : supportedExtensions.map((ext) => `.${ext}`).join(' ')
          }
          value={file ? '✓' : '›'}
          onPress={chooseFile}
          last
        />
      ) : null}

      {sourceId === 'link' ? (
        <View style={styles.form}>
          <TextInput
            value={link}
            onChangeText={setLink}
            placeholder="https://…"
            placeholderTextColor={palette.faint}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            style={[styles.input, { color: palette.text, borderColor: palette.border }]}
          />
          <Text style={{ color: palette.dim, fontSize: 12 }}>{t('shelf.linkHint')}</Text>
          {linkError ? (
            <Text style={{ color: palette.danger, fontSize: 13, marginTop: space.sm }}>
              {linkError}
            </Text>
          ) : null}
          {file ? (
            <Text style={{ color: palette.text, fontSize: 15, marginTop: space.sm }}>
              {`${file.name}  ✓`}
            </Text>
          ) : (
            <Pressable onPress={fetchLink} disabled={busy} style={styles.act}>
              {busy ? (
                <ActivityIndicator />
              ) : (
                <Text style={{ color: palette.accent, fontSize: 16 }}>{t('shelf.fetch')}</Text>
              )}
            </Pressable>
          )}
        </View>
      ) : null}

      {sourceId === ESV ? (
        <EsvKeyRows onState={setEsvState}>
          <Row
            label={esvOnShelf ? t('add.esvOnShelf') : t('add.esvAdd', { title: ESV_TITLE })}
            detail={esvOnShelf ? undefined : t('add.esvAddWhat')}
            value={
              esvOnShelf || esvState.ok
                ? '›'
                : esvState.keyed
                  ? t('add.esvTestFirst')
                  : t('add.esvNeedsKey')
            }
            onPress={
              esvState.busy || !(esvState.ok || esvOnShelf)
                ? undefined
                : esvOnShelf
                  ? () => {
                      onDone?.();
                      router.push(`/book/${esvOnShelf}`);
                    }
                  : putEsvOnShelf
            }
            last
          />
        </EsvKeyRows>
      ) : null}

      {/* What came back from a catalog's own page, and the one question a
          bible can still raise. */}
      {choice ? (
        <>
          <Row
            label={titleOf(choice)}
            detail={subtitleOf(choice) || undefined}
            value={t(`source.${choice.source}`)}
            last={!(choice.source === 'ebible' && choice.translation.extraBooks > 0)}
          />
          {choice.source === 'ebible' && choice.translation.extraBooks > 0 ? (
            <>
              <Row
                label={t('add.canon')}
                value={`${
                  apocrypha
                    ? t('add.canonAll', { count: choice.translation.extraBooks })
                    : t('add.canon66')
                }  ${canonOpen ? '⌃' : '⌄'}`}
                onPress={() => setCanonOpen((was) => !was)}
                last={!canonOpen}
              />
              {canonOpen ? (
                <OptionRows
                  selectedId={apocrypha ? 'all' : 'protestant'}
                  options={[
                    { id: 'protestant', label: t('add.canon66') },
                    {
                      id: 'all',
                      label: t('add.canonAll', { count: choice.translation.extraBooks }),
                      detail: t('add.canonAllHint'),
                    },
                  ]}
                  onPick={(picked) => {
                    setApocrypha(picked === 'all');
                    setCanonOpen(false);
                  }}
                />
              ) : null}
            </>
          ) : null}
        </>
      ) : null}

      {action ? (
        <View style={styles.foot}>
          {/* What the source stated about what it is handing over. A file and a
              typed title state nothing, so they say nothing. */}
          {choice ? (
            <Text style={{ color: palette.dim, fontSize: 12, marginBottom: space.sm }}>
              {aboutLine({ choice, edition, apocrypha }, t)}
            </Text>
          ) : null}
          <Pressable
            onPress={commit}
            style={({ pressed }) => [
              styles.commit,
              { backgroundColor: palette.accent, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={{ color: palette.onAccent, fontSize: 17, fontWeight: '600' }}>
              {t(`add.${action}`)}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </>
  );
}

function labelOf(source: BookSource | typeof ESV, t: TFunction): string {
  if (source === ESV) return ESV_TITLE;
  if (source === 'record') return t('add.recordSource');
  if (source === 'files') return t('shelf.fromFiles');
  if (source === 'link') return t('shelf.fromLink');
  return t(`source.${source}`);
}

function detailOf(source: BookSource | typeof ESV, t: TFunction): string | undefined {
  if (source === ESV) return t('add.esvWhy');
  if (source === 'record') return t('add.recordWhy');
  if (source === 'files') return supportedExtensions.map((ext) => `.${ext}`).join(' ');
  if (source === 'link') return t('shelf.fromLinkHint');
  return t(`source.${source}Detail`);
}

function titleOf(choice: Choice): string {
  if (choice.source === 'ebible') return choice.translation.title;
  if (choice.source === 'repo') return choice.edition.title;
  if (choice.source === 'arxiv') return choice.paper.title;
  if (choice.source === 'openlibrary') return choice.work.title;
  return choice.book.title;
}

function subtitleOf(choice: Choice): string {
  if (choice.source === 'ebible') {
    return `${choice.translation.abbr} · ${choice.translation.copyright}`;
  }
  if (choice.source === 'repo') return `${choice.edition.ref.owner}/${choice.edition.ref.repo}`;
  if (choice.source === 'arxiv') return authorLine(choice.paper);
  if (choice.source === 'openlibrary') {
    return [choice.work.author, choice.work.year].filter(Boolean).join(' · ');
  }
  return choice.book.author;
}

/** What the source says you will get, in the source's own units. */
function aboutLine(
  state: { choice: Choice; edition: GutenbergEdition | null; apocrypha: boolean },
  t: TFunction
): string {
  const { choice } = state;
  if (choice.source === 'ebible') {
    const { books, extraBooks, chapters, verses } = choice.translation;
    return `${t('add.willGet', {
      books: state.apocrypha ? books : books - extraBooks,
      chapters,
      verses,
    })}\n${t('add.structureIncluded')}`;
  }
  if (choice.source === 'repo') {
    const { files, bytes } = choice.edition;
    return `${t('repo.fileCount', { count: files.length })} · ${sizeOf(bytes)}\n${t('repo.what')}`;
  }
  if (choice.source === 'standardebooks') {
    const stated = [choice.book.language, choice.book.rights].filter(Boolean).join(' · ');
    return `${stated}\n${t('add.standardebooksWhat')}`;
  }
  if (choice.source === 'openlibrary') return t('add.recordWhat');
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
  /** Where you are, and the way back up. Above everything, inside the card. */
  crumb: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  form: { paddingHorizontal: space.lg, paddingTop: space.md },
  input: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: space.sm,
    fontSize: 16,
    marginBottom: space.sm,
  },
  act: { paddingVertical: space.md, alignItems: 'center' },
  foot: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.lg },
  commit: {
    borderRadius: radius.md,
    paddingVertical: space.md + 2,
    alignItems: 'center',
  },
});
