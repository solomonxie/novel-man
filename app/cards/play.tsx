import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams } from '../../src/navigation/router';
import { useTranslation } from 'react-i18next';

import {
  filterCards,
  listOf,
  recentCards,
  setFavorite,
  setVerdict,
  type CardFilter,
  type CardLine,
  type Verdict,
} from '../../src/db/topics';
import { CardRow } from '../../src/ui/CardRow';
import { Row, Section } from '../../src/ui/primitives';
import { radius, space, usePalette } from '../../src/theme';

const SWIPE = 110;
const TALLIES = ['known', 'later', 'favorite'] as const;
type Tally = (typeof TALLIES)[number];

const byVerdict = (card: CardLine) => (card.verdict === 'later' ? 0 : card.verdict === 'known' ? 2 : 1);

/**
 * The filtered cards as a deck to swipe: right for understood, left to see
 * again later. Every choice is kept on the card, so the tallies below count
 * across sittings and each one opens into its cards.
 */
export default function PlayCards() {
  const params = useLocalSearchParams<CardFilter & Record<string, string | undefined>>();
  const { t } = useTranslation();
  const palette = usePalette();
  const [deck, setDeck] = useState<CardLine[] | null>(null);
  const [at, setAt] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [history, setHistory] = useState<{ id: string; was: Verdict | null; to: Verdict }[]>([]);
  const [open, setOpen] = useState<Tally | null>(null);
  const [dragging, setDragging] = useState(false);
  const position = useRef(new Animated.ValueXY()).current;

  const load = useCallback(() => {
    if (deck) return;
    recentCards().then((cards) => {
      const picked = filterCards(cards, params);
      setDeck(params.mark ? picked : [...picked].sort((a, b) => byVerdict(a) - byVerdict(b)));
    });
  }, [deck, params]);
  useFocusEffect(load);

  const card = deck?.[at];

  function patch(id: string, change: Partial<CardLine>) {
    setDeck((was) => was?.map((one) => (one.id === id ? { ...one, ...change } : one)) ?? was);
  }

  function settle() {
    setFlipped(false);
    position.setValue({ x: 0, y: 0 });
  }

  function decide(verdict: Verdict) {
    if (!card) return;
    setHistory((was) => [...was, { id: card.id, was: card.verdict, to: verdict }]);
    patch(card.id, { verdict });
    void setVerdict(card.id, verdict);
    settle();
    setAt((was) => was + 1);
  }

  function undo() {
    const last = history[history.length - 1];
    if (!last) return;
    setHistory((was) => was.slice(0, -1));
    patch(last.id, { verdict: last.was });
    void setVerdict(last.id, last.was);
    settle();
    setAt((was) => Math.max(0, was - 1));
  }

  function toggleFavorite(target: CardLine) {
    const next = !target.favorite;
    patch(target.id, { favorite: next ? 1 : 0 });
    void setFavorite(target.id, next);
  }

  function flyOff(verdict: Verdict) {
    const width = Dimensions.get('window').width;
    Animated.timing(position, {
      toValue: { x: (verdict === 'known' ? 1 : -1) * width * 1.3, y: 0 },
      duration: 200,
      useNativeDriver: false,
    }).start(() => latest.current.decide(verdict));
  }

  const latest = useRef({ decide, flyOff });
  latest.current = { decide, flyOff };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderGrant: () => setDragging(true),
        onPanResponderMove: Animated.event([null, { dx: position.x }], { useNativeDriver: false }),
        onPanResponderTerminationRequest: () => false,
        onPanResponderRelease: (_, g) => {
          setDragging(false);
          if (g.dx > SWIPE || g.vx > 0.8) latest.current.flyOff('known');
          else if (g.dx < -SWIPE || g.vx < -0.8) latest.current.flyOff('later');
          else Animated.spring(position, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
        },
        onPanResponderTerminate: () => {
          setDragging(false);
          Animated.spring(position, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
        },
      }),
    [position]
  );

  function replay(cards: CardLine[]) {
    setDeck(cards);
    setAt(0);
    setHistory([]);
    setOpen(null);
    settle();
  }

  function shuffle() {
    if (!deck) return;
    const rest = deck.slice(at);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    setDeck([...deck.slice(0, at), ...rest]);
    settle();
  }

  if (!deck) {
    return (
      <View style={[styles.centre, { backgroundColor: palette.bg }]}>
        <ActivityIndicator />
      </View>
    );
  }

  const inTally = (tally: Tally) =>
    deck.filter((one) => (tally === 'favorite' ? Boolean(one.favorite) : one.verdict === tally));
  const later = inTally('later');
  const known = history.filter((one) => one.to === 'known').length;
  const title = [params.topic, params.tag && `#${params.tag}`].filter(Boolean).join(' · ') || t('cards.title');

  const rotate = position.x.interpolate({ inputRange: [-300, 0, 300], outputRange: ['-8deg', '0deg', '8deg'] });
  const knownShown = position.x.interpolate({ inputRange: [0, SWIPE], outputRange: [0, 1], extrapolate: 'clamp' });
  const laterShown = position.x.interpolate({ inputRange: [-SWIPE, 0], outputRange: [1, 0], extrapolate: 'clamp' });
  const cardHeight = Math.min(420, Dimensions.get('window').height * 0.42);
  const filed = card ? [card.topics, ...listOf(card.tags).map((tag) => `#${tag}`)].filter(Boolean).join(' · ') : '';

  const stage = card ? (
    <View>
      <View style={styles.tally}>
        <Text style={{ color: palette.dim, fontSize: 13 }}>{t('study.position', { done: at + 1, of: deck.length })}</Text>
        <View style={{ flexDirection: 'row', gap: space.lg }}>
          <Pressable onPress={undo} disabled={!history.length} hitSlop={10}>
            <Text style={{ color: history.length ? palette.accent : palette.faint, fontSize: 14 }}>{t('play.undo')}</Text>
          </Pressable>
          <Pressable onPress={shuffle} hitSlop={10}>
            <Text style={{ color: palette.accent, fontSize: 14 }}>{t('play.shuffle')}</Text>
          </Pressable>
        </View>
      </View>

      <View style={{ height: cardHeight + space.sm, marginTop: space.md }}>
        {deck[at + 1] ? (
          <View
            pointerEvents="none"
            style={[styles.card, styles.under, { height: cardHeight, backgroundColor: palette.surface, borderColor: palette.border }]}
          />
        ) : null}
        <Animated.View
          {...pan.panHandlers}
          style={[
            styles.card,
            {
              height: cardHeight,
              backgroundColor: palette.surface,
              borderColor: palette.border,
              transform: [{ translateX: position.x }, { rotate }],
            },
          ]}
        >
          <Pressable onPress={() => setFlipped((was) => !was)} style={styles.face}>
            {filed ? (
              <Text numberOfLines={1} style={{ color: palette.faint, fontSize: 12, letterSpacing: 0.6 }}>
                {filed}
              </Text>
            ) : null}
            <Text
              style={{ color: palette.text, fontSize: 26, fontWeight: '600', textAlign: 'center' }}
              numberOfLines={flipped ? 3 : 8}
              adjustsFontSizeToFit
            >
              {card.name}
            </Text>
            {flipped ? (
              <>
                <View style={[styles.rule, { backgroundColor: palette.border }]} />
                <Text
                  style={{ color: palette.text, fontSize: 17, lineHeight: 26, textAlign: 'center' }}
                  numberOfLines={10}
                  adjustsFontSizeToFit
                >
                  {card.summary?.trim() || t('play.noBack')}
                </Text>
              </>
            ) : (
              <Text style={{ color: palette.faint, fontSize: 14 }}>{t('study.tapToTurn')}</Text>
            )}
          </Pressable>
          <Pressable
            onPress={() => toggleFavorite(card)}
            hitSlop={12}
            style={styles.star}
            accessibilityLabel={t(card.favorite ? 'card.unfavorite' : 'card.favorite')}
          >
            <Text style={{ color: card.favorite ? palette.accent : palette.faint, fontSize: 22 }}>
              {card.favorite ? '★' : '☆'}
            </Text>
          </Pressable>
          <Animated.Text style={[styles.cue, styles.cueLeft, { color: palette.accent, opacity: knownShown }]}>
            {t('cards.mark_known')}
          </Animated.Text>
          <Animated.Text style={[styles.cue, styles.cueRight, { color: palette.danger, opacity: laterShown }]}>
            {t('cards.mark_later')}
          </Animated.Text>
        </Animated.View>
      </View>

      <View style={styles.answers}>
        <Pressable
          onPress={() => latest.current.flyOff('later')}
          style={[styles.answer, { borderColor: palette.border, backgroundColor: palette.surface }]}
        >
          <Text style={{ color: palette.danger, fontSize: 16, fontWeight: '600' }}>{t('cards.mark_later')}</Text>
        </Pressable>
        <Pressable
          onPress={() => latest.current.flyOff('known')}
          style={[styles.answer, { borderColor: palette.accent, backgroundColor: palette.soft }]}
        >
          <Text style={{ color: palette.accent, fontSize: 16, fontWeight: '600' }}>{t('cards.mark_known')}</Text>
        </Pressable>
      </View>
      <Text style={{ color: palette.faint, fontSize: 12, textAlign: 'center' }}>{t('play.swipeHint')}</Text>
    </View>
  ) : (
    <View style={styles.finished}>
      <Text style={{ color: palette.text, fontSize: 34, fontWeight: '700' }}>
        {history.length ? t('study.score', { right: known, of: history.length }) : deck.length ? t('play.done') : t('cards.noMatches')}
      </Text>
      {history.length ? (
        <Text style={{ color: palette.dim, fontSize: 15, textAlign: 'center' }}>
          {t('play.summary', { known, later: history.length - known })}
        </Text>
      ) : null}
      {later.length ? (
        <Pressable onPress={() => replay(later)} hitSlop={8}>
          <Text style={{ color: palette.accent, fontSize: 16 }}>{t('play.later', { count: later.length })}</Text>
        </Pressable>
      ) : null}
      {deck.length ? (
        <Pressable onPress={() => replay(deck)} hitSlop={8}>
          <Text style={{ color: palette.accent, fontSize: 16 }}>{t('play.again')}</Text>
        </Pressable>
      ) : null}
      {history.length ? (
        <Pressable onPress={undo} hitSlop={8}>
          <Text style={{ color: palette.dim, fontSize: 15 }}>{t('play.undo')}</Text>
        </Pressable>
      ) : null}
    </View>
  );

  const shown = open ? inTally(open) : [];

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <Stack.Screen options={{ title, headerBackTitle: ' ' }} />
      <FlatList
        data={shown}
        scrollEnabled={!dragging}
        keyExtractor={(one) => one.id}
        contentContainerStyle={{ paddingBottom: space.xxl * 2 }}
        ListHeaderComponent={
          <View>
            {stage}
            <View style={{ paddingHorizontal: space.lg }}>
              <Section>
                {TALLIES.map((tally, index) => (
                  <Row
                    key={tally}
                    label={t(`cards.mark_${tally}`)}
                    value={`${inTally(tally).length}${open === tally ? '  ⌄' : ''}`}
                    onPress={() => setOpen(open === tally ? null : tally)}
                    last={index === TALLIES.length - 1}
                  />
                ))}
              </Section>
              {open && shown.length ? (
                <Pressable onPress={() => replay(shown)} hitSlop={8} style={{ paddingVertical: space.md }}>
                  <Text style={{ color: palette.accent, fontSize: 15 }}>{t('play.these')}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <View style={{ paddingHorizontal: space.lg }}>
            <CardRow card={item} />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tally: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingTop: space.md,
  },
  card: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    top: 0,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  under: { top: space.sm, left: space.lg + space.md, right: space.lg + space.md, opacity: 0.6 },
  face: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xl },
  rule: { height: StyleSheet.hairlineWidth, alignSelf: 'stretch' },
  star: { position: 'absolute', top: space.md, right: space.lg },
  cue: { position: 'absolute', top: space.md + 2, fontSize: 14, fontWeight: '700' },
  cueLeft: { left: space.lg },
  cueRight: { right: space.lg + space.xxl },
  answers: { flexDirection: 'row', gap: space.md, paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.sm },
  answer: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: space.md + 2,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  finished: { alignItems: 'center', gap: space.md, paddingVertical: space.xxl, paddingHorizontal: space.lg },
});
