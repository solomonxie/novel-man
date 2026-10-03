import { isChinaStore } from '../store/storefront';

/**
 * The one edition whose words are fetched a chapter at a time rather than
 * kept. Its name and its key live here, with the rest of what this app knows
 * about editions nobody may redistribute — the module that goes and gets the
 * passages imports these rather than the other way round, so this file stays
 * a file of facts with nothing behind it.
 */
export const ESV_SOURCE = 'esv';
export const ESV_TITLE = 'English Standard Version';

/**
 * An edition that is its own catalog: one book, so there is no list to fetch
 * and nothing in `catalog.ts` for a search to find.
 *
 * Without this the ESV is reachable only by already knowing it is behind a
 * menu — which is the exact failure that searching everything at once is
 * meant to end. Somebody who types "esv" is asking for it by name.
 *
 * Matched in memory, because it is a handful of rows and stays one: a source
 * with enough books to be worth a table publishes an index, and an index is
 * what the catalog is for.
 */
export type SpecialEdition = {
  id: string;
  title: string;
  author: string;
  /** Everything else it answers to, so `esv` and `english standard` both land. */
  also: string;
  /** Its own page — the licence to read, and the key that opens it. */
  page: string;
};

export const specialEditions: SpecialEdition[] = [
  {
    id: 'esv',
    title: ESV_TITLE,
    author: 'Crossway',
    also: 'esv bible scripture holy',
    page: '/source/esv',
  },
];

export function searchSpecial(query: string): SpecialEdition[] {
  if (isChinaStore()) return [];
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return specialEditions.filter((edition) => {
    const haystack = `${edition.title} ${edition.author} ${edition.also}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

/**
 * A bible somebody will type the name of and nobody here can hand over.
 *
 * eBible lists only what its publisher marked redistributable, so the
 * translations most people in English actually read — the NIV above all — are
 * not in any list on this device and never will be. Searching for one used to
 * return three thousand Universities and no explanation, which reads as a
 * broken search rather than a licence.
 *
 * So they are data: enough to recognise the name and say who holds it. This
 * is not a catalog of them and must not grow into one — it is the answer to
 * "why can I not find this", for the handful of names that raise it.
 */
export type LicensedEdition = {
  id: string;
  title: string;
  /** Who holds it, because "copyrighted" without a name explains nothing. */
  holder: string;
  /** The abbreviations people type, including the family's other editions. */
  also: string;
};

export const licensedEditions: LicensedEdition[] = [
  { id: 'niv', title: 'New International Version', holder: 'Biblica', also: 'niv tniv nirv' },
  { id: 'nkjv', title: 'New King James Version', holder: 'Thomas Nelson', also: 'nkjv' },
  { id: 'nasb', title: 'New American Standard Bible', holder: 'the Lockman Foundation', also: 'nasb nasb95' },
  { id: 'nlt', title: 'New Living Translation', holder: 'Tyndale House', also: 'nlt' },
  { id: 'csb', title: 'Christian Standard Bible', holder: 'Holman', also: 'csb hcsb' },
  { id: 'amp', title: 'Amplified Bible', holder: 'the Lockman Foundation', also: 'amp ampc' },
  { id: 'nrsv', title: 'New Revised Standard Version', holder: 'the National Council of Churches', also: 'nrsv nrsvue rsv' },
  { id: 'msg', title: 'The Message', holder: 'NavPress', also: 'msg message' },
  { id: 'gnt', title: 'Good News Translation', holder: 'the American Bible Society', also: 'gnt tev cev' },
];

/**
 * Every abbreviation the editions above answer to. `scripture/canon` composes
 * its own test for "is this title a bible" from these plus the editions that
 * *are* freely published — one list of names, in the file whose subject is
 * names, rather than the same fifteen acronyms written out twice.
 */
export const licensedAbbreviations: string[] = licensedEditions.flatMap((edition) =>
  edition.also.split(' ')
);

/** The one the reader named, if they named one. */
export function searchLicensed(query: string): LicensedEdition | null {
  if (isChinaStore()) return null;
  const asked = query.trim().toLowerCase();
  if (!asked) return null;
  const terms = asked.split(/\s+/).filter(Boolean);
  return (
    licensedEditions.find((edition) => {
      if (edition.also.split(' ').includes(asked)) return true;
      const title = edition.title.toLowerCase();
      return terms.length > 1 && terms.every((term) => title.includes(term));
    }) ?? null
  );
}
