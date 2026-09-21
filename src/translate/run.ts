import { estimate, type Estimate } from '../ai/cost';
import { runUnits } from '../ai/run';
import type { Chapter } from '../db/repo';
import {
  listMemory,
  listTerms,
  listUnits,
  saveMachine,
  seedUnits,
  type MemoryEntry,
  type Term,
} from '../db/translation';
import { segmentSentences } from '../text/segment';
import { AlignmentError, buildMessages, parseNumbered, type Span } from './context';

/** Sentences per request. Small enough that one bad answer is cheap to redo. */
const SPAN_SIZE = 25;
const MIN_SPAN = 3;
const MAX_DEPTH = 3;

export type Sentence = { start: number; end: number; source: string };

export function sentencesOf(text: string, chapter: Chapter, language: string): Sentence[] {
  return segmentSentences(text.slice(chapter.start, chapter.end), language, chapter.start).map(
    (span) => ({ start: span.start, end: span.end, source: text.slice(span.start, span.end) })
  );
}

/** Creating the units is free and local; it is what makes progress countable. */
export async function prepare(
  bookId: string,
  target: string,
  text: string,
  chapters: Chapter[],
  language: string
) {
  const units = chapters.flatMap((chapter) =>
    sentencesOf(text, chapter, language).map((sentence) => ({
      chapter_idx: chapter.idx,
      start: sentence.start,
      end: sentence.end,
      source: sentence.source,
    }))
  );
  await seedUnits(bookId, target, units);
  return units.length;
}

export async function pendingSpans(
  bookId: string,
  target: string,
  chapterIdx?: number
): Promise<Span[]> {
  const units = await listUnits(bookId, target, chapterIdx);
  const pending = units.filter((unit) => !unit.machine || unit.stale);
  const byChapter = new Map<number, Sentence[]>();
  for (const unit of pending) {
    if (!byChapter.has(unit.chapter_idx)) byChapter.set(unit.chapter_idx, []);
    byChapter.get(unit.chapter_idx)!.push({ start: unit.start, end: unit.end, source: unit.source });
  }

  const spans: Span[] = [];
  for (const [chapterIdx, sentences] of [...byChapter].sort((a, b) => a[0] - b[0])) {
    for (let from = 0; from < sentences.length; from += SPAN_SIZE) {
      spans.push({ chapterIdx, sentences: sentences.slice(from, from + SPAN_SIZE) });
    }
  }
  return spans;
}

export function estimateTranslation(spans: Span[], language: string): Promise<Estimate | null> {
  return estimate({
    units: spans.map((span) => span.sentences.map((sentence) => sentence.source).join('\n')),
    language,
    // Target text runs roughly as long as the source, plus the numbering.
    outputRatio: 1.3,
    overheadTokens: 400,
  });
}

export type TranslationRun = { translated: number; failed: number; spans: number };

export async function translate(
  bookId: string,
  target: string,
  documentText: string,
  sourceLanguage: string,
  hooks: {
    onProgress?: (done: number, total: number) => void;
    signal?: AbortSignal;
    /** One chapter at a time, when the work is a queued job rather than a sheet. */
    chapterIdx?: number;
  } = {}
): Promise<TranslationRun> {
  const spans = await pendingSpans(bookId, target, hooks.chapterIdx);
  if (!spans.length) return { translated: 0, failed: 0, spans: 0 };

  const terms = await listTerms(bookId, target);
  const memory = await listMemory(bookId, target);

  let done = 0;
  const report = () => hooks.onProgress?.(++done, spans.length);

  let translated = 0;
  let failed = 0;
  for (const span of spans) {
    const result = await runSpan(span, {
      bookId, target, documentText, sourceLanguage, terms, memory, signal: hooks.signal, depth: 0,
    });
    translated += result.translated;
    failed += result.failed;
    report();
  }
  return { translated, failed, spans: spans.length };
}

type SpanContext = {
  bookId: string;
  target: string;
  documentText: string;
  sourceLanguage: string;
  terms: Term[];
  memory: MemoryEntry[];
  signal?: AbortSignal;
  depth: number;
};

/**
 * A span whose answer doesn't line up is asked again in halves rather than
 * accepted — misaligned sentences would silently attach the wrong translation
 * to the wrong offsets, which is worse than no translation at all.
 */
async function runSpan(span: Span, context: SpanContext): Promise<{ translated: number; failed: number }> {
  const results = await runUnits<Span, { start: number; end: number; text: string }[]>(
    {
      kind: `translate:${context.target}`,
      units: [{ id: `${span.chapterIdx}:${span.sentences[0]?.start ?? 0}`, input: span }],
      prompt: (input) =>
        buildMessages({
          span: input,
          sourceLanguage: context.sourceLanguage,
          target: context.target,
          terms: context.terms,
          memory: context.memory,
          documentText: context.documentText,
        }),
      parse: (answer, input) =>
        parseNumbered(answer, input.sentences.length).map((line) => ({
          start: input.sentences[line.index - 1].start,
          end: input.sentences[line.index - 1].end,
          text: line.text,
        })),
      maxTokens: Math.max(600, span.sentences.length * 120),
      retries: 0,
    },
    context.signal
  );

  const [result] = results;
  if (result?.value) {
    await saveMachine(context.bookId, context.target, result.value);
    return { translated: result.value.length, failed: 0 };
  }

  const splittable =
    result?.error instanceof AlignmentError &&
    context.depth < MAX_DEPTH &&
    span.sentences.length > MIN_SPAN;
  if (!splittable) return { translated: 0, failed: span.sentences.length };

  const middle = Math.ceil(span.sentences.length / 2);
  const halves: Span[] = [
    { chapterIdx: span.chapterIdx, sentences: span.sentences.slice(0, middle) },
    { chapterIdx: span.chapterIdx, sentences: span.sentences.slice(middle) },
  ];
  let translated = 0;
  let failed = 0;
  for (const half of halves) {
    const outcome = await runSpan(half, { ...context, depth: context.depth + 1 });
    translated += outcome.translated;
    failed += outcome.failed;
  }
  return { translated, failed };
}
