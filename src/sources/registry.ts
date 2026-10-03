import { DEFAULT_KIND, type BookSource } from '../books/kinds';
import { isChinaStore } from '../store/storefront';

/**
 * The sources books come from, as data. A source is a name, the page that
 * searches it, and the host it fetches from — the same shape kinds and AI
 * vendors already have, so another source is a row here plus its own module,
 * not an edit to the Add page.
 */
export type PublicSource = {
  id: Extract<
    BookSource,
    | 'ebible' | 'repo' | 'gutenberg' | 'standardebooks' | 'arxiv' | 'openlibrary'
    | 'goodreads'
  >;
  /** Where this source is browsed, when browsing it is worth a page. */
  find?: string;
  host: string;
  /**
   * True when the source publishes a list we can keep. Those are searched
   * together, on the device; the rest are searched where they live.
   */
  indexed: boolean;
  /**
   * True when the source answers a search of its own, over the network. The
   * one search box offers these as a row apiece rather than asking them —
   * nothing is fetched from a stranger's API until somebody taps it.
   *
   * Not the same as `!indexed`: Goodreads is neither. It is one reader's own
   * shelves, and the way in is a file they export, not a query.
   */
  remote?: boolean;
  /** True when nothing can be fetched until the reader supplies their own. */
  credential?: boolean;
};

/** Every source, unfiltered — for a lookup by id where storefront filtering does not apply, such as a page's own metadata. */
export const allSources: PublicSource[] = [
  { id: 'ebible', find: '/source/ebible', host: 'ebible.org', indexed: true },
  // Not a publisher and not a list: a place other people's editions happen to
  // be kept. It has no door of its own — a reader pastes the link they found
  // under "From a link" and it is recognised — but it is still a host this app
  // fetches from, and the page that discloses those reads this list.
  { id: 'repo', host: 'github.com', indexed: false },
  { id: 'gutenberg', host: 'gutenberg.org', indexed: true },
  // The same corpus, produced by hand — and behind a credential, because its
  // feeds are a membership benefit rather than an open endpoint.
  { id: 'standardebooks', host: 'standardebooks.org', indexed: true, credential: true },
  // A preprint server is a firehose, not a list: 2.6 million papers, hundreds
  // a day. It is searched where it lives.
  { id: 'arxiv', find: '/source/arxiv', host: 'arxiv.org', indexed: false, remote: true },
  // The catalog that hands over no books at all — 40 million records, no key,
  // no quota. Its page keeps the lists rather than this row, because what is
  // kept is one category at a time and a single "get the list" would mean
  // downloading a library catalog in full.
  { id: 'openlibrary', find: '/source/openlibrary', host: 'openlibrary.org', indexed: false, remote: true },
  // Not a catalog: one reader's own shelves, brought over from where they kept
  // them. Their API was retired in 2020, so the door is the export and the
  // shelf feed — both of which they still hand to whoever owns the account.
  { id: 'goodreads', find: '/source/goodreads', host: 'goodreads.com', indexed: false },
];

/**
 * What a book from this source is, when nobody was asked.
 *
 * Kind decides which sections a book's page has, and it used to be the first
 * question the Add menu asked — before the title, before the source, before
 * anything the reader actually came to do. But a search result already knows
 * where it came from, and a catalog of one thing answers for its own kind: a
 * bible is scripture and a preprint is a paper, whoever is asking. The
 * general catalogs answer `novel`, which is most of what they carry and what
 * this app is, and it is one tap to change on the book's own page.
 */
/**
 * Scripture is not offered on the China store: no bible catalog, and no ESV.
 * A function, not a list — the storefront resolves after this module has
 * already loaded, so a list computed once at import time would always answer
 * for whichever storefront was cached first.
 */
export function publicSources(): PublicSource[] {
  return allSources.filter(
    (source) => !(isChinaStore() && (source.id === 'ebible' || source.id === 'repo'))
  );
}

export function kindFromSource(source: string): string {
  if (source === 'ebible' || source === 'repo' || source === 'esv') return 'scripture';
  if (source === 'arxiv') return 'paper';
  return DEFAULT_KIND;
}

export function sourcesFor(sources: BookSource[]): PublicSource[] {
  return publicSources().filter((source) => sources.includes(source.id));
}

/**
 * A catalog's name where no component is asking — a queue row written by a
 * restore, which has no screen and so no `t`.
 */
export function labelOfCatalog(source: string): string {
  return allSources.find((entry) => entry.id === source)?.host ?? source;
}
