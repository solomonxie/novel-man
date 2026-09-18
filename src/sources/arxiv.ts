import { decodeEntities, eachElement, firstTagText } from '../import/xml';

/**
 * arXiv answers its own API in Atom, the same format Gutenberg's catalog
 * speaks, and states everything a paper page needs: authors, the date, the
 * category it was filed under, the abstract, and the PDF to fetch. Its search
 * takes fielded queries, so "by author" and "in this category" are the
 * source's own search rather than a filter applied after the fact.
 */
const API = 'https://export.arxiv.org/api/query';

export type Paper = {
  /** `2310.17688v3` — the version is part of what you downloaded. */
  id: string;
  title: string;
  authors: string[];
  abstract: string;
  /** ISO date the first version was submitted. */
  published: string;
  /** The category it was filed under first: `cs.CL`. */
  category: string;
  pdf: string;
  doi?: string;
  journal?: string;
};

/** How the field the reader typed into is spelled in arXiv's query language. */
export type PaperField = 'all' | 'ti' | 'au' | 'cat';

/**
 * The categories worth putting in a picker. arXiv has 150; these are the ones
 * with enough traffic that browsing them is a reading list rather than a
 * lottery, grouped the way arXiv groups them.
 */
export const paperCategories: { id: string; group: string; name: string }[] = [
  { id: 'cs.AI', group: 'Computing', name: 'Artificial Intelligence' },
  { id: 'cs.CL', group: 'Computing', name: 'Computation and Language' },
  { id: 'cs.LG', group: 'Computing', name: 'Machine Learning' },
  { id: 'cs.CV', group: 'Computing', name: 'Computer Vision' },
  { id: 'cs.CR', group: 'Computing', name: 'Cryptography and Security' },
  { id: 'cs.SE', group: 'Computing', name: 'Software Engineering' },
  { id: 'cs.DC', group: 'Computing', name: 'Distributed Computing' },
  { id: 'cs.HC', group: 'Computing', name: 'Human-Computer Interaction' },
  { id: 'stat.ML', group: 'Statistics', name: 'Machine Learning' },
  { id: 'stat.ME', group: 'Statistics', name: 'Methodology' },
  { id: 'math.ST', group: 'Mathematics', name: 'Statistics Theory' },
  { id: 'math.OC', group: 'Mathematics', name: 'Optimization and Control' },
  { id: 'math.NT', group: 'Mathematics', name: 'Number Theory' },
  { id: 'physics.hist-ph', group: 'Physics', name: 'History and Philosophy' },
  { id: 'quant-ph', group: 'Physics', name: 'Quantum Physics' },
  { id: 'astro-ph.EP', group: 'Physics', name: 'Earth and Planetary Astrophysics' },
  { id: 'cond-mat.stat-mech', group: 'Physics', name: 'Statistical Mechanics' },
  { id: 'q-bio.NC', group: 'Biology', name: 'Neurons and Cognition' },
  { id: 'q-bio.PE', group: 'Biology', name: 'Populations and Evolution' },
  { id: 'econ.GN', group: 'Economics', name: 'General Economics' },
  { id: 'q-fin.GN', group: 'Economics', name: 'General Finance' },
];

/**
 * A category is browsed, not searched: newest first is the point of opening
 * one. A query is ranked by relevance, because a name typed in full is not a
 * request for whatever that person published this morning.
 */
export function queryFor(query: string, field: PaperField): { search: string; newestFirst: boolean } {
  const cleaned = query.trim().replace(/[^\p{L}\p{N}\s.\-:]/gu, ' ').trim();
  if (field === 'cat') return { search: `cat:${cleaned}`, newestFirst: true };
  if (field === 'all') return { search: `all:${cleaned}`, newestFirst: false };
  return { search: `${field}:"${cleaned}"`, newestFirst: false };
}

export async function searchArxiv(query: string, field: PaperField = 'all'): Promise<Paper[]> {
  const { search, newestFirst } = queryFor(query, field);
  const url =
    `${API}?search_query=${encodeURIComponent(search)}&start=0&max_results=30` +
    `&sortBy=${newestFirst ? 'submittedDate' : 'relevance'}&sortOrder=descending`;
  const response = await fetch(url, { headers: { accept: 'application/atom+xml' } });
  if (!response.ok) throw new Error(`${response.status}`);
  return papersFrom(await response.text());
}

const LINK = /<link\b[^>]*\/>/g;
const AUTHOR_NAME = /<name>([\s\S]*?)<\/name>/g;

export function papersFrom(feed: string): Paper[] {
  const papers: Paper[] = [];
  for (const entry of eachElement(feed, 'entry')) {
    const id = /arxiv\.org\/abs\/(\S+?)(?:<|$)/.exec(firstTagText(entry, 'id') ?? '')?.[1];
    const title = clean(firstTagText(entry, 'title'));
    if (!id || !title) continue;
    const links = entry.match(LINK) ?? [];
    const pdf = links.find((link) => link.includes('title="pdf"'));
    papers.push({
      id,
      title,
      authors: [...entry.matchAll(AUTHOR_NAME)].map((match) => clean(match[1])).filter(Boolean),
      abstract: clean(firstTagText(entry, 'summary')),
      published: (firstTagText(entry, 'published') ?? '').slice(0, 10),
      category: /<arxiv:primary_category[^>]*term="([^"]+)"/.exec(entry)?.[1] ?? '',
      pdf: pdf ? decodeEntities(/href="([^"]+)"/.exec(pdf)?.[1] ?? '') : `https://arxiv.org/pdf/${id}`,
      doi: firstTagText(entry, 'arxiv:doi') || undefined,
      journal: clean(firstTagText(entry, 'arxiv:journal_ref')) || undefined,
    });
  }
  return papers;
}

/** Abstracts arrive wrapped at 80 columns; the wrapping is the feed's, not the author's. */
function clean(value: string | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

/** Authors as a book's author line: three of them, then the honest truth. */
export function authorLine(paper: Paper): string {
  if (paper.authors.length <= 3) return paper.authors.join(', ');
  return `${paper.authors.slice(0, 3).join(', ')} +${paper.authors.length - 3}`;
}

/** `2310.17688v3` is what the file is; the title is what the reader is looking for. */
export function fileNameFor(paper: Paper, extension = 'pdf'): string {
  const stem = paper.title.replace(/[\\/:*?"<>|\n\r]+/g, ' ').trim().slice(0, 60) || paper.id;
  return `${stem}.${extension}`;
}

const HTML = (id: string) => `https://arxiv.org/html/${id}`;

/**
 * arXiv renders its own LaTeX to HTML, and that version is a better book than
 * the PDF by every measure this app cares about: real headings, figures that
 * are still files, and every formula carrying the author's TeX in `alttext`
 * instead of arriving as the gravel a text layer makes of a fraction.
 *
 * Not every paper has one — the older the paper, the likelier not — so this
 * answers null and the PDF is fetched instead.
 */
export async function fetchPaperHtml(paper: Paper): Promise<string | null> {
  try {
    const response = await fetch(HTML(paper.id), { headers: { accept: 'text/html' } });
    if (!response.ok) return null;
    if (!(response.headers.get('content-type') ?? '').includes('text/html')) return null;
    const html = await response.text();
    // A paper with no HTML rendering answers with a page saying so.
    if (!/<math|<section|ltx_/i.test(html)) return null;
    return absolute(html, `${HTML(paper.id)}/`);
  } catch {
    return null;
  }
}

/**
 * The figures are `x1.png` next to the page, and the page is about to become a
 * file on a phone — so the links are made absolute while the base is still
 * known rather than resolved against nothing later.
 */
export function absolute(html: string, base: string): string {
  return html.replace(/(<img\b[^>]*?\ssrc=")([^"]+)(")/gi, (whole, head, src: string, tail) => {
    if (/^(https?:|data:|file:)/i.test(src)) return whole;
    return `${head}${base}${src.replace(/^\.?\//, '')}${tail}`;
  });
}
