/**
 * How a typed query is turned into a query a list can answer, and how the rows
 * that come back are put in order. Kept apart from the store so it can be run
 * against fixtures outside the app, where there is no database.
 */

/**
 * Scripts written without spaces between words: Han, kana, Hangul.
 *
 * Every rule below about where a word starts assumes a space says so, and in
 * these there are none — `和合本` sits inside `新标点和合本` with nothing in
 * front of it, and a title of two characters is an ordinary title rather than
 * an abbreviation of anything. So they take the plain substring rules, which
 * is what these rules replaced and what is still right here.
 */
const UNSPACED =
  /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF]/;

export function hasWordBreaks(term: string): boolean {
  return !UNSPACED.test(term);
}

/** `%` and `_` are wildcards, and a title is allowed to contain both. */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * The term where a word starts: at the beginning of the row, or after a space.
 *
 * This is what anybody typing a short word means. `%niv%` finds `University`,
 * `Universe` and `Univocal` — three thousand of them in Gutenberg's list —
 * and the reader who typed `NIV` was asking about a bible. Two patterns
 * because SQLite's `LIKE` has no notion of a word; `needle` is title, author
 * and whatever else the source publishes, joined by spaces, so a space is
 * where a word begins.
 */
export function wordLike(term: string): string[] {
  const escaped = escapeLike(term);
  // Written without spaces, the term is already the whole word: anywhere it
  // appears is a real occurrence, not the middle of a longer word.
  if (!hasWordBreaks(term)) return [`%${escaped}%`];
  return [`${escaped}%`, `% ${escaped}%`];
}

/** `austn` ⇒ `%a%u%s%t%n%` — the letters, in order, gaps allowed. */
export function looseLike(term: string): string {
  return `%${[...escapeLike(term)].join('%')}%`;
}

/**
 * Short enough that letters-in-order and letters-inside-a-word are noise
 * rather than tolerance. `prejudce` is worth rescuing; `niv` is not — every
 * pattern it could stand for is already a word somebody meant.
 */
export const ACRONYM_LENGTH = 4;

export function isAcronym(terms: string[]): boolean {
  // Three Han characters are a title, not initials. Counting them as an
  // abbreviation cut off every fallback for a language whose titles are
  // mostly two to four characters long.
  return terms.every((term) => hasWordBreaks(term) && term.length <= ACRONYM_LENGTH);
}

/**
 * How well a row answers what was typed. A word found whole beats the same
 * letters buried in a longer word, and a word at the start of the title beats
 * one in a subtitle — the difference between `Emma` and `The Letters of Jane
 * Austen, Volume II: Emma`.
 *
 * The gap between a word match and an inside-a-word match is wide on purpose.
 * It used to be 6 against 4, which a shorter title could close — so `Universe`
 * outranked the bible somebody typed an abbreviation for.
 */
export function score(row: { title: string; author: string }, terms: string[]): number {
  if (!terms.length) return 0;
  const title = row.title.toLowerCase();
  const rest = `${title} ${row.author.toLowerCase()}`;
  let total = 0;
  for (const term of terms) {
    const at = rest.indexOf(term);
    if (at < 0) {
      total += 1;
      continue;
    }
    if (title === term) {
      total += 40;
      continue;
    }
    // `\b` is defined against `\w`, which no Han character is — so the word
    // tests below would answer nonsense for them. Anywhere it appears counts.
    if (!hasWordBreaks(term)) {
      total += title.startsWith(term) ? 30 : 20;
      continue;
    }
    const quoted = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (title.startsWith(`${term} `)) total += 30;
    else if (new RegExp(`\\b${quoted}\\b`).test(rest)) total += 20;
    else if (new RegExp(`\\b${quoted}`).test(rest)) total += 12;
    else total += 2;
  }
  return total;
}
