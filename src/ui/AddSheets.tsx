import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import type { Choice } from '../sources/chosen';
import { fetchManuscript, FetchError } from '../import/sources/url';
import { readGutenbergBook, type GutenbergEdition } from '../sources/gutenberg';
import { authorLine } from '../sources/arxiv';
import { OptionRows } from './OptionRows';
import { PrimaryAction, Row } from './primitives';
import { sizeOf } from './fields';
import { useKeyboardLift } from './keyboard';
import { radius, space, usePalette } from '../theme';

/**
 * The one thing adding a book still has to ask, in a sheet over the search
 * that raised it: is this the one you meant, and — for a bible — which canon.
 *
 * It is a sheet and not a level of a menu. The menu asked what kind of book it
 * was, then where books come from, then whatever that answer needed: three
 * questions before the reader had said the one thing they knew, which is the
 * title. The title is the way in now, and this opens only where the source has
 * something genuinely left to settle, or a size worth seeing before it is
 * spent.
 */

function Sheet({ title, onClose, children }: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const lift = useKeyboardLift();
  const [raised, setRaised] = useState(0);

  // The sheet is anchored to the bottom and holds a field, so it has to clear
  // the keyboard. A plain number, not the animated value: the sheet's height
  // is what changes, and layout cannot be driven natively.
  useEffect(() => {
    const id = lift.addListener(({ value }) => setRaised(value));
    return () => lift.removeListener(id);
  }, [lift]);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={[styles.scrim, { backgroundColor: palette.scrim }]} onPress={onClose}>
        <Pressable
          onPress={(event) => event.stopPropagation()}
          style={[
            styles.sheet,
            {
              backgroundColor: palette.surface,
              borderColor: palette.border,
              paddingBottom: Math.max(insets.bottom, space.md) + space.lg + raised,
            },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: palette.faint }]} />
          <Text numberOfLines={2} style={[styles.title, { color: palette.text }]}>{title}</Text>
          <ScrollView bounces={false} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/**
 * A book chosen out of a search, and the one button that spends anything.
 *
 * What the source stated about what it is handing over goes here — the size,
 * the licence, how many books and verses — because this is the last moment
 * before somebody's data allowance is spent on it. And the one question a
 * bible can still raise, which no default can answer for a reader.
 */
export function ConfirmAdd({ choice, busy, onAdd, onClose }: {
  choice: Choice;
  busy?: boolean;
  onAdd: (options: { apocrypha: boolean }) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const palette = usePalette();
  const [apocrypha, setApocrypha] = useState(false);
  const [canonOpen, setCanonOpen] = useState(false);
  const [edition, setEdition] = useState<GutenbergEdition | null>(null);

  // What Gutenberg will actually hand over, read once the sheet is up.
  useEffect(() => {
    if (choice.source !== 'gutenberg') return;
    let live = true;
    readGutenbergBook(choice.book)
      .then((found) => live && setEdition(found))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [choice]);

  const extras = choice.source === 'ebible' ? choice.translation.extraBooks : 0;

  return (
    <Sheet title={titleOf(choice)} onClose={onClose}>
      <Text style={{ color: palette.dim, fontSize: 14, marginBottom: space.md }}>
        {subtitleOf(choice)}
      </Text>

      {extras > 0 ? (
        <View style={[styles.card, { borderColor: palette.border }]}>
          <Row
            label={t('add.canon')}
            value={`${
              apocrypha ? t('add.canonAll', { count: extras }) : t('add.canon66')
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
                  label: t('add.canonAll', { count: extras }),
                  detail: t('add.canonAllHint'),
                },
              ]}
              onPick={(picked) => {
                setApocrypha(picked === 'all');
                setCanonOpen(false);
              }}
            />
          ) : null}
        </View>
      ) : null}

      <Text style={{ color: palette.dim, fontSize: 12, marginBottom: space.md, lineHeight: 17 }}>
        {aboutLine({ choice, edition, apocrypha }, t)}
      </Text>

      {busy ? (
        <ActivityIndicator style={{ paddingVertical: space.md }} />
      ) : (
        <PrimaryAction
          label={choice.source === 'openlibrary' ? t('add.keep') : t('add.download')}
          onPress={() => onAdd({ apocrypha })}
        />
      )}
    </Sheet>
  );
}

/**
 * A link, on behalf of a book that is already on the shelf. The record came
 * first and this is it getting its words — so what comes back is a file, and
 * the caller decides which book it lands on.
 */
export function AddByLink({ onFile, onClose }: {
  onFile: (file: { uri: string; name: string }) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const palette = usePalette();
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchIt() {
    if (!link.trim()) return;
    setError(null);
    setBusy(true);
    try {
      onFile(await fetchManuscript(link));
    } catch (problem) {
      setError(describeFetch(problem, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={t('shelf.fromLink')} onClose={onClose}>
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
      <Text style={{ color: palette.dim, fontSize: 12, marginBottom: space.md }}>
        {t('shelf.fromLinkHint')}
      </Text>
      {error ? (
        <Text style={{ color: palette.danger, fontSize: 13, marginBottom: space.md }}>{error}</Text>
      ) : null}
      {busy ? (
        <ActivityIndicator style={{ paddingVertical: space.md }} />
      ) : (
        <PrimaryAction label={t('shelf.fetch')} onPress={fetchIt} />
      )}
    </Sheet>
  );
}

function describeFetch(error: unknown, t: TFunction): string {
  if (error instanceof FetchError) {
    if (error.code === 'sign-in') return t('shelf.linkSignIn');
    if (error.code === 'unsupported') return t('import.unsupported', { ext: error.detail });
  }
  return t('shelf.linkFailed');
}

export function titleOf(choice: Choice): string {
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

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    maxHeight: '85%',
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: space.md,
    opacity: 0.5,
  },
  title: { fontSize: 19, fontWeight: '700', marginBottom: space.xs },
  input: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: space.sm,
    fontSize: 16,
    marginBottom: space.sm,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    overflow: 'hidden',
    marginBottom: space.md,
  },
});
