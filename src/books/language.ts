import { detectLanguage } from '../text/language';
import { normalizeLanguage } from '../translate/languages';
import { isChineseIsbn } from '../sources/identify';

/** Han anywhere in it. One character is enough: nothing else writes them. */
const inHan = (text: string) => /[㐀-䶿一-鿿]/.test(text);

export type LanguageEvidence = {
  title: string;
  author: string | null;
  isbn: string | null;
  /** The opening of the manuscript, where the book has one. */
  sample: string;
};

/**
 * What a book is written in, from the best evidence it has, or null where it
 * has none worth acting on.
 *
 * A shelf entry has no text, so its language was read off its title — and a
 * catalog that romanises hands back "Pei gen sui bi ji", which is Latin
 * script and detects as English. The book is then marked English, and
 * language is not a label: it is what every AI pass is told to answer in, so
 * a Chinese library came back summarised in English.
 *
 * In order of how much each is worth:
 *
 *  - The manuscript. Thousands of characters beat a title of four, and a book
 *    that has one needs nothing else.
 *  - The title and the author together. A Chinese edition of an English book
 *    is named in both, and one name in Han is the tell.
 *  - The ISBN. A 978-7 is a book published in China, which is the one case
 *    where the title being Latin is evidence of romanisation rather than of
 *    English — it is how this went wrong in the first place.
 *
 * Null rather than a guess where none of them says anything: a book nobody
 * has evidence about should keep whatever it was given.
 */
export function languageFrom(book: LanguageEvidence): string | null {
  if (book.sample.trim()) return normalizeLanguage(detectLanguage(book.sample).language);
  if (inHan(`${book.title} ${book.author ?? ''}`)) return 'zh-Hans';
  if (book.isbn && isChineseIsbn(book.isbn)) return 'zh-Hans';
  return null;
}

/** Whether the stored value disagrees with the evidence, spellings aside. */
export function needsRelabel(stored: string | null, found: string | null): found is string {
  return found !== null && normalizeLanguage(stored) !== found;
}
