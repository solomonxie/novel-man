/**
 * How a typed query is turned into a query a list can answer, and how the rows
 * that come back are put in order. Kept apart from the store so it can be run
 * against fixtures outside the app, where there is no database.
 */

/** `%` and `_` are wildcards, and a title is allowed to contain both. */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** `austn` ⇒ `%a%u%s%t%n%` — the letters, in order, gaps allowed. */
export function looseLike(term: string): string {
  return `%${[...escapeLike(term)].join('%')}%`;
}

/**
 * How well a row answers what was typed. A word found whole beats the same
 * word found scattered, and a word at the start of the title beats one buried
 * in a subtitle — which is the difference between `Emma` and `The Letters of
 * Jane Austen, Volume II: Emma`.
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
    total += 4;
    if (title.startsWith(term)) total += 3;
    else if (new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(rest)) total += 2;
  }
  return total;
}
