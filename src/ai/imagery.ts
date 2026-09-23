import { NO_TEXT } from './image';
import type { ImageKind } from '../db/repo';

/** Enough chapters to build a picture from; past that they only repeat each other. */
const CAPS = { lines: 12, line: 180, summary: 300, passage: 700 };

export type Subject = {
  kind: ImageKind;
  name: string;
  /** Age, gender, role — whatever the shelf holds that narrows the picture. */
  facts: (string | null)[];
  /** What each chapter said about it, in reading order. */
  observed: string[];
  summary: string | null;
  /** The words themselves, where the picture is of a passage. */
  passage?: string;
  /** What is happening around it: this chapter, the one before, the book. */
  context?: (string | null)[];
};

const FRAMING: Record<ImageKind, string> = {
  portrait:
    'One figure, head and shoulders to waist, facing the viewer, plain uncluttered ' +
    'background, even light, painted as a character study.',
  place:
    'One view of this place, wide enough to show what it is, no people in the ' +
    'foreground, the light and weather the book gives it.',
  term:
    'The object itself, centred, lit like a museum plate, nothing else in frame.',
  passage:
    'One moment, the one these words describe — not a montage. Show what is ' +
    'happening rather than what it means.',
  cover:
    'One striking image composed as a book cover: portrait, a clear focal ' +
    'subject, generous margins at the top where a title would sit.',
  free: 'One image, a single clear subject.',
};

/**
 * The prompt a reader starts from, written here rather than bought.
 *
 * Everything in it is something the shelf already knows and a model could not
 * guess: what the chapters said this looks like, what is happening around it,
 * the words themselves. It is offered as a field rather than a fixed sentence
 * — the reader has a picture in mind and the app does not — and nothing is
 * spent until they press draw.
 */
export function promptFor(subject: Subject): string {
  const said = subject.observed
    .slice(0, CAPS.lines)
    .map((line) => line.trim().slice(0, CAPS.line))
    .filter(Boolean);
  const facts = subject.facts.filter(Boolean).join(', ');
  return [
    subject.passage
      ? `Illustrate this passage from "${subject.name}": “${subject.passage.trim().slice(0, CAPS.passage)}”`
      : `${LEAD[subject.kind]} ${subject.name}${facts ? `, ${facts}` : ''}.`,
    subject.summary?.trim() ? `Context: ${subject.summary.trim().slice(0, CAPS.summary)}` : '',
    ...(subject.context ?? [])
      .filter(Boolean)
      .map((line) => `${line!.trim().slice(0, CAPS.summary)}`),
    said.length ? `The book describes it as: ${said.join('; ')}.` : '',
    FRAMING[subject.kind],
    NO_TEXT,
  ]
    .filter(Boolean)
    .join(' ');
}

const LEAD: Record<ImageKind, string> = {
  portrait: 'Character portrait of',
  place: 'A view of',
  term: 'A depiction of',
  passage: 'A scene from',
  cover: 'Front cover art for',
  free: 'An illustration of',
};
