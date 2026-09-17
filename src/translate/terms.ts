import type { Entity } from '../db/repo';
import type { Term } from '../db/translation';
import { namesOf } from '../cast/mentions';
import { scriptOf } from '../text/language';

/**
 * A name translated three different ways across a book is the single most
 * visible failure of machine translation, so the glossary is built before the
 * first run rather than repaired after it.
 */
export type Candidate = { source: string; count: number; fromCast?: string };

const MIN_OCCURRENCES = 3;
const MAX_CANDIDATES = 200;

/** Latin proper nouns are capitalised mid-sentence; CJK names are not — so
 *  the cast is the only reliable source there, and repetition the fallback. */
export function candidateTerms(text: string, language: string, existing: Term[], cast: Entity[]): Candidate[] {
  const known = new Set(existing.map((term) => term.source));
  const candidates = new Map<string, Candidate>();

  for (const entity of cast) {
    for (const name of namesOf(entity)) {
      if (known.has(name)) continue;
      candidates.set(name, { source: name, count: countOf(text, name), fromCast: entity.kind });
    }
  }

  if (scriptOf(language) === 'latin') {
    for (const [source, seen] of capitalised(text)) {
      // A word is only a proper noun if it is capitalised somewhere other than
      // the start of a sentence — otherwise every sentence-opening verb counts.
      if (!seen.midSentence || seen.total < MIN_OCCURRENCES) continue;
      if (known.has(source) || candidates.has(source)) continue;
      candidates.set(source, { source, count: seen.total });
    }
  }

  return [...candidates.values()]
    .filter((candidate) => candidate.count >= (candidate.fromCast ? 1 : MIN_OCCURRENCES))
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_CANDIDATES);
}

type Seen = { total: number; midSentence: number };

function capitalised(text: string): Map<string, Seen> {
  const seen = new Map<string, Seen>();
  const pattern = /\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})?)\b/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    const before = text.slice(Math.max(0, match.index - 3), match.index);
    const opensSentence = match.index === 0 || /[.!?。！？\n]["'”’)\]]?\s*$/.test(before);
    const entry = seen.get(match[1]) ?? { total: 0, midSentence: 0 };
    entry.total += 1;
    if (!opensSentence) entry.midSentence += 1;
    seen.set(match[1], entry);
  }
  return seen;
}

function countOf(haystack: string, needle: string): number {
  let count = 0;
  let from = 0;
  while (true) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) return count;
    count += 1;
    from = at + needle.length;
  }
}

/** Only the terms that actually occur in this chapter are worth the tokens. */
export function termsIn(text: string, terms: Term[]): Term[] {
  return terms.filter((term) => term.translation.trim() && text.includes(term.source));
}
