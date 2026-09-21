import { Fragment, useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from '../../src/navigation/router';
import { useTranslation } from 'react-i18next';
import { supports } from '../../src/books/kinds';
import { listTargets, pendingByChapter } from '../../src/db/translation';
import { labelFor } from '../../src/translate/languages';
import { queueTranslation } from '../../src/analysis/runs';

import {
  addStandaloneNote,
  getChapter,
  listAnnotations,
  listChapterCast,
  listChapterPlaces,
  listChapterTerms,
  listChapterScenes,
  renameChapterTitle,
  setChapterBrief,
  type Chapter,
  type ChapterCast,
  type ChapterPlace,
  type ChapterTerm,
  type Annotation,
  type Book,
  type Scene,
} from '../../src/db/repo';
import { estimateDeep, queueChapterRun } from '../../src/analysis/runs';
import { stoppedWithoutKey } from '../../src/ai/guard';
import { sceneOpening } from '../../src/structure/scenes';
import { formatUsd, type Estimate } from '../../src/ai/cost';
import { getBook, getDocumentText } from '../../src/db/repo';
import { EditableLine } from '../../src/ui/EditableLine';
import { Action, Badge, Block, Chip, ChipRow, Empty, Fact, Hero, Item } from '../../src/ui/detail';
import { Hint, Row, Section } from '../../src/ui/primitives';
import { openWorkQueue } from '../../src/ui/WorkQueue';
import { hueFrom } from '../../src/ui/fields';
import { NoteSheet } from '../../src/ui/NoteSheet';
import { isRecord } from '../../src/books/record';
import { space, usePalette } from '../../src/theme';
import { useWorkRefresh } from '../../src/work/refresh';

/**
 * Everything one chapter turned out to be, in one place. The list on Structure
 * is for reordering a book; this is for reading what a chapter contains — and
 * every name in it is a way into that person's own page.
 */
export default function ChapterPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const palette = usePalette();
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [cast, setCast] = useState<ChapterCast[]>([]);
  const [places, setPlaces] = useState<ChapterPlace[]>([]);
  const [terms, setTerms] = useState<ChapterTerm[]>([]);
  const [cost, setCost] = useState<Estimate | null>(null);
  const [text, setText] = useState('');
  const [scened, setScened] = useState(true);
  const [book, setBook] = useState<Book | null>(null);
  /** Notes made in this chapter, and the sheet that writes another one. */
  const [notes, setNotes] = useState<Annotation[]>([]);
  const [writing, setWriting] = useState(false);
  const [queued, setQueued] = useState(false);
  /** The languages this book is being translated into, and what is left here. */
  const [targets, setTargets] = useState<{ target: string; pending: number }[]>([]);
  const [queuedTargets, setQueuedTargets] = useState<Set<string>>(new Set());
  const [queueError, setQueueError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!id) return;
    getChapter(id).then(async (found) => {
      setChapter(found);
      if (!found) return;
      setScenes(await listChapterScenes(found.id));
      setCast(await listChapterCast(found.book_id, found.idx));
      setPlaces(await listChapterPlaces(found.book_id, found.idx));
      setTerms(await listChapterTerms(found.book_id, found.idx));
      const book = await getBook(found.book_id);
      setBook(book);
      // A bible has chapters and verses, not scenes, and a book with no words
      // has nothing to split. Offering an empty section for either says the
      // analysis failed, when it was never asked.
      setScened(supports(book?.kind, 'scenes') && !(book && isRecord(book)));
      setNotes(
        (await listAnnotations(found.book_id)).filter((note) =>
          note.chapter_id
            ? note.chapter_id === found.id
            : !note.standalone && note.start >= found.start && note.start < found.end
        )
      );
      const languages = await listTargets(found.book_id);
      setTargets(
        await Promise.all(
          languages.map(async (row) => ({
            target: row.target,
            pending:
              (await pendingByChapter(found.book_id, row.target)).find(
                (entry) => entry.chapter_idx === found.idx
              )?.pending ?? 0,
          }))
        )
      );
      const body = await getDocumentText(found.book_id);
      setText(body);
      if (book) setCost(await estimateDeep(body, [found], book));
    });
  }, [id]);

  useFocusEffect(load);
  // A pass that lands while this page is open has to show up on it.
  useWorkRefresh(load);

  if (!chapter) {
    return (
      <View style={[styles.center, { backgroundColor: palette.bg }]}>
        <ActivityIndicator />
      </View>
    );
  }

  // A chapter of a book with no words: nothing to open, but everything to write
  // about — which is the whole point of a record having chapters at all.
  const record = book ? isRecord(book) : false;

  const read = (at?: number) =>
    router.push(
      `/reader/${chapter.book_id}?chapter=${chapter.idx}${at === undefined ? '' : `&at=${at}`}`
    );

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}
    >
      <Stack.Screen options={{ title: t('chapter.title'), headerBackTitle: ' ' }} />

      <Hero
        // A title that already names the chapter makes the eyebrow an argument:
        // "CHAPTER 3" over "第2章 新手武器" reads as a bug, not as context.
        eyebrow={namesItself(chapter.title) ? undefined : t('chapter.number', { index: chapter.idx + 1 })}
        facts={
          <>
            {/* A fact that reads "0 places" is not a fact anyone needed. */}
            {scenes.length > 0 && <Fact value={scenes.length} label={t('units.unit_scenes')} />}
            {cast.length > 0 && <Fact value={cast.length} label={t('units.unit_cast')} />}
            {places.length > 0 && <Fact value={places.length} label={t('units.unit_places')} />}
          </>
        }
        actions={
          <>
            {record ? (
              <Action label={t('chapter.note')} onPress={() => setWriting(true)} tone="loud" />
            ) : (
              <Action label={t('chapter.read')} onPress={() => read()} tone="loud" />
            )}
            <Action
              label={t('chapter.analyzeShort')}
              onPress={async () => {
                setQueueError(null);
                if (await stoppedWithoutKey(t)) return;
                try {
                  await queueChapterRun(chapter.book_id, 'deep-analyze', [chapter]);
                  setQueued(true);
                } catch (problem) {
                  // A tap that quietly does nothing is the worst answer there is.
                  setQueueError(String(problem));
                }
              }}
            />
          </>
        }
        // A price under two buttons reads as belonging to the loud one. Only
        // the pass costs anything, so the line says whose price it is.
        note={
          queueError
            ? t('work.queueFailed', { error: queueError })
            : queued
              ? t('work.queuedOpen')
              : cost
                ? t('ai.estimateFor', {
                    action: t('chapter.analyzeShort'),
                    tokens: cost.inputTokens.toLocaleString(),
                    cost: formatUsd(cost.usd),
                  })
                : t('ai.estimateNoKey')
        }
        onNotePress={queued ? openWorkQueue : undefined}
      >
        <EditableLine
          value={chapter.title}
          placeholder={t('structure.untitled')}
          onCommit={(value) => renameChapterTitle(chapter.id, value).then(load)}
          style={{ color: palette.text, fontSize: 26, fontWeight: '700', lineHeight: 32 }}
        />
        <EditableLine
          value={chapter.brief}
          placeholder={t('structure.briefPlaceholder')}
          onCommit={(value) => setChapterBrief(chapter.id, value.trim() || null).then(load)}
          style={{ color: palette.dim, fontSize: 15, lineHeight: 22, marginTop: space.sm }}
          multiline
          numberOfLines={8}
        />
      </Hero>

      {scened ? (
      <Block title={t('chapter.scenes')} count={scenes.length || undefined}>
        {scenes.length === 0 ? (
          <Empty text={t('chapter.noScenes')} />
        ) : (
          scenes.map((scene, index) => (
            // The name is the way in: everything about a scene, and every edit
            // to it, lives on its own page rather than being retyped here.
            <Item
              key={scene.id}
              badge={<Badge n={index + 1} />}
              // Nothing has named this one yet, and the badge already says which
              // it is — so it is shown by how it starts rather than by a number
              // dressed up as a title.
              title={scene.title?.trim() || sceneOpening(text, scene)}
              quiet={!scene.title?.trim()}
              detail={scene.summary?.trim() || undefined}
              onPress={() => router.push(`/scene/${scene.id}`)}
            />
          ))
        )}
      </Block>
      ) : null}

      {/* What the reader wrote here. On a book with no text this is the page's
          reason to exist; on one with text it is the notes made inside it. */}
      <Block
        title={t('book.notes')}
        count={notes.length || undefined}
        action={{ label: '＋', onPress: () => setWriting(true) }}
        onOpen={() => router.push(`/book/${chapter.book_id}/notes`)}
      >
        {notes.length === 0 ? (
          <Empty
            text={t('chapter.noNotes')}
            action={{ label: t('chapter.note'), onPress: () => setWriting(true) }}
          />
        ) : (
          notes
            .slice(0, 6)
            .map((note) => (
              <Item
                key={note.id}
                title={note.note?.trim() || note.quote}
                detail={note.note?.trim() ? note.quote || undefined : undefined}
                onPress={() => router.push(`/book/${chapter.book_id}/notes`)}
              />
            ))
        )}
      </Block>

      <Block title={t('chapter.cast')} count={cast.length || undefined}>
        {cast.length === 0 ? (
          <Empty text={t('chapter.noCast')} />
        ) : (
          <ChipRow>
            {cast.map((person) => (
              <Chip
                key={person.id}
                label={person.name}
                detail={
                  [person.observed_appearance, person.observed_voice, person.observed_note]
                    .filter(Boolean)
                    .join(' · ') || undefined
                }
                hue={hueFrom(person.name)}
                onPress={() => router.push(`/entity/${person.id}`)}
              />
            ))}
          </ChipRow>
        )}
      </Block>

      <Block title={t('chapter.places')} count={places.length || undefined}>
        {places.length === 0 ? (
          <Empty text={t('chapter.noPlaces')} />
        ) : (
          <ChipRow>
            {places.map((place) => (
              <Chip
                key={place.id}
                label={place.name}
                detail={place.observed_note ?? undefined}
                hue={hueFrom(place.name)}
                onPress={() => router.push(`/place/${place.id}`)}
              />
            ))}
          </ChipRow>
        )}
      </Block>

      {/* What this chapter names that is neither a person nor a place. Each is
          a page of its own, because a term met here is wanted forty chapters on. */}
      <Block title={t('chapter.terms')} count={terms.length || undefined}>
        {terms.length === 0 ? (
          <Empty text={t('chapter.noTerms')} />
        ) : (
          <ChipRow>
            {terms.map((term) => (
              <Chip
                key={term.id}
                label={term.name}
                detail={term.observed_note ?? undefined}
                hue={hueFrom(term.name)}
                onPress={() => router.push(`/term/${term.id}`)}
              />
            ))}
          </ChipRow>
        )}
      </Block>

      <NoteSheet
        visible={writing}
        quote=""
        note={null}
        onSave={(note) => {
          setWriting(false);
          if (!note.trim()) return;
          void addStandaloneNote({
            bookId: chapter.book_id,
            chapterId: chapter.id,
            note,
          }).then(load);
        }}
        onClose={() => setWriting(false)}
      />

      {/* Translation is per chapter here for the same reason analysis is: this
          is the one you are reading, and it should not wait behind the book. */}
      <Section title={t('book.translations')}>
        {targets.length === 0 ? (
          <Row
            label={t('chapter.setUpTranslation')}
            value="›"
            onPress={() => router.push(`/book/${chapter.book_id}/translation`)}
            last
          />
        ) : (
          targets.map((entry, index) => (
            <Fragment key={entry.target}>
              <Row
                label={t('chapter.translateInto', { language: labelFor(entry.target) })}
                detail={
                  entry.pending
                    ? t('translate.sentencesLeft', { count: entry.pending })
                    : t('translate.allDone')
                }
                value={
                  queuedTargets.has(entry.target)
                    ? t('work.queuedShort')
                    : entry.pending
                      ? t('cast.costs')
                      : '✓'
                }
                onPress={
                  entry.pending && !queuedTargets.has(entry.target)
                    ? async () => {
                        if (await stoppedWithoutKey(t)) return;
                        await queueTranslation(chapter.book_id, entry.target, [
                          { idx: chapter.idx, label: chapter.title.trim() || `${chapter.idx + 1}` },
                        ]);
                        setQueuedTargets((was) => new Set(was).add(entry.target));
                      }
                    : undefined
                }
              />
              <Row
                label={t('chapter.openTranslation')}
                value="›"
                onPress={() =>
                  router.push(
                    `/book/${chapter.book_id}/translation?target=${entry.target}&chapter=${chapter.idx}`
                  )
                }
                last={index === targets.length - 1}
              />
            </Fragment>
          ))
        )}
      </Section>

      <Hint>{t('chapter.hint')}</Hint>
    </ScrollView>
  );
}

/** `第12章`, `Chapter 12`, `12.` — a title that carries its own number. */
function namesItself(title: string): boolean {
  return /^\s*(第\s*[0-9零一二三四五六七八九十百千两]+\s*[章回节卷篇]|chapter\s*\d+|ch\.?\s*\d+|\d+[.、])/i.test(title);
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
