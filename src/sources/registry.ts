import type { BookSource } from '../books/kinds';

/**
 * The sources books come from, as data. A source is a name, the page that
 * searches it, and the host it fetches from — the same shape kinds and AI
 * vendors already have, so another source is a row here plus its own module,
 * not an edit to the Add page.
 */
export type PublicSource = {
  id: Extract<
    BookSource,
    'ebible' | 'repo' | 'gutenberg' | 'standardebooks' | 'arxiv' | 'openlibrary' | 'goodreads'
  >;
  /** Where this source is browsed, when browsing it is worth a page. */
  find?: string;
  host: string;
  /**
   * True when the source publishes a list we can keep. Those are searched
   * together, on the device; the rest are searched where they live.
   */
  indexed: boolean;
  /** True when nothing can be fetched until the reader supplies their own. */
  credential?: boolean;
};

export const publicSources: PublicSource[] = [
  { id: 'ebible', find: '/source/ebible', host: 'ebible.org', indexed: true },
  // Not a publisher and not a list: a place other people's editions happen to
  // be kept. Nothing to index — the reader searches it and pastes what they
  // found, which is the only form this source has.
  { id: 'repo', find: '/source/repo', host: 'github.com', indexed: false },
  { id: 'gutenberg', host: 'gutenberg.org', indexed: true },
  // The same corpus, produced by hand — and behind a credential, because its
  // feeds are a membership benefit rather than an open endpoint.
  { id: 'standardebooks', host: 'standardebooks.org', indexed: true, credential: true },
  // A preprint server is a firehose, not a list: 2.6 million papers, hundreds
  // a day. It is searched where it lives.
  { id: 'arxiv', find: '/source/arxiv', host: 'arxiv.org', indexed: false },
  // The catalog that hands over no books at all — 40 million records, no key,
  // no quota. Its page keeps the lists rather than this row, because what is
  // kept is one category at a time and a single "get the list" would mean
  // downloading a library catalog in full.
  { id: 'openlibrary', find: '/source/openlibrary', host: 'openlibrary.org', indexed: false },
  // Not a catalog: one reader's own shelves, brought over from where they kept
  // them. Their API was retired in 2020, so the door is the export and the
  // shelf feed — both of which they still hand to whoever owns the account.
  { id: 'goodreads', find: '/source/goodreads', host: 'goodreads.com', indexed: false },
];

export function sourcesFor(sources: BookSource[]): PublicSource[] {
  return publicSources.filter((source) => sources.includes(source.id));
}

/**
 * A catalog's name where no component is asking — a queue row written by a
 * restore, which has no screen and so no `t`.
 */
export function labelOfCatalog(source: string): string {
  return publicSources.find((entry) => entry.id === source)?.host ?? source;
}
