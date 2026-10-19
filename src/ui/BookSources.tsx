import { useCallback, useEffect, useMemo, useState } from 'react';
import { InteractionManager, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { router, useFocusEffect } from '../navigation/router';
import { keptCatalogs } from '../sources/catalog';
import { publicSources, type PublicSource } from '../sources/registry';
import { ESV_TITLE } from '../sources/special';
import { esvKey } from '../sources/esvKey';
import { standardEbooksEmail } from '../sources/standardEbooksEmail';
import { offers } from '../store/scope';
import { activeCount, enqueueCatalogs, subscribeToQueue, type CatalogSource } from '../import/queue';
import { SEEN } from '../sources/seen';
import { Row, Section } from './primitives';
import { SourceRows } from './SourceRows';
import { radius, space, usePalette } from '../theme';

/** Past this, a kept list has had time to fall behind what the source publishes. */
const STALE_DAYS = 90;

/** A source as the board shows it: one line, one tap, one thing it does. */
export type SourceCard = {
  id: string;
  label: string;
  detail: string;
  value: string;
  /** Ready to answer a search right now, or still waiting for something. */
  ready: boolean;
  onPress: () => void;
};

/**
 * Every source a search can reach and where each one stands — which lists
 * this device holds, how old they are, which are not here yet. The shelf
 * shows the board; the search page reads it to say why a search found nothing.
 */
export function useSourceBoard() {
  const { t, i18n } = useTranslation();
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const [kept, setKept] = useState<{ source: string; fetchedAt: number; count: number }[]>([]);
  const [emailed, setEmailed] = useState(false);
  const [keyed, setKeyed] = useState(false);
  /** Queued for an update, until the queue says otherwise. */
  const [updating, setUpdating] = useState<string[]>([]);
  /** The one source that wants a credential before its list is worth fetching. */
  const [settingUp, setSettingUp] = useState<PublicSource | null>(null);

  const readSources = useCallback(() => {
    keptCatalogs().then(setKept).catch(() => undefined);
    standardEbooksEmail().then((email) => setEmailed(Boolean(email))).catch(() => undefined);
    esvKey().then((key) => setKeyed(Boolean(key))).catch(() => undefined);
  }, []);

  // A list is fetched in the queue with everything else, so the board learns
  // it finished by being told the queue went quiet.
  useEffect(
    () =>
      subscribeToQueue(() => {
        if (activeCount() > 0) return;
        setUpdating((was) => (was.length ? [] : was));
        readSources();
      }),
    [readSources]
  );

  const update = useCallback(
    (source: CatalogSource) => {
      enqueueCatalogs([source], () => t(`source.${source}`));
      setUpdating((was) => [...was, source]);
    },
    [t]
  );

  const keptBy = useMemo(() => {
    const byId = new Map<string, { fetchedAt: number; count: number }>();
    // Open Library keeps a list per category — `openlibrary:fiction` and a
    // dozen siblings — and to the board they are one source with one total.
    for (const row of kept) {
      if (row.source === SEEN) continue;
      const base = row.source.split(':')[0];
      const found = byId.get(base);
      byId.set(base, {
        fetchedAt: Math.max(found?.fetchedAt ?? 0, row.fetchedAt),
        count: (found?.count ?? 0) + row.count,
      });
    }
    return byId;
  }, [kept]);

  const held = useMemo(
    () =>
      kept
        .filter((row) => row.source !== SEEN)
        .reduce((total, row) => total + row.count, 0),
    [kept]
  );

  /** Everything a search could reach, each as the one row that says where it stands. */
  const cards = useMemo<SourceCard[]>(() => {
    const made: SourceCard[] = [];
    const dated = (at: number) => new Date(at).toLocaleDateString(i18n.language);

    for (const source of publicSources()) {
      if (source.indexed) {
        const state = keptBy.get(source.id);
        const stale = state ? Date.now() - state.fetchedAt > STALE_DAYS * 86400000 : false;
        const locked = Boolean(source.credential) && !emailed;
        const running = updating.includes(source.id);
        made.push({
          id: source.id,
          label: t(`source.${source.id}`),
          detail: locked
            ? t('add.seWhy')
            : state
              ? t('add.indexAsOf', { count: state.count, date: dated(state.fetchedAt) })
              : t('add.indexMissing'),
          value: running
            ? t('add.updating')
            : locked
              ? t('find.setUp')
              : state
                ? t('add.update')
                : t('add.getList'),
          ready: Boolean(state) && !stale && !locked,
          onPress: () =>
            running
              ? undefined
              : locked
                ? setSettingUp(source)
                : update(source.id as CatalogSource),
        });
        continue;
      }
      if (source.remote && source.find) {
        const page = source.find;
        made.push({
          id: source.id,
          label: t(`source.${source.id}`),
          detail: t(`source.${source.id}Detail`),
          value: t('find.onlineOnly'),
          ready: true,
          onPress: () => router.push(page),
        });
      }
    }

    // The one edition that is its own catalog. It has no list to fetch; what
    // it has instead is a key, and without one it answers nothing.
    if (offers('scripture')) made.push({
      id: 'esv',
      label: ESV_TITLE,
      detail: t('add.esvWhy'),
      value: keyed ? t('find.ready') : t('find.setUp'),
      ready: keyed,
      onPress: () => router.push('/source/esv'),
    });
    return made;
  }, [keptBy, emailed, keyed, updating, t, i18n.language]);

  // Memoised, both of them: `waiting` is a dependency of the result list, and
  // a fresh array every render would rebuild every row on the page on every
  // keystroke.
  const available = useMemo(() => cards.filter((card) => card.ready), [cards]);
  const waiting = useMemo(() => cards.filter((card) => !card.ready), [cards]);



  // A credential is the one thing a source can want that a queued job cannot
  // supply, so it is asked for here and nowhere else.
  const sheet = settingUp ? (
    <Modal visible transparent animationType="fade" onRequestClose={() => setSettingUp(null)}>
      <Pressable
        style={[styles.scrim, { backgroundColor: palette.scrim }]}
        onPress={() => setSettingUp(null)}
      >
        <Pressable
          onPress={(event) => event.stopPropagation()}
          style={[
            styles.sheet,
            {
              backgroundColor: palette.bg,
              borderColor: palette.border,
              paddingBottom: Math.max(insets.bottom, space.md) + space.lg,
            },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: palette.faint }]} />
          <ScrollView bounces={false} keyboardShouldPersistTaps="handled">
            <SourceRows source={settingUp} onUpdated={readSources} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  ) : null;

  return { kept, readSources, update, available, waiting, held, sheet };
}

/**
 * The board, folded, with the one source that is not a catalog under it: a
 * file already on the phone. The counts on the folded rows answer "why did my
 * search find nothing" without having to be opened.
 */
export function BookSources({ onFile }: { onFile: () => void }) {
  const { t } = useTranslation();
  const board = useSourceBoard();
  const { readSources } = board;
  const [opened, setOpened] = useState<'available' | 'waiting' | null>(null);

  // Four reads, two of them the keychain: after the page has arrived.
  useFocusEffect(
    useCallback(() => {
      const task = InteractionManager.runAfterInteractions(readSources);
      return () => task.cancel();
    }, [readSources])
  );

  const rows = (cards: SourceCard[]) =>
    cards.map((card) => (
      <Row key={card.id} label={card.label} detail={card.detail} value={card.value} onPress={card.onPress} />
    ));

  return (
    <>
      <Section title={t('shelf.bookSources')} flush>
        <Row
          label={t('find.availableSources')}
          detail={board.held ? t('find.sourcesHeld', { count: board.held }) : t('find.sourcesNone')}
          value={`${board.available.length}  ${opened === 'available' ? '⌃' : '⌄'}`}
          onPress={() => setOpened(opened === 'available' ? null : 'available')}
        />
        {opened === 'available' ? rows(board.available) : null}
        {board.waiting.length ? (
          <>
            <Row
              label={t('find.toUpdateSources')}
              detail={t('find.toUpdateWhy')}
              value={`${board.waiting.length}  ${opened === 'waiting' ? '⌃' : '⌄'}`}
              onPress={() => setOpened(opened === 'waiting' ? null : 'waiting')}
            />
            {opened === 'waiting' ? rows(board.waiting) : null}
          </>
        ) : null}
        <Row
          label={t('find.fromFile')}
          detail={t('find.fromFileWhy')}
          value="›"
          link
          onPress={onFile}
          last
        />
      </Section>
      {board.sheet}
    </>
  );
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
    marginBottom: space.sm,
    opacity: 0.5,
  },
});
