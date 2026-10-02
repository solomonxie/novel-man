import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from '../../../src/navigation/router';
import { useTranslation } from 'react-i18next';

import { listExcerpts, type Excerpt } from '../../../src/db/repo';
import { deckOf, recordAnswer, type StudyCard } from '../../../src/db/study';
import { answer, deckFor, nextDueAt, type Recall } from '../../../src/study/schedule';
import { Empty } from '../../../src/ui/detail';
import { radius, space, usePalette } from '../../../src/theme';

/** Which page a studied thing belongs to, for the way out of a card. */
const PAGES: Record<string, string> = { card: 'card', term: 'term', word: 'word' };

/**
 * One sitting with the cards of one book.
 *
 * What is being drilled is everything the reader kept: cards they wrote, terms
 * the book explained, words they looked up. They are one deck because they are
 * one question — what of this book do I still have? — and three decks would be
 * three screens nobody opens.
 *
 * The front is the thing; the back is what the reader wrote about it. That is
 * why a card with nothing on its back is not in the deck: there is nothing to
 * check a recall against, and a card that cannot be got wrong teaches nothing.
 *
 * A missed card goes to the back of the sitting rather than out of it. The
 * schedule says ten minutes, which inside one session means "again before you
 * stop" — getting a card wrong and not seeing it again until tomorrow is how
 * it stays wrong for a week.
 */
export default function StudyPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const palette = usePalette();
  const [queue, setQueue] = useState<StudyCard[] | null>(null);
  const [at, setAt] = useState(0);
  const [shown, setShown] = useState(false);
  const [excerpts, setExcerpts] = useState<Excerpt[]>([]);
  const [right, setRight] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [again, setAgain] = useState<number | null>(null);
  /** Every schedule in the book, for what to say once the deck is empty. */
  const all = useRef<StudyCard[]>([]);

  const load = useCallback(() => {
    if (!id || queue) return;
    deckOf(id).then((deck) => {
      all.current = deck;
      // A back is what makes it answerable; `deckFor` decides the order.
      setQueue(deckFor(deck.filter((one) => hasBack(one))));
      setAgain(nextDueAt(deck.map((one) => one.schedule)));
    });
  }, [id, queue]);

  useFocusEffect(load);

  const card = queue?.[at];

  const reveal = useCallback(() => {
    setShown(true);
    if (card?.entity.kind === 'card') void listExcerpts(card.entity.id).then(setExcerpts);
  }, [card]);

  async function said(recall: Recall) {
    if (!card || !id) return;
    const next = answer(card.schedule, recall);
    await recordAnswer(id, card.entity.id, next);
    if (recall === 'right') setRight((was) => was + 1);
    else setWrong((was) => was + 1);
    setShown(false);
    setExcerpts([]);
    setQueue((was) => {
      if (!was) return was;
      // Missed cards come round again at the end of the sitting.
      const rest = recall === 'wrong' ? [...was, { ...card, schedule: next }] : was;
      return rest;
    });
    setAt((was) => was + 1);
  }

  if (!queue) {
    return (
      <View style={[styles.centre, { backgroundColor: palette.bg }]}>
        <Stack.Screen options={{ title: t('study.title'), headerBackTitle: ' ' }} />
        <ActivityIndicator />
      </View>
    );
  }

  const done = right + wrong;

  if (!card) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: palette.bg }}
        contentContainerStyle={{ padding: space.lg }}
      >
        <Stack.Screen options={{ title: t('study.title'), headerBackTitle: ' ' }} />
        {done === 0 ? (
          <Empty
            text={
              all.current.length === 0
                ? t('study.nothingKept')
                : all.current.some((one) => hasBack(one))
                  ? t('study.nothingDue')
                  : t('study.noBacks')
            }
          />
        ) : (
          <View style={styles.finished}>
            <Text style={{ color: palette.text, fontSize: 34, fontWeight: '700' }}>
              {t('study.score', { right, of: done })}
            </Text>
            <Text style={{ color: palette.dim, fontSize: 15, textAlign: 'center', lineHeight: 22 }}>
              {again
                ? t('study.nextDue', { when: whenIn(again, t) })
                : t('study.allCaught')}
            </Text>
          </View>
        )}
        <Pressable onPress={() => router.back()} style={{ paddingVertical: space.lg }}>
          <Text style={{ color: palette.accent, fontSize: 16, textAlign: 'center' }}>
            {t('study.done')}
          </Text>
        </Pressable>
      </ScrollView>
    );
  }

  const back = backOf(card);

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <Stack.Screen options={{ title: t('study.title'), headerBackTitle: ' ' }} />

      {/* How far through, and how it is going. Counted in answers rather than
          in cards: a missed card is answered twice and both of them happened. */}
      <View style={styles.tally}>
        <Text style={{ color: palette.dim, fontSize: 13 }}>
          {t('study.position', { done: done + 1, of: queue.length })}
        </Text>
        {done > 0 ? (
          <Text style={{ color: palette.faint, fontSize: 13 }}>
            {t('study.sofar', { right, wrong })}
          </Text>
        ) : null}
      </View>

      {/* The card. Tapping anywhere on it turns it over, because at the point
          of recall the reader is not looking for a button. */}
      <Pressable
        onPress={shown ? undefined : reveal}
        style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}
      >
        <ScrollView contentContainerStyle={styles.face} keyboardShouldPersistTaps="handled">
          <Text style={{ color: palette.faint, fontSize: 12, letterSpacing: 0.6 }}>
            {t(`study.kind_${card.entity.kind}`).toUpperCase()}
          </Text>
          <Text style={{ color: palette.text, fontSize: 26, fontWeight: '600', textAlign: 'center' }}>
            {card.entity.name}
          </Text>
          {shown ? (
            <>
              <View style={[styles.rule, { backgroundColor: palette.border }]} />
              <Text style={{ color: palette.text, fontSize: 17, lineHeight: 26, textAlign: 'center' }}>
                {back}
              </Text>
              {/* The book's own words, which are what a recall is checked
                  against — a card typed from memory has to be trusted. */}
              {excerpts.slice(0, 2).map((excerpt) => (
                <Text
                  key={excerpt.id}
                  style={{ color: palette.dim, fontSize: 14, lineHeight: 21, textAlign: 'center' }}
                >
                  “{excerpt.quote}”
                </Text>
              ))}
              <Pressable
                onPress={() => router.push(`/${PAGES[card.entity.kind] ?? 'card'}/${card.entity.id}`)}
                hitSlop={8}
              >
                <Text style={{ color: palette.accent, fontSize: 14 }}>{t('study.open')}</Text>
              </Pressable>
            </>
          ) : (
            <Text style={{ color: palette.faint, fontSize: 14 }}>{t('study.tapToTurn')}</Text>
          )}
        </ScrollView>
      </Pressable>

      {/* Only once it has been turned over. Asked before the answer is shown,
          "did I know that" is a question anybody answers yes to. */}
      {shown ? (
        <View style={styles.answers}>
          <Pressable
            onPress={() => void said('wrong')}
            style={[styles.answer, { borderColor: palette.border, backgroundColor: palette.surface }]}
          >
            <Text style={{ color: palette.danger, fontSize: 16, fontWeight: '600' }}>
              {t('study.missed')}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => void said('right')}
            style={[styles.answer, { borderColor: palette.accent, backgroundColor: palette.soft }]}
          >
            <Text style={{ color: palette.accent, fontSize: 16, fontWeight: '600' }}>
              {t('study.gotIt')}
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.answers}>
          <Pressable
            onPress={reveal}
            style={[styles.answer, { borderColor: palette.accent, backgroundColor: palette.soft }]}
          >
            <Text style={{ color: palette.accent, fontSize: 16, fontWeight: '600' }}>
              {t('study.turn')}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

/** What is on the back: what the reader wrote about the thing. */
function backOf(card: StudyCard): string {
  return card.entity.summary?.trim() ?? '';
}

function hasBack(card: StudyCard): boolean {
  return Boolean(backOf(card));
}

/** Rough and plain: nobody needs the hour a card is due. */
function whenIn(at: number, t: (key: string, vars?: Record<string, unknown>) => string): string {
  const days = Math.round((at - Date.now()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return t('study.laterToday');
  if (days === 1) return t('study.tomorrow');
  return t('study.inDays', { n: days });
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  finished: { alignItems: 'center', gap: space.md, paddingVertical: space.xxl },
  tally: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingTop: space.md,
  },
  card: {
    flex: 1,
    margin: space.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  face: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    padding: space.xl,
  },
  rule: { height: StyleSheet.hairlineWidth, alignSelf: 'stretch' },
  answers: { flexDirection: 'row', gap: space.md, paddingHorizontal: space.lg, paddingBottom: space.xxl },
  answer: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: space.md + 2,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
