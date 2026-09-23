import type { Paragraph } from '../reader/model';

/** A stored sentence: where it was, its own words, and what they became. */
export type Unit = {
  start: number;
  end: number;
  source: string;
  machine: string | null;
  edited: string | null;
};

export type Placement = {
  /**
   * `sentences` — one sentence at a time, so a tap still finds one.
   * `paragraph` — the sentences no longer line up; drawn as one string.
   * `absorbed` — its words are inside a neighbour's unit, printed there.
   */
  kind: 'sentences' | 'paragraph' | 'absorbed';
  /** The paragraph in the target language; empty when nothing translates it. */
  text: string;
};

export type TranslatedPage = {
  paragraphs: Map<number, Placement>;
  /** By sentence start, for the paragraphs still drawn a sentence at a time. */
  sentences: Map<number, string>;
};

export function translationOf(unit: Unit): string {
  return (unit.edited ?? unit.machine ?? '').trim();
}

/**
 * Which words of the page each translated sentence belongs to.
 *
 * A unit remembers where it was when it was made, and that is only where it
 * still is while the manuscript is split the way it was split then. Two ways
 * it stops being: the words move, and a unit made before the splitter agreed
 * with the reader's runs across a paragraph break — swallowing the paragraph
 * after it, which then has nothing of its own and used to fall back to the
 * language the book was written in, one original paragraph in the middle of a
 * translated page.
 *
 * So a unit is found by its own words first, then given to the paragraph
 * holding most of them, and a paragraph whose words are all inside somebody
 * else's unit draws nothing rather than drawing itself twice, once in each
 * language. A paragraph nothing translates still shows the original — that is
 * a chapter half done, not a chapter mis-filed.
 */
export function placeTranslation(
  paragraphs: Paragraph[],
  units: Unit[],
  text: string
): TranslatedPage {
  const page: TranslatedPage = { paragraphs: new Map(), sentences: new Map() };
  if (!paragraphs.length) return page;

  const bounds = paragraphs.map((paragraph) => ({
    start: paragraph.start,
    end: paragraph.sentences.at(-1)?.end ?? paragraph.start,
  }));
  const chapter = { start: bounds[0].start, end: bounds[bounds.length - 1].end };

  const placed = units
    .filter((unit) => translationOf(unit))
    .map((unit) => anchor(unit, text, chapter))
    .sort((a, b) => a.start - b.start);

  const mine: Unit[][] = paragraphs.map(() => []);
  const overlapped = paragraphs.map(() => false);
  const covered = new Set<number>();

  let from = 0;
  for (const unit of placed) {
    page.sentences.set(unit.start, translationOf(unit));
    while (from < bounds.length && bounds[from].end <= unit.start) from += 1;
    let best = -1;
    let most = 0;
    for (let at = from; at < bounds.length && bounds[at].start < unit.end; at += 1) {
      const overlap = Math.min(bounds[at].end, unit.end) - Math.max(bounds[at].start, unit.start);
      if (overlap <= 0) continue;
      overlapped[at] = true;
      for (const span of paragraphs[at].sentences) {
        if (unit.start < span.end && unit.end > span.start) covered.add(span.start);
      }
      if (overlap > most) {
        most = overlap;
        best = at;
      }
    }
    if (best >= 0) mine[best].push(unit);
  }

  paragraphs.forEach((paragraph, at) => {
    const here = mine[at];
    if (!here.length) {
      page.paragraphs.set(paragraph.start, {
        kind: overlapped[at] ? 'absorbed' : 'sentences',
        text: '',
      });
      return;
    }
    // Drawn a sentence at a time while that still says everything: no unit
    // starts in the middle of one, and a sentence with no unit of its own has
    // none anywhere, so its own words are the honest thing to show.
    const starts = new Set(paragraph.sentences.map((span) => span.start));
    const own = new Set(here.map((unit) => unit.start));
    const tidy =
      here.every((unit) => starts.has(unit.start)) &&
      paragraph.sentences.every((span) => own.has(span.start) || !covered.has(span.start));
    page.paragraphs.set(paragraph.start, {
      kind: tidy ? 'sentences' : 'paragraph',
      text: assemble(paragraph, here, covered, text),
    });
  });

  return page;
}

/** Translations where they land, and whatever no unit reaches still in the original. */
function assemble(paragraph: Paragraph, here: Unit[], covered: Set<number>, text: string): string {
  const pieces = here.map((unit) => ({ at: unit.start, text: translationOf(unit) }));
  for (const span of paragraph.sentences) {
    if (!covered.has(span.start)) pieces.push({ at: span.start, text: text.slice(span.start, span.end) });
  }
  pieces.sort((a, b) => a.at - b.at);
  return pieces.reduce((line, piece) => (line ? `${line}${gap(line, piece.text)}${piece.text}` : piece.text), '');
}

/** A script whose punctuation carries its own width, so no space is wanted. */
const TIGHT = /[\u3000-\u303f\u3400-\u9fff\uf900-\ufaff\uff00-\uffef]/;
/** Quotes belong to a sentence but say nothing about its script. */
const EDGE = /[\s"'\u2018\u2019\u201c\u201d\u00ab\u00bb()[\]]/;

/** Chinese sets its sentences end to end; a space between them is a hole. */
export function endsTight(text: string): boolean {
  return TIGHT.test(edge(text, -1));
}

function gap(before: string, after: string): string {
  return endsTight(before) && TIGHT.test(edge(after, 1)) ? '' : ' ';
}

/** The character a join actually meets, looking past the quotes around it. */
function edge(text: string, direction: 1 | -1): string {
  let at = direction < 0 ? text.length - 1 : 0;
  while (at >= 0 && at < text.length && EDGE.test(text[at])) at += direction;
  return text[at] ?? '';
}

function anchor(unit: Unit, text: string, chapter: { start: number; end: number }): Unit {
  if (text.slice(unit.start, unit.end) === unit.source) return unit;
  const found = nearest(text, unit.source, unit.start, chapter);
  return found < 0 ? unit : { ...unit, start: found, end: found + unit.source.length };
}

/** The same sentence can occur twice in a chapter; the one nearest where it was wins. */
function nearest(text: string, needle: string, hint: number, chapter: { start: number; end: number }): number {
  if (!needle) return -1;
  let best = -1;
  let from = chapter.start;
  while (true) {
    const at = text.indexOf(needle, from);
    if (at < 0 || at >= chapter.end) break;
    if (best < 0 || Math.abs(at - hint) < Math.abs(best - hint)) best = at;
    from = at + 1;
  }
  return best;
}
