/**
 * Whether a book named somewhere else is one the shelf already has. Every
 * import asks this — a CSV, a Goodreads shelf, a notes file, a manuscript —
 * and they all ask it here, so 《三体》 and 三体 are one book whichever door
 * it came through.
 */

/**
 * A title with what editions and shops wrap around it taken off: 《》, a
 * trailing (精) or [美], full-width letters, punctuation and case.
 */
export function titleKey(title: string): string {
  let plain = title.normalize('NFKC').toLowerCase();
  const quoted = /《([^》]+)》/.exec(plain);
  if (quoted) plain = quoted[1];
  plain = plain.replace(/[(\[【][^)\]】]*[)\]】]\s*$/u, '');
  return plain.replace(/[^\p{L}\p{N}]+/gu, '');
}

/**
 * The same title with its subtitle dropped: 中的精神: 吴清源自传 is 中的精神.
 * Not where the subtitle names a volume — 三体: 黑暗森林. II is not 三体.
 */
export function mainTitleKey(title: string): string {
  const [main, ...rest] = title.normalize('NFKC').toLowerCase().split(/[:：]|\s[-—]\s/);
  if (/\d|\b[ivx]+\b|[上中下卷册部]/u.test(rest.join(' '))) return titleKey(title);
  return titleKey(main);
}

const inHan = (text: string) => /[㐀-䶿一-鿿]/.test(text);

/**
 * An author with the nationality and the order taken out: [美] 古斯塔夫·勒庞
 * is 古斯塔夫·勒庞, and Austen, Jane is Jane Austen.
 */
export function authorKey(author: string): string {
  return author
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[(\[【〔][^)\]】〕]*[)\]】〕]/gu, ' ')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .sort()
    .join(' ');
}

/**
 * Not proof of the same author — proof of a different one. A name missing on
 * either side, or written in another script (勒庞 and Le Bon), says nothing.
 */
export function sameAuthor(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a?.trim() || !b?.trim() || inHan(a) !== inHan(b)) return true;
  const one = authorKey(a);
  const two = authorKey(b);
  if (!one || !two) return true;
  return one === two || one.includes(two) || two.includes(one);
}

export type ShelfBook = { id: string; title: string; author: string | null };

/**
 * Which book on the shelf this is, or null for a new one. The id wins; then
 * the whole title; then a title missing only its subtitle on one side — each
 * time by an author that is not plainly someone else. Where the shelf holds
 * the same book twice, the first one listed is the answer rather than neither.
 */
export function shelfMatch<T extends ShelfBook>(
  book: { title: string; libraryId?: string; author?: string | null },
  shelf: T[]
): T | null {
  if (book.libraryId) {
    const byId = shelf.find((entry) => entry.id === book.libraryId);
    if (byId) return byId;
  }
  const key = titleKey(book.title);
  if (!key) return null;
  const by = shelf.filter((entry) => sameAuthor(book.author, entry.author));
  const whole = by.find((entry) => titleKey(entry.title) === key);
  if (whole) return whole;
  const main = mainTitleKey(book.title);
  return (
    by.find((entry) => {
      const theirs = titleKey(entry.title);
      const theirMain = mainTitleKey(entry.title);
      return (theirMain === key && theirMain !== theirs) || (main === theirs && main !== key);
    }) ?? null
  );
}

/** The book's own chapter of that name, if it has one. */
export function chapterNamed<T extends { title: string }>(name: string, chapters: T[]): T | null {
  const key = titleKey(name);
  if (!key) return null;
  return chapters.find((chapter) => titleKey(chapter.title) === key) ?? null;
}
