/**
 * Where to read more about a word in scripture.
 *
 * None of this is bundled, and that is deliberate. A cross-reference set worth
 * having — the Treasury of Scripture Knowledge is the usual one — is several
 * hundred thousand references and megabytes of them, which is most of this
 * app's whole size for a feature used on a handful of words. The concordance
 * the word page already shows is built by searching the edition on the device,
 * costs nothing and is exact; for everything a concordance cannot do —
 * lexicons, the Greek and Hebrew behind the English, interlinears,
 * commentaries, cross-references — these are the free ones, and they are a
 * link rather than a download.
 */
export type StudySite = { id: string; label: string; url: (word: string) => string };

const encoded = (word: string) => encodeURIComponent(word.trim());

export const studySites: StudySite[] = [
  {
    // Lexicons and the original-language word behind the translation, which is
    // the first thing anybody wants from a word in a bible.
    id: 'blb',
    label: 'Blue Letter Bible',
    url: (word) => `https://www.blueletterbible.org/search/search.cfm?Criteria=${encoded(word)}&t=KJV`,
  },
  {
    // Interlinear and parallel translations, and the one with cross-references.
    id: 'biblehub',
    label: 'Bible Hub',
    url: (word) => `https://biblehub.com/searchman.php?q=${encoded(word)}`,
  },
  {
    // Open, no advertising, and the only one of the three with a licence that
    // says what you may do with what it gives you.
    id: 'stepbible',
    label: 'STEP Bible',
    url: (word) => `https://www.stepbible.org/?q=text=${encoded(word)}`,
  },
];
