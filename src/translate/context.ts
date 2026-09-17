import type { ChatMessage } from '../ai/client';
import type { MemoryEntry, Term } from '../db/translation';
import { englishName } from './languages';
import { termsIn } from './terms';

export type Span = { chapterIdx: number; sentences: { start: number; end: number; source: string }[] };

const MAX_MEMORY = 5;
const CONTEXT_CHARS = 400;

/**
 * Only what this span actually needs: the glossary entries that occur in it,
 * the handful of past corrections that resemble it, and the paragraphs either
 * side for pronouns and tense. Sending the whole glossary for every chapter is
 * how a translation run gets expensive without getting better.
 */
export function buildMessages(input: {
  span: Span;
  sourceLanguage: string;
  target: string;
  terms: Term[];
  memory: MemoryEntry[];
  documentText: string;
}): ChatMessage[] {
  const body = input.span.sentences.map((sentence) => sentence.source).join('\n');
  const glossary = termsIn(body, input.terms);
  const examples = nearestMemory(body, input.memory);
  const first = input.span.sentences[0];
  const last = input.span.sentences[input.span.sentences.length - 1];

  const rules = [
    `Translate into ${englishName(input.target)}.`,
    'The input is numbered lines. Reply with the same numbers, one line each, ' +
      'in the same order, and nothing else. Never merge or split lines.',
    'Keep the register and the paragraphing of the original.',
  ];
  if (glossary.length) {
    rules.push(
      'Use these translations exactly, every time they occur:\n' +
        glossary.map((term) => `- ${term.source} → ${term.translation}`).join('\n')
    );
  }
  if (examples.length) {
    rules.push(
      'Earlier corrections by the author, for tone. Follow their choices:\n' +
        examples.map((entry) => `- ${entry.source} → ${entry.edited}`).join('\n')
    );
  }

  const before = input.documentText.slice(Math.max(0, first.start - CONTEXT_CHARS), first.start).trim();
  const after = input.documentText.slice(last.end, last.end + CONTEXT_CHARS).trim();
  const surroundings = [
    before && `Preceding text (context only, do not translate):\n${before}`,
    after && `Following text (context only, do not translate):\n${after}`,
  ].filter(Boolean);

  return [
    { role: 'system', content: rules.join('\n\n') },
    {
      role: 'user',
      content: [
        ...surroundings,
        'Translate these lines:',
        input.span.sentences.map((sentence, index) => `${index + 1}. ${sentence.source}`).join('\n'),
      ].join('\n\n'),
    },
  ];
}

/** Overlap on distinctive substrings beats nothing and costs no requests. */
function nearestMemory(body: string, memory: MemoryEntry[]): MemoryEntry[] {
  return memory
    .map((entry) => ({ entry, score: overlap(body, entry.source) }))
    .filter((scored) => scored.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_MEMORY)
    .map((scored) => scored.entry);
}

function overlap(body: string, source: string): number {
  let score = 0;
  for (let i = 0; i + 4 <= source.length; i += 4) {
    if (body.includes(source.slice(i, i + 4))) score += 1;
  }
  return score;
}

export type Aligned = { index: number; text: string };

/**
 * A model that returns 11 lines for 12 sentences has produced something that
 * cannot be anchored, so the answer is rejected rather than guessed at. The
 * caller's response is to ask again for a smaller span.
 */
export function parseNumbered(answer: string, expected: number): Aligned[] {
  const lines = answer.split('\n');
  const found = new Map<number, string>();
  let current: number | null = null;

  for (const raw of lines) {
    const match = /^\s*(\d{1,4})[.、)．:]\s*(.*)$/.exec(raw);
    if (match) {
      current = Number(match[1]);
      found.set(current, match[2].trim());
      continue;
    }
    // A wrapped line belongs to the number above it.
    if (current !== null && raw.trim()) {
      found.set(current, `${found.get(current) ?? ''} ${raw.trim()}`.trim());
    }
  }

  const aligned: Aligned[] = [];
  for (let index = 1; index <= expected; index++) {
    const text = found.get(index);
    if (!text) throw new AlignmentError(expected, found.size);
    aligned.push({ index, text });
  }
  return aligned;
}

export class AlignmentError extends Error {
  constructor(public expected: number, public got: number) {
    super(`expected ${expected} lines, got ${got}`);
  }
}
