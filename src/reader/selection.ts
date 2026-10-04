import type { Span } from '../text/segment';

/**
 * Turning what the reader selected on the glass back into where it is in the
 * book.
 *
 * A paragraph on screen is not a slice of the manuscript. It is a verse number
 * that is not in the text, then one run per sentence — and between two
 * sentences the manuscript may hold whitespace that neither run shows. So an
 * offset into the drawn paragraph is not an offset into the document plus a
 * constant, and treating it as one puts a highlight a few characters to the
 * left of the words it was made over, which is the kind of wrong that is only
 * noticed later, in the notes list, by which time nobody knows why.
 *
 * Hence a map: every run, where it starts on screen and where it starts in the
 * book. Built once per paragraph from the same strings that were drawn.
 */
export type Origin = {
  /** Where this run begins in the paragraph as drawn. */
  shownStart: number;
  shownEnd: number;
  /** Where the same text begins in the document. */
  docStart: number;
};

/**
 * `prefix` is what is drawn before the first sentence and is in no document —
 * a verse number, and the spaces after it.
 */
export function originsOf(prefix: number, spans: Span[], shownOf: (span: Span) => string): Origin[] {
  const origins: Origin[] = [];
  let shown = prefix;
  for (const span of spans) {
    const length = shownOf(span).length;
    origins.push({ shownStart: shown, shownEnd: shown + length, docStart: span.start });
    shown += length;
  }
  return origins;
}

/**
 * Several paragraphs drawn as one block, so a selection can run from one into
 * the next. Each paragraph brings its own prefix; `separator` is what is drawn
 * between two of them and is in no document either.
 */
export function blockOrigins(
  paragraphs: { prefix: number; spans: Span[] }[],
  separator: number,
  shownOf: (span: Span) => string
): Origin[] {
  const origins: Origin[] = [];
  let shown = 0;
  paragraphs.forEach((paragraph, at) => {
    if (at > 0) shown += separator;
    const own = originsOf(shown + paragraph.prefix, paragraph.spans, shownOf);
    origins.push(...own);
    shown = own.length ? own[own.length - 1].shownEnd : shown + paragraph.prefix;
  });
  return origins;
}

/**
 * Which run a drawn offset is in, and how far into it.
 *
 * Clamped to the ends rather than refused. A selection dragged from before the
 * first word — which is what starting on the verse number is — covers real
 * text, and answering `null` for it threw the whole selection away.
 */
function locate(origins: Origin[], shown: number): number {
  const first = origins[0];
  const last = origins[origins.length - 1];
  if (shown <= first.shownStart) return first.docStart;
  for (const origin of origins) {
    // Between runs drawn from different paragraphs — a separator, the next
    // verse number — belongs to the words that follow.
    if (shown < origin.shownStart) return origin.docStart;
    if (shown <= origin.shownEnd) {
      return origin.docStart + (shown - origin.shownStart);
    }
  }
  return last.docStart + (last.shownEnd - last.shownStart);
}

/**
 * The document range a drawn selection covers, or nothing if it covers no
 * text at all.
 *
 * The end is resolved against the run it *ends in*, which for a selection
 * finishing exactly on a boundary is the run before — otherwise a selection of
 * one whole sentence would end at the start of the next one and the highlight
 * would reach a character into it.
 *
 * Nothing is returned for an empty selection, which is what a tap is: a caret
 * with no width selects no words, and the reader has not asked for anything.
 */
export function documentRange(origins: Origin[], from: number, to: number): Span | null {
  if (!origins.length || to <= from) return null;
  const start = locate(origins, from);
  const end = locate(origins, to);
  if (end <= start) return null;
  return { start, end };
}
