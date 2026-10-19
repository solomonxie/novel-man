/**
 * Two copies of one book, lined up chapter by chapter the way `git diff` lines
 * up lines: identical chapters anchor the alignment, so a chapter inserted in
 * the middle is one addition and everything after it still matches.
 */

export type ChapterText = { title: string; text: string };

export type Step =
  | { kind: 'same'; base: number; incoming: number }
  | { kind: 'changed'; base: number; incoming: number }
  | { kind: 'added'; incoming: number }
  /** Only in the copy already here. Never removed by a merge. */
  | { kind: 'kept'; base: number };

/** Whitespace is layout, not content: re-wrapped paragraphs are the same chapter. */
function canonical(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** FNV-1a, twice with different seeds: cheap, and 64 bits is plenty within one chapter. */
export function versionOf(text: string): string {
  const value = canonical(text);
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    a = Math.imul(a ^ code, 0x01000193);
    b = Math.imul(b ^ code, 0x5bd1e995) ^ (b >>> 15);
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}

/**
 * A chapter without its own heading. Insert a chapter and a file renumbers
 * every heading after it; matching on the heading would make all of those
 * "changed" when not a word of them is.
 */
function body(chapter: ChapterText): string {
  const cut = chapter.text.indexOf('\n');
  const first = (cut < 0 ? chapter.text : chapter.text.slice(0, cut)).trim();
  if (first && first === chapter.title.trim()) return cut < 0 ? '' : chapter.text.slice(cut + 1);
  return chapter.text;
}

/** Past this many cells the full table costs more memory than it is worth. */
const MAX_CELLS = 4_000_000;
/** Below this a changed chapter is a different chapter that happens to sit there. */
const SIMILAR = 0.5;

export function alignChapters(base: ChapterText[], incoming: ChapterText[]): Step[] {
  const from = base.map((chapter) => versionOf(body(chapter)));
  const to = incoming.map((chapter) => versionOf(body(chapter)));
  const anchors = matchKeys(from, to);

  const steps: Step[] = [];
  let i = 0;
  let j = 0;
  const shingles = new Map<string, Set<string>>();
  const shape = (side: 'b' | 'i', index: number) => {
    const key = `${side}${index}`;
    let found = shingles.get(key);
    if (!found) {
      found = shinglesOf((side === 'b' ? base : incoming)[index].text);
      shingles.set(key, found);
    }
    return found;
  };
  const score = (bi: number, ij: number) => {
    const overlap = jaccard(shape('b', bi), shape('i', ij));
    const titled = sameTitle(base[bi].title, incoming[ij].title) ? 0.2 : 0;
    return overlap + titled;
  };

  for (const [ai, aj] of [...anchors, [base.length, incoming.length] as const]) {
    pairGap(i, ai, j, aj, score, steps);
    if (ai < base.length && aj < incoming.length) steps.push({ kind: 'same', base: ai, incoming: aj });
    i = ai + 1;
    j = aj + 1;
  }
  return steps;
}

/** Identical chapters, in order: common ends first, then an LCS of what is left. */
function matchKeys(from: string[], to: string[]): [number, number][] {
  const pairs: [number, number][] = [];
  let head = 0;
  while (head < from.length && head < to.length && from[head] === to[head]) {
    pairs.push([head, head]);
    head++;
  }
  let tail = 0;
  while (
    tail < from.length - head &&
    tail < to.length - head &&
    from[from.length - 1 - tail] === to[to.length - 1 - tail]
  ) tail++;

  const middle = lcsPairs(from.slice(head, from.length - tail), to.slice(head, to.length - tail));
  for (const [a, b] of middle) pairs.push([a + head, b + head]);
  for (let k = tail; k > 0; k--) pairs.push([from.length - k, to.length - k]);
  return pairs;
}

function lcsPairs(from: string[], to: string[]): [number, number][] {
  const n = from.length;
  const m = to.length;
  if (!n || !m) return [];
  if ((n + 1) * (m + 1) > MAX_CELLS) return uniqueAnchors(from, to);
  const width = m + 1;
  const table = new Int32Array((n + 1) * width);
  for (let a = n - 1; a >= 0; a--) {
    for (let b = m - 1; b >= 0; b--) {
      table[a * width + b] =
        from[a] === to[b]
          ? table[(a + 1) * width + b + 1] + 1
          : Math.max(table[(a + 1) * width + b], table[a * width + b + 1]);
    }
  }
  const pairs: [number, number][] = [];
  let a = 0;
  let b = 0;
  while (a < n && b < m) {
    if (from[a] === to[b]) {
      pairs.push([a++, b++]);
    } else if (table[(a + 1) * width + b] >= table[a * width + b + 1]) a++;
    else b++;
  }
  return pairs;
}

/** Patience diff's anchors: keys that occur once on each side, longest increasing run. */
function uniqueAnchors(from: string[], to: string[]): [number, number][] {
  const count = (keys: string[]) => {
    const seen = new Map<string, number>();
    keys.forEach((key, index) => seen.set(key, seen.has(key) ? -1 : index));
    return seen;
  };
  const left = count(from);
  const right = count(to);
  const candidates: [number, number][] = [];
  for (const [key, a] of left) {
    const b = right.get(key);
    if (a >= 0 && b !== undefined && b >= 0) candidates.push([a, b]);
  }
  candidates.sort((x, y) => x[0] - y[0]);
  // Longest increasing subsequence on the incoming side.
  const tails: number[] = [];
  const previous = new Int32Array(candidates.length).fill(-1);
  candidates.forEach(([, b], index) => {
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (candidates[tails[mid]][1] < b) low = mid + 1;
      else high = mid;
    }
    if (low > 0) previous[index] = tails[low - 1];
    tails[low] = index;
  });
  const out: [number, number][] = [];
  for (let at = tails.length ? tails[tails.length - 1] : -1; at >= 0; at = previous[at]) {
    out.push(candidates[at]);
  }
  return out.reverse();
}

/** Between two anchors: pair what resembles each other, the rest is added or kept. */
function pairGap(
  i0: number, i1: number, j0: number, j1: number,
  score: (b: number, i: number) => number,
  steps: Step[]
) {
  const n = i1 - i0;
  const m = j1 - j0;
  if (!n && !m) return;
  if (!n || !m || (n + 1) * (m + 1) > 250_000) {
    for (let b = i0; b < i1; b++) steps.push({ kind: 'kept', base: b });
    for (let k = j0; k < j1; k++) steps.push({ kind: 'added', incoming: k });
    return;
  }
  const width = m + 1;
  const best = new Float64Array((n + 1) * width);
  const scores = new Float64Array(n * m);
  for (let a = n - 1; a >= 0; a--) {
    for (let b = m - 1; b >= 0; b--) {
      const s = score(i0 + a, j0 + b);
      scores[a * m + b] = s;
      const pair = s >= SIMILAR ? best[(a + 1) * width + b + 1] + s : -1;
      best[a * width + b] = Math.max(pair, best[(a + 1) * width + b], best[a * width + b + 1]);
    }
  }
  let a = 0;
  let b = 0;
  while (a < n && b < m) {
    const s = scores[a * m + b];
    const here = best[a * width + b];
    if (s >= SIMILAR && here === best[(a + 1) * width + b + 1] + s) {
      steps.push({ kind: 'changed', base: i0 + a++, incoming: j0 + b++ });
    } else if (here === best[(a + 1) * width + b]) {
      steps.push({ kind: 'kept', base: i0 + a++ });
    } else {
      steps.push({ kind: 'added', incoming: j0 + b++ });
    }
  }
  while (a < n) steps.push({ kind: 'kept', base: i0 + a++ });
  while (b < m) steps.push({ kind: 'added', incoming: j0 + b++ });
}

/** A CJK character or a word, then pairs of them: order-aware without being exact. */
function shinglesOf(text: string): Set<string> {
  const tokens = text.toLowerCase().match(/[㐀-鿿぀-ヿ]|[\p{L}\p{N}]+/gu) ?? [];
  const out = new Set<string>();
  const limit = Math.min(tokens.length, 40_000);
  for (let k = 1; k < limit; k++) out.add(`${tokens[k - 1]} ${tokens[k]}`);
  if (limit === 1) out.add(tokens[0]!);
  return out;
}

function jaccard(x: Set<string>, y: Set<string>): number {
  if (!x.size && !y.size) return 1;
  let shared = 0;
  const [small, large] = x.size < y.size ? [x, y] : [y, x];
  for (const item of small) if (large.has(item)) shared++;
  return shared / (x.size + y.size - shared);
}

function sameTitle(a: string, b: string): boolean {
  const clean = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  return clean(a) !== '' && clean(a) === clean(b);
}

export type DiffPiece = { text: string; change: 'same' | 'added' | 'removed' };

/** Paragraph-level, like a diff of lines. Long runs of sameness fold to their ends. */
export function diffParagraphs(from: string, to: string): DiffPiece[] {
  const split = (text: string) => text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const a = split(from);
  const b = split(to);
  const pieces: DiffPiece[] = [];
  const table = (a.length + 1) * (b.length + 1) <= MAX_CELLS ? lcsTable(a, b) : null;
  let i = 0;
  let j = 0;
  const width = b.length + 1;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      pieces.push({ text: a[i++], change: 'same' });
      j++;
    } else if (!table || table[(i + 1) * width + j] >= table[i * width + j + 1]) {
      pieces.push({ text: a[i++], change: 'removed' });
    } else {
      pieces.push({ text: b[j++], change: 'added' });
    }
  }
  while (i < a.length) pieces.push({ text: a[i++], change: 'removed' });
  while (j < b.length) pieces.push({ text: b[j++], change: 'added' });
  return pieces;
}

function lcsTable(a: string[], b: string[]): Int32Array {
  const width = b.length + 1;
  const table = new Int32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * width + j] =
        a[i] === b[j]
          ? table[(i + 1) * width + j + 1] + 1
          : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }
  return table;
}

/** What a merge would do, counted, for the line at the top of the review. */
export function tally(steps: Step[]) {
  const counts = { same: 0, changed: 0, added: 0, kept: 0 };
  for (const step of steps) counts[step.kind]++;
  return counts;
}
