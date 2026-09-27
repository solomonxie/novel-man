export type Script = 'latin' | 'cjk';

const CJK = /[㐀-鿿豈-﫿぀-ヿ]/g;

export function detectLanguage(text: string): { language: string; script: Script } {
  const sample = text.slice(0, 20000);
  const cjk = sample.match(CJK)?.length ?? 0;
  // Simplified, because this cannot tell the two apart and simplified is the
  // commoner of them. It is one tap to correct on the book page, which is the
  // reason a guess is allowed to be a guess here.
  return cjk / Math.max(1, sample.length) > 0.15
    ? { language: 'zh-Hans', script: 'cjk' }
    : { language: 'en', script: 'latin' };
}

/**
 * By prefix, not by the whole string. Chinese arrives here under four names —
 * `zh` from detection, `zh-Hans` and `zh-Hant` from the picker, `zh-CN` from
 * a catalog — and an exact match recognised only the first. Everything that
 * reads a script off a language got the answer wrong for the other three:
 * sentences segmented as if by spaces, words counted as words rather than
 * characters, reading time and token cost estimated on the Latin ratio, and
 * a page of Chinese set in Georgia on Latin leading.
 *
 * Korean is deliberately not here. Hangul is not in the CJK block this app
 * counts by, and adding it would quietly change every count for it.
 */
export function scriptOf(language: string): Script {
  const base = baseLanguage(language);
  return base === 'zh' || base === 'ja' ? 'cjk' : 'latin';
}

/**
 * The language without its script or region. Anything that keys off a
 * language — a script, a set of chapter patterns — means Chinese when it says
 * `zh`, and `zh-Hans` is Chinese. Comparing the whole string is how a shelf
 * that started spelling it `zh-Hans` stopped recognising 第一章 as a chapter.
 */
export function baseLanguage(code: string): string {
  return code.toLowerCase().split(/[-_]/)[0];
}
