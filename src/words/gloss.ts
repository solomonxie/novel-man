import { hasAnyKey, runChat } from '../ai/keys';
import { labelFor, normalizeLanguage } from '../translate/languages';
import { uiLanguage } from '../i18n';

/** A gloss is a line, not an essay. Enough for 64 tokens and a hard stop. */
const MOST = 160;

export class NoKey extends Error {
  constructor() {
    super('no-key');
  }
}

/**
 * Which language to put it into: the one the app is being read in.
 *
 * Not the device's region and not the book's language — the reader of a
 * Chinese novel with the app in English wants English, and a reader of a Greek
 * New Testament with the app in Chinese wants Chinese. When the book is
 * already in that language there is nothing to translate and the dictionary
 * is the right answer instead, which the caller checks before offering this.
 */
export function glossTarget(): { code: string; label: string } {
  const code = normalizeLanguage(uiLanguage());
  return { code, label: labelFor(code) };
}

/**
 * What a word or phrase means, in one line.
 *
 * The sentence it came from goes with it, and that is the part worth having.
 * `spring` on its own is four unrelated words; `spring` in "the spring of the
 * lock had gone" is one of them. Likewise 風 in a 武侠 title is not weather.
 * Without the context a gloss is a coin toss between senses, and a confidently
 * wrong one is worse than none — so the sentence is sent whenever the book has
 * one to send.
 *
 * Costs a key, which is why nothing here runs on its own: the page offers it
 * as a button and the reader decides.
 */
export async function gloss(
  word: string,
  bookLanguage?: string | null,
  context?: string
): Promise<string> {
  const wanted = word.trim();
  if (!wanted) return '';
  if (!(await hasAnyKey())) throw new NoKey();

  const target = glossTarget();
  const source = bookLanguage ? labelFor(normalizeLanguage(bookLanguage)) : null;

  const said = await runChat(
    [
      {
        role: 'system',
        content:
          `You gloss a word or phrase for a reader. Answer in ${target.label} ` +
          'with the meaning only: no restatement of the word, no quotation ' +
          'marks, no part of speech, no notes about the translation, and one ' +
          'line. If the phrase is an idiom, give what it is used to mean ' +
          'rather than what it literally says.',
      },
      {
        role: 'user',
        content: [
          source ? `Language: ${source}` : null,
          `Word or phrase: ${wanted}`,
          context ? `As it is used: ${context}` : null,
        ]
          .filter(Boolean)
          .join('\n'),
      },
    ],
    { maxTokens: 64 }
  );

  // A model told to answer in one line sometimes answers in three. The first
  // is the gloss; the rest is it explaining itself.
  return said.trim().split('\n')[0].trim().slice(0, MOST);
}
