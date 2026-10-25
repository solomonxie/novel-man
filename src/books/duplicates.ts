import { mainTitleKey, sameAuthor, titleKey } from '../sources/sameBook';
import { isSkeleton, type Skeletal } from './record';

/**
 * Books the shelf holds twice. Every import already asks `shelfMatch` whether
 * a book is here; this asks the same of the shelf against itself, so a pair
 * shown here is one an import would also have called one book.
 *
 * Near-misses are a step looser — a typo, a dropped article, a letter apart —
 * and are said to be, because only the reader can tell 《三体》 from a slip.
 */
export type Candidate = Skeletal & {
  id: string;
  title: string;
  author: string | null;
  edition: string | null;
  created_at: number;
};

export type Likeness = 'same' | 'near';

export type DuplicateGroup<T extends Candidate> = {
  key: string;
  /** Keeper first. */
  books: T[];
  near: boolean;
};

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

const inHan = (text: string) => /[㐀-䶿一-鿿]/.test(text);

function looseKey(title: string): string {
  return titleKey(title.replace(/^\s*(the|a|an)\s+/i, ''));
}

/** Volume and number marks: a near-miss never crosses from one volume to the next. */
function volumes(title: string): string {
  return (title.normalize('NFKC').toLowerCase().match(/\d+|\b[ivx]+\b|[上中下卷册部一二三四五六七八九十]/gu) ?? []).join(',');
}

function allowance(a: string[], b: string[]): number {
  const n = Math.min(a.length, b.length);
  if (inHan(a.join('')) || inHan(b.join(''))) return n >= 4 ? 1 : 0;
  return n < 5 ? 0 : n < 14 ? 1 : 2;
}

/** Edit distance, or `limit + 1` as soon as it is certain to pass `limit`. */
export function editDistance(a: string[], b: string[], limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, row[j]);
    }
    if (best > limit) return limit + 1;
    previous = row;
  }
  return previous[b.length];
}

type Keys = {
  key: string;
  main: string;
  loose: string[];
  volumes: string;
  author: string | null;
  edition: string;
};

function keysOf(book: Candidate): Keys {
  return {
    key: titleKey(book.title),
    main: mainTitleKey(book.title),
    loose: Array.from(looseKey(book.title)),
    volumes: volumes(book.title),
    author: book.author,
    edition: book.edition?.trim() ?? '',
  };
}

function compare(a: Keys, b: Keys): Likeness | null {
  if (!a.key || !b.key) return null;
  if (a.edition && b.edition && a.edition !== b.edition) return null;
  const same =
    a.key === b.key || (a.main === b.key && a.main !== a.key) || (b.main === a.key && b.main !== b.key);
  if (!same && (a.volumes !== b.volumes || Math.abs(a.loose.length - b.loose.length) > 2)) return null;
  if (!sameAuthor(a.author, b.author)) return null;
  if (same) return 'same';
  const limit = allowance(a.loose, b.loose);
  if (a.loose.join('') === b.loose.join('')) return 'near';
  return limit > 0 && editDistance(a.loose, b.loose, limit) <= limit ? 'near' : null;
}

export function likeness(a: Candidate, b: Candidate): Likeness | null {
  return compare(keysOf(a), keysOf(b));
}

/** Where a pair could meet: a typo leaves at least one end of a title alone. */
function buckets(keys: Keys): string[] {
  const end = inHan(keys.loose.join('')) ? 2 : 3;
  return [
    `t:${keys.key}`,
    `m:${keys.main}`,
    `p:${keys.loose.slice(0, end).join('')}`,
    `s:${keys.loose.slice(-end).join('')}`,
  ];
}

const hasText = (book: Skeletal) => !isSkeleton(book);

/** The copy that stays: one with words if any has them, then the oldest. */
export function keeperOf<T extends Candidate>(books: T[]): T {
  return books.slice().sort(
    (a, b) => Number(hasText(b)) - Number(hasText(a)) || a.created_at - b.created_at
  )[0];
}

/** A copy with no words cannot take over from one that has them. */
export function canKeep(book: Candidate, group: Candidate[]): boolean {
  return hasText(book) || !group.some(hasText);
}

/** Two manuscripts stay two books, as editions; anything else folds into one. */
export function mergeMode(keeper: Skeletal, other: Skeletal): 'edition' | 'merge' {
  return hasText(keeper) && hasText(other) ? 'edition' : 'merge';
}

/** Whole-title matches with no words on either side: nothing to choose between. */
export function isSafe(group: DuplicateGroup<Candidate>): boolean {
  return !group.near && !group.books.some(hasText);
}

export function findDuplicates<T extends Candidate>(
  books: T[],
  dismissed: Set<string> = new Set()
): DuplicateGroup<T>[] {
  const keys = books.map(keysOf);
  const meeting = new Map<string, number[]>();
  keys.forEach((own, index) => {
    for (const key of new Set(buckets(own))) {
      if (key.length <= 2) continue;
      const list = meeting.get(key);
      if (list) list.push(index);
      else meeting.set(key, [index]);
    }
  });

  const parent = books.map((_, index) => index);
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i])));
  const nearPairs: number[] = [];

  for (const members of meeting.values()) {
    for (let x = 0; x < members.length; x++) {
      for (let y = x + 1; y < members.length; y++) {
        const i = members[x];
        const j = members[y];
        const found = compare(keys[i], keys[j]);
        if (!found || dismissed.has(pairKey(books[i].id, books[j].id))) continue;
        parent[root(j)] = root(i);
        if (found === 'near') nearPairs.push(i);
      }
    }
  }

  const grouped = new Map<number, T[]>();
  books.forEach((book, index) => {
    const top = root(index);
    const list = grouped.get(top);
    if (list) list.push(book);
    else grouped.set(top, [book]);
  });
  const nearRoots = new Set(nearPairs.map(root));

  const groups: DuplicateGroup<T>[] = [];
  for (const [top, members] of grouped) {
    if (members.length < 2) continue;
    const keeper = keeperOf(members);
    const rest = members.filter((book) => book !== keeper).sort((a, b) => a.created_at - b.created_at);
    groups.push({
      key: members.map((book) => book.id).sort().join('|'),
      books: [keeper, ...rest],
      near: nearRoots.has(top),
    });
  }
  return groups.sort((a, b) => a.books[0].title.localeCompare(b.books[0].title));
}

/** The other copies of this book, if the shelf holds it more than once. */
export function groupOf<T extends Candidate>(bookId: string, groups: DuplicateGroup<T>[]): DuplicateGroup<T> | null {
  return groups.find((group) => group.books.some((book) => book.id === bookId)) ?? null;
}

/** Every book on the shelf this one is the same as, one against all. */
export function copiesOf<T extends Candidate>(book: Candidate, shelf: T[], dismissed: Set<string> = new Set()): T[] {
  const own = keysOf(book);
  return shelf.filter(
    (other) => other.id !== book.id && !dismissed.has(pairKey(book.id, other.id)) && compare(own, keysOf(other))
  );
}
