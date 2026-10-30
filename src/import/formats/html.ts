import type { Block, Importer, ParseContext } from '../types';
import { attr, decodeEntities, stripTags } from '../xml';
import { decodeText } from '../decode';
import { imageMarker } from '../../reader/images';
import { emphasis, idsIn, isWeb, lift, liftedIn, links } from '../markup';

const BLOCK_END = /<\/(p|div|h[1-6]|li|blockquote|section|article|figcaption|pre|td)\s*>/gi;
const IMG = /<(?:img|image)\b[^>]*>/gi;

/**
 * A page, read as a book. It exists for papers: arXiv renders its own LaTeX to
 * HTML, and that version has what a PDF's text layer loses — real headings,
 * real figures, and the author's TeX sitting in `alttext` on every formula
 * rather than a scatter of glyphs where a formula used to be.
 *
 * Previewed before it becomes a book, like a PDF, because a page can always
 * turn out to have been navigation and cookie banners.
 */
export const htmlImporter: Importer = {
  id: 'html',
  label: 'HTML',
  extensions: ['html', 'htm', 'xhtml'],
  utis: ['public.html', 'public.xhtml'],
  needsPreview: true,
  async parse(bytes, _fileName, context) {
    return { blocks: await blocksFromHtml(decodeText(bytes), context) };
  },
};


/**
 * The part of a page that is the thing, rather than the site around it.
 *
 * `<body>` is a whole web page: masthead, sidebar, footer, a column of
 * "recent posts". Those are not paragraphs in a book, and the sidebar ones are
 * worse than noise — a widget's `<h2>` is a heading like any other, so
 * `detectChapters` takes "Categories" and "Recent Posts" for chapters and the
 * article itself becomes one section of a book about the blog.
 *
 * `<article>` and `<main>` are the page saying which part it means, and every
 * publishing platform emits one. From the first opening tag to the *last*
 * closing one, so a page carrying several posts comes through whole rather
 * than stopping at the end of the first.
 */
function contentOf(body: string): string {
  for (const tag of ['article', 'main']) {
    const opens = new RegExp(`<${tag}[^>]*>`, 'i').exec(body);
    const closes = body.toLowerCase().lastIndexOf(`</${tag}>`);
    if (opens && closes > opens.index) {
      return body.slice(opens.index + opens[0].length, closes);
    }
  }
  return body;
}

/**
 * What is never prose, whichever part of the page it sits in.
 *
 * `<header>` is deliberately absent: on every blog theme it is what wraps the
 * post's own `<h1>`, and stripping it throws away the one heading that names
 * the chapter.
 */
const FURNITURE = /<(script|style|noscript|nav|aside|footer|form)(?=[\s/>])[^>]*>[\s\S]*?<\/\1>/gi;

/**
 * What the author took out. It has to go before anything else looks at the
 * markup, because a comment is not inert once the tags are stripped: the
 * CppCoreGuidelines sidebar carries a commented-out `<h3>` around the project's
 * own name, and reading past it cost the import twice over — the `-->` arrived
 * as a paragraph of the book, and the dead `<h3>` arrived as a chapter, so the
 * first thing anyone saw of a 700,000-character document was `- ->` and `-->`.
 *
 * Non-greedy, and that is the whole subtlety. The same comment contains
 * `<!- -<a …>- ->` — someone's attempt at nesting one comment in another, which
 * HTML has never allowed. Those are not delimiters, the first real `-->` is the
 * close, and stopping there is exactly right.
 */
const COMMENTS = /<!--[\s\S]*?-->/g;

export async function blocksFromHtml(html: string, _context?: ParseContext): Promise<Block[]> {
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html;
  // Comments first: `contentOf` looks for an `<article>`, and a commented-out
  // one would otherwise choose the part of the page to read.
  const withoutNoise = contentOf(body.replace(COMMENTS, ''))
    .replace(FURNITURE, '')
    .replace(/<br\s*\/?>/gi, '\n');

  // Formulas, listings and tables come out before the tags go: stripping is
  // what would otherwise leave `E=mc2` where E = mc² was.
  const link = (href: string) => (href.startsWith('#') ? href : isWeb(href) ? href : null);
  const { html: lifted, lifted: held } = lift(withoutNoise, link);

  // Splitting on closing tags keeps the tag that closed each piece in the next
  // slot, and that — not what the piece starts with — is what says it was a
  // heading: arXiv opens every one of them `<section …><h2 …>`, so a test on
  // the opening tag finds a section and misses every title in the paper.
  const parts = lifted.split(BLOCK_END);
  const blocks: Block[] = [];
  for (let at = 0; at < parts.length; at += 2) {
    const piece = parts[at].trim();
    if (!piece) continue;
    const closed = /^h([1-6])$/i.exec(parts[at + 1] ?? '');
    for (const tag of piece.match(IMG) ?? []) {
      const src = attr(tag, 'src');
      if (src && /^(https?:|file:|data:)/i.test(src)) {
        blocks.push({ text: imageMarker(decodeEntities(src), attr(tag, 'alt') ?? '') });
      }
    }
    const anchors = idsIn(piece);
    const text = decodeEntities(stripTags(links(closed ? piece : emphasis(piece), link))).replace(/[^\S\n]+/g, ' ').trim();
    if (!text) continue;
    const index = liftedIn(text);
    if (index !== null) {
      if (held[index]) blocks.push({ text: held[index], anchors });
      continue;
    }
    const item = /^li$/i.test(parts[at + 1] ?? '');
    blocks.push(closed ? { text, heading: Number(closed[1]), anchors } : { text: item ? `• ${text}` : text, anchors });
  }
  return blocks;
}

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Hermes has no `atob`, and the picture came back over a string bridge. */
export function bytesFromBase64(value: string): Uint8Array {
  const clean = value.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let byte = 0;
  for (let at = 0; at < clean.length; at += 4) {
    const a = CHARS.indexOf(clean[at]);
    const b = CHARS.indexOf(clean[at + 1]);
    const c = CHARS.indexOf(clean[at + 2]);
    const d = CHARS.indexOf(clean[at + 3]);
    out[byte++] = (a << 2) | (b >> 4);
    if (c >= 0) out[byte++] = ((b & 15) << 4) | (c >> 2);
    if (d >= 0) out[byte++] = ((c & 3) << 6) | d;
  }
  return out.subarray(0, byte);
}
