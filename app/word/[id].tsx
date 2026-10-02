import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from '../../src/navigation/router';
import { useTranslation } from 'react-i18next';

import {
  deleteEntity,
  getBook,
  getDocumentText,
  getEntity,
  listChapters,
  parseFields,
  referencesAt,
  updateEntity,
  type Book,
  type Chapter,
  type Entity,
} from '../../src/db/repo';
import { appearancesIn, namesOf, type Appearance } from '../../src/cast/mentions';
import { chapterLabel } from '../../src/ui/AppearanceGraph';
import { canLookUp, hasDefinition, lookUp, openWebLookUp } from '../../src/text/dictionary';
import { gloss, glossTarget } from '../../src/words/gloss';
import { studySites } from '../../src/scripture/study';
import { supports } from '../../src/books/kinds';
import { EditableLine } from '../../src/ui/EditableLine';
import { FieldsSection } from '../../src/ui/FieldsSection';
import { Block, Empty, Fact, Hero, Item } from '../../src/ui/detail';
import { Hint, Row, Section } from '../../src/ui/primitives';
import { space, usePalette } from '../../src/theme';

/** Enough to read the word in use without the block becoming the chapter. */
const SHOWN = 8;

/**
 * A word, a phrase, or a turn of speech — whatever stretch of the book the
 * reader wanted to keep. Not a concept, which is what a term is: a term is an
 * idea the book explains, and this is the language the book said it in.
 *
 * Three things it can tell you, and the order is deliberate:
 *
 * - What it means, from the dictionary already on the phone. Offline, free,
 *   and better than anything this app could write: real senses, parts of
 *   speech and example sentences.
 * - What it means in your language, when the phone has no entry — a name in
 *   Hebrew, a four-character idiom, a term of art. That one costs a key, so it
 *   is a button and never happens on its own.
 * - Where else the book says it, which is the reason a word gets a page at
 *   all. A word met once is a word you looked up; a word met eleven times is
 *   one the author is building something out of.
 *
 * The row is written the moment the word is collected, because the reader is
 * in the middle of reading and must not be asked to confirm anything. A page
 * left without a mark on it takes its row with it when it closes — see the
 * unmount below, which is how the terms page has always done this.
 */
export default function WordPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const palette = usePalette();
  const [word, setWord] = useState<Entity | null>(null);
  const [book, setBook] = useState<Book | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [text, setText] = useState('');
  /** Whether the phone's own dictionaries carry it; asked once, per word. */
  const [defined, setDefined] = useState<boolean | null>(null);
  const [translating, setTranslating] = useState(false);
  /** `John 3:16` for the lines shown, where the book has verses to cite. */
  const [cited, setCited] = useState<Map<number, string>>(new Map());
  const latest = useRef<Entity | null>(null);
  latest.current = word;

  // A word collected and then left alone was never collected. Same rule as a
  // term, and the reason the row can be written without asking.
  useEffect(
    () => () => {
      const leaving = latest.current;
      if (leaving && isBlank(leaving)) void deleteEntity(leaving.id);
    },
    []
  );

  const load = useCallback(() => {
    if (!id) return;
    getEntity(id).then(async (found) => {
      setWord(found);
      if (!found) return;
      setBook(await getBook(found.book_id));
      setChapters(await listChapters(found.book_id));
      setText(await getDocumentText(found.book_id));
    });
  }, [id]);

  useFocusEffect(load);

  const name = word?.name.trim() ?? '';

  useEffect(() => {
    if (!name || !canLookUp()) {
      setDefined(false);
      return;
    }
    let current = true;
    setDefined(null);
    hasDefinition(name).then((yes) => {
      if (current) setDefined(yes);
    });
    return () => {
      current = false;
    };
  }, [name]);

  /**
   * Every place the book says it. An `indexOf` scan over text already in
   * memory, so it is instant and costs nothing — there is nothing here worth
   * storing, and a stored count is one that goes stale when a chapter is
   * re-split.
   */
  const found = useMemo<Appearance[]>(() => {
    if (!word || !text || !chapters.length || !name) return [];
    return appearancesIn(text, chapters, namesOf(word), { from: 0, to: chapters.length }, 200);
  }, [word, text, chapters, name]);

  useEffect(() => {
    if (!word || !found.length) {
      setCited(new Map());
      return;
    }
    let current = true;
    referencesAt(word.book_id, found.slice(0, SHOWN).map((one) => one.offset)).then((map) => {
      if (current) setCited(map);
    });
    return () => {
      current = false;
    };
  }, [word, found]);

  if (!word) {
    return (
      <View style={[styles.centre, { backgroundColor: palette.bg }]}>
        <ActivityIndicator />
      </View>
    );
  }

  async function save(changes: Parameters<typeof updateEntity>[1]) {
    await updateEntity(word!.id, changes);
    load();
  }

  const target = glossTarget();

  /** Paid for, so it is a button — and it says what it will cost before it runs. */
  async function translate() {
    if (!name || translating) return;
    setTranslating(true);
    try {
      const said = await gloss(name, book?.language, quoteAround(found[0]));
      if (said) await save({ summary: said });
      else Alert.alert(t('word.glossFailed'));
    } catch (problem) {
      Alert.alert(t('word.glossFailed'), String(problem));
    } finally {
      setTranslating(false);
    }
  }

  function confirmDelete() {
    Alert.alert(t('word.deleteConfirm'), undefined, [
      { text: t('settings.cancel'), style: 'cancel' },
      {
        text: t('settings.delete'),
        style: 'destructive',
        onPress: async () => {
          // Cleared first, or the unmount above deletes a row already gone.
          latest.current = null;
          await deleteEntity(word!.id);
          router.back();
        },
      },
    ]);
  }

  const chaptersWithIt = new Set(found.map((one) => one.chapterIdx)).size;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.bg }}
      contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen options={{ title: name || t('word.name'), headerBackTitle: ' ' }} />

      <Hero
        eyebrow={t('word.eyebrow')}
        growsDown
        facts={
          found.length ? (
            <>
              <Fact value={String(found.length)} label={t('word.timesSaid')} />
              <Fact
                value={t('units.chapterShort', { n: found[0].chapterIdx + 1 })}
                label={t('word.firstSaid')}
              />
              {chaptersWithIt > 1 ? (
                <Fact value={String(chaptersWithIt)} label={t('word.inChapters')} />
              ) : null}
            </>
          ) : undefined
        }
      >
        {/* The word is the title, and it is editable: what the selection
            caught is often a character more than the word — a comma, a quote
            mark — and fixing it here is quicker than selecting it again. */}
        <EditableLine
          value={word.name}
          placeholder={t('word.name')}
          onCommit={(value) => value.trim() && save({ name: value.trim() })}
          style={{ color: palette.text, fontSize: 26, fontWeight: '700', lineHeight: 32 }}
        />
        <EditableLine
          value={word.alias}
          placeholder={t('word.aliasPlaceholder')}
          onCommit={(value) => save({ alias: value.trim() || null })}
          style={{ color: palette.faint, fontSize: 14, marginTop: 2 }}
        />
      </Hero>

      {/* What it means. The phone's own dictionary leads where it has an
          entry, because it is offline, instant and more thorough than a
          sentence from a model. */}
      <Section>
        {defined ? (
          <Row label={t('word.lookUp')} detail={t('word.lookUpDetail')} onPress={() => void lookUp(name)} />
        ) : null}
        <Row
          label={t('word.wiktionary')}
          onPress={() => void openWebLookUp(name, book?.language)}
          last={!name || defined === false}
        />
        {name && defined === false ? (
          <Row
            label={translating ? t('word.glossing') : t('word.gloss', { language: target.label })}
            detail={translating ? undefined : t('word.glossDetail')}
            onPress={translate}
            last
          />
        ) : null}
      </Section>
      {defined === false && canLookUp() ? <Hint>{t('word.noSystemEntry')}</Hint> : null}

      <EditableLine
        value={word.summary}
        placeholder={t('word.summaryPlaceholder')}
        multiline
        onCommit={(value) => save({ summary: value.trim() || null })}
        style={{ color: palette.text, fontSize: 16, lineHeight: 24, marginTop: space.md }}
      />

      {/* Where else the book says it — the reason this has a page. */}
      <Block title={t('word.said')} count={found.length || undefined}>
        {found.length === 0 ? (
          <Empty text={t('word.notSaid')} />
        ) : (
          found.slice(0, SHOWN).map((one, index) => (
            <Item
              key={one.offset}
              title={one.quote}
              quiet
              // A verse where the edition has them, the chapter otherwise.
              meta={cited.get(one.offset) ?? chapterLabel(chapters, one.chapterIdx)}
              onPress={() => router.push(`/reader/${word.book_id}?at=${one.offset}`)}
              last={index === Math.min(found.length, SHOWN) - 1}
            />
          ))
        )}
      </Block>

      {/* Scripture only. What a concordance cannot do — the Greek behind the
          English, a lexicon, cross-references — is somebody else's work, and
          free on the web rather than megabytes in this app. */}
      {supports(book?.kind, 'verses') && name ? (
        <Section title={t('word.study')}>
          {studySites.map((site, index) => (
            <Row
              key={site.id}
              label={site.label}
              link
              onPress={() => void Linking.openURL(site.url(name))}
              last={index === studySites.length - 1}
            />
          ))}
        </Section>
      ) : null}

      <FieldsSection
        title={t('word.fields')}
        fields={parseFields(word.fields)}
        onChange={(fields) => save({ fields: JSON.stringify(fields) })}
      />

      <Hint>{t('word.hint')}</Hint>

      <Section>
        <Row label={t('settings.delete')} onPress={confirmDelete} danger last />
      </Section>
    </ScrollView>
  );
}

/** The sentence it was taken from, which is what tells a gloss which sense. */
function quoteAround(first: Appearance | undefined): string | undefined {
  return first?.quote.replace(/^…|…$/g, '').trim() || undefined;
}

/**
 * Nothing but the word itself, which is a page that was opened and closed. The
 * name counts as a mark here where it does not for a term: a word arrives with
 * its name already filled in by the selection, so a name alone is the row as
 * the reader found it and not something they wrote.
 */
function isBlank(entity: Entity): boolean {
  return (
    !entity.alias &&
    !entity.summary &&
    parseFields(entity.fields).filter((field) => field.label.trim() || field.value.trim()).length === 0
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
