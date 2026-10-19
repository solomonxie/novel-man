import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, Stack, useLocalSearchParams } from '../../src/navigation/router';

import { answerMerge, proposalFor } from '../../src/import/queue';
import type { Decision } from '../../src/db/versions';
import { diffParagraphs, tally, type DiffPiece, type Step } from '../../src/structure/merge';
import { Action } from '../../src/ui/detail';
import { Hint, Toggle } from '../../src/ui/primitives';
import { radius, space, usePalette } from '../../src/theme';

/**
 * Two copies of a book, side by side, the way a merge is read in git: what is
 * the same is folded away, what is new goes in, and a chapter both copies
 * word differently is the reader's to choose. Neither wording is lost — the
 * one not chosen is kept as a version of that chapter.
 */

type Line =
  | { key: string; kind: 'same'; count: number }
  | { key: string; kind: 'step'; step: Step; index: number };

export default function MergePage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const [proposal] = useState(() => (id ? proposalFor(id) : null));
  const [decisions, setDecisions] = useState<Record<number, Decision>>({});
  const [skipped, setSkipped] = useState<number[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [sent, setSent] = useState(false);

  const lines = useMemo<Line[]>(() => {
    const out: Line[] = [];
    proposal?.steps.forEach((step, index) => {
      const last = out[out.length - 1];
      if (step.kind === 'same') {
        if (last?.kind === 'same') last.count++;
        else out.push({ key: `same-${index}`, kind: 'same', count: 1 });
      } else out.push({ key: `step-${index}`, kind: 'step', step, index });
    });
    return out;
  }, [proposal]);

  const changed = useMemo(
    () => proposal?.steps.flatMap((step, index) => (step.kind === 'changed' ? [index] : [])) ?? [],
    [proposal]
  );
  const counts = useMemo(() => tally(proposal?.steps ?? []), [proposal]);
  const undecided = changed.filter((index) => !decisions[index]).length;

  if (!proposal || !id) {
    return (
      <View style={{ flex: 1, padding: space.lg, backgroundColor: palette.bg }}>
        <Stack.Screen options={{ title: t('merge.title'), headerBackTitle: ' ' }} />
        <Text style={{ color: palette.dim, fontSize: 15 }}>{t('merge.gone')}</Text>
      </View>
    );
  }

  function chooseAll(decision: Decision) {
    setDecisions(Object.fromEntries(changed.map((index) => [index, decision])));
  }

  function apply() {
    // Back to the job, which shows the saving and then opens the book.
    setSent(true);
    answerMerge(id!, { decisions, skipped });
    router.back();
  }

  function cancel() {
    answerMerge(id!, null);
    router.back();
  }

  const base = proposal.base;
  const incoming = proposal.incoming;

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <Stack.Screen options={{ title: t('merge.title'), headerBackTitle: ' ' }} />
      <FlatList
        data={lines}
        keyExtractor={(line) => line.key}
        contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl }}
        ListHeaderComponent={
          <View style={{ marginBottom: space.md }}>
            <Text style={{ color: palette.text, fontSize: 22, fontWeight: '700' }}>{proposal.title}</Text>
            <Text style={{ color: palette.dim, fontSize: 14, marginTop: space.xs }}>
              {t('merge.from', { file: proposal.fileName })}
            </Text>
            <Text style={{ color: palette.text, fontSize: 14, marginTop: space.sm }}>
              {t('merge.tally', counts)}
            </Text>
            <Hint>{t('merge.safe')}</Hint>
            {changed.length > 1 ? (
              <View style={styles.actions}>
                <Action label={t('merge.allMine')} onPress={() => chooseAll('mine')} />
                <Action label={t('merge.allTheirs')} onPress={() => chooseAll('theirs')} />
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item }) => {
          if (item.kind === 'same') {
            return (
              <Text style={[styles.fold, { color: palette.faint }]}>
                {t('merge.unchanged', { count: item.count })}
              </Text>
            );
          }
          const { step, index } = item;
          if (step.kind === 'added') {
            const chapter = incoming[step.incoming];
            return (
              <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                <Toggle
                  label={`＋ ${chapter.title || t('structure.untitled')}`}
                  detail={t('merge.added', { count: chapter.text.length })}
                  value={!skipped.includes(index)}
                  onChange={(on) =>
                    setSkipped((was) => (on ? was.filter((at) => at !== index) : [...was, index]))
                  }
                  last
                />
              </View>
            );
          }
          if (step.kind === 'kept') {
            return (
              <View style={[styles.card, styles.pad, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                <Text style={{ color: palette.text, fontSize: 16 }}>
                  {base[step.base].title || t('structure.untitled')}
                </Text>
                <Text style={{ color: palette.dim, fontSize: 13, marginTop: 2 }}>{t('merge.kept')}</Text>
              </View>
            );
          }
          if (step.kind !== 'changed') return null;
          const mine = base[step.base];
          const theirs = incoming[step.incoming];
          const chosen = decisions[index];
          return (
            <View style={[styles.card, styles.pad, { backgroundColor: palette.surface, borderColor: palette.border }]}>
              <Text style={{ color: palette.text, fontSize: 16, fontWeight: '600' }}>
                {mine.title || t('structure.untitled')}
                {theirs.title && theirs.title !== mine.title ? (
                  <Text style={{ color: palette.dim, fontWeight: '400' }}>{`  →  ${theirs.title}`}</Text>
                ) : null}
              </Text>
              <Text style={{ color: chosen ? palette.dim : palette.danger, fontSize: 13, marginTop: 2 }}>
                {chosen
                  ? t(chosen === 'mine' ? 'merge.usingMine' : 'merge.usingTheirs')
                  : t('merge.changed', { mine: mine.text.length, theirs: theirs.text.length })}
              </Text>
              <View style={styles.actions}>
                <Action
                  label={t('merge.mine')}
                  tone={chosen === 'mine' ? 'loud' : 'quiet'}
                  onPress={() => setDecisions((was) => ({ ...was, [index]: 'mine' }))}
                />
                <Action
                  label={t('merge.theirs')}
                  tone={chosen === 'theirs' ? 'loud' : 'quiet'}
                  onPress={() => setDecisions((was) => ({ ...was, [index]: 'theirs' }))}
                />
              </View>
              <Pressable onPress={() => setOpen(open === index ? null : index)} hitSlop={8}>
                <Text style={{ color: palette.accent, fontSize: 14, marginTop: space.sm }}>
                  {open === index ? t('merge.hideDiff') : t('merge.showDiff')}
                </Text>
              </Pressable>
              {open === index ? <Differences from={mine.text} to={theirs.text} /> : null}
            </View>
          );
        }}
        ListFooterComponent={
          <View style={{ marginTop: space.lg, paddingBottom: insets.bottom }}>
            <View style={styles.actions}>
              <Action label={t('merge.cancel')} onPress={cancel} />
              <Action
                label={undecided ? t('merge.left', { count: undecided }) : t('merge.apply')}
                tone={undecided || sent ? 'quiet' : 'loud'}
                onPress={() => (undecided || sent ? undefined : apply())}
              />
            </View>
          </View>
        }
      />
    </View>
  );
}

/** Long runs of the same paragraphs fold to a count; only the edges of a change show. */
const SHOWN = 80;

function Differences({ from, to }: { from: string; to: string }) {
  const { t } = useTranslation();
  const palette = usePalette();
  const pieces = useMemo(() => fold(diffParagraphs(from, to)), [from, to]);
  return (
    <View style={{ marginTop: space.sm, gap: 4 }}>
      {pieces.slice(0, SHOWN).map((piece, at) =>
        'folded' in piece ? (
          <Text key={at} style={{ color: palette.faint, fontSize: 12 }}>
            {t('merge.sameParagraphs', { count: piece.folded })}
          </Text>
        ) : (
          <Text
            key={at}
            numberOfLines={piece.change === 'same' ? 2 : 6}
            style={{
              fontSize: 13,
              lineHeight: 19,
              color: piece.change === 'removed' ? palette.danger : piece.change === 'added' ? palette.accent : palette.dim,
              textDecorationLine: piece.change === 'removed' ? 'line-through' : 'none',
              backgroundColor: piece.change === 'added' ? palette.soft : 'transparent',
            }}
          >
            {`${piece.change === 'removed' ? '− ' : piece.change === 'added' ? '+ ' : '  '}${piece.text}`}
          </Text>
        )
      )}
      {pieces.length > SHOWN ? (
        <Text style={{ color: palette.faint, fontSize: 12 }}>
          {t('merge.moreChanges', { count: pieces.length - SHOWN })}
        </Text>
      ) : null}
    </View>
  );
}

function fold(pieces: DiffPiece[]): (DiffPiece | { folded: number })[] {
  const out: (DiffPiece | { folded: number })[] = [];
  for (let at = 0; at < pieces.length;) {
    if (pieces[at].change !== 'same') {
      out.push(pieces[at++]);
      continue;
    }
    let end = at;
    while (end < pieces.length && pieces[end].change === 'same') end++;
    const run = end - at;
    if (run > 2) {
      if (at > 0) out.push(pieces[at]);
      out.push({ folded: run - (at > 0 ? 1 : 0) - (end < pieces.length ? 1 : 0) });
      if (end < pieces.length) out.push(pieces[end - 1]);
    } else out.push(...pieces.slice(at, end));
    at = end;
  }
  return out;
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    overflow: 'hidden',
    marginBottom: space.sm,
  },
  pad: { padding: space.md },
  fold: { fontSize: 13, textAlign: 'center', marginVertical: space.sm },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
});
