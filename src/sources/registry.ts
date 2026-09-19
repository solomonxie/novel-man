import type { BookSource } from '../books/kinds';

/**
 * The sources books come from, as data. A source is a name, the page that
 * searches it, and the host it fetches from — the same shape kinds and AI
 * vendors already have, so another source is a row here plus its own module,
 * not an edit to the Add page.
 */
export type PublicSource = {
  id: Extract<BookSource, 'ebible' | 'gutenberg' | 'standardebooks' | 'arxiv'>;
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
  { id: 'gutenberg', host: 'gutenberg.org', indexed: true },
  // The same corpus, produced by hand — and behind a credential, because its
  // feeds are a membership benefit rather than an open endpoint.
  { id: 'standardebooks', host: 'standardebooks.org', indexed: true, credential: true },
  // A preprint server is a firehose, not a list: 2.6 million papers, hundreds
  // a day. It is searched where it lives.
  { id: 'arxiv', find: '/source/arxiv', host: 'arxiv.org', indexed: false },
];

export function sourcesFor(sources: BookSource[]): PublicSource[] {
  return publicSources.filter((source) => sources.includes(source.id));
}
