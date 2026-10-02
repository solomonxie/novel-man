import { unzipSync } from 'fflate';
import type { Block, Importer, Origin, ParseContext } from '../types';
import { attr, attrValue, decodeEntities, firstTagText, stripTags } from '../xml';
import { imageMarker } from '../../reader/images';
import { decodeUtf8 } from '../decode';

const BLOCK_END = /<\/(p|div|h[1-6]|li|blockquote|section)\s*>/gi;
const HEADING_OPEN = /^<h([1-6])\b/i;

export const epubImporter: Importer = {
  id: 'epub',
  label: 'EPUB',
  extensions: ['epub'],
  utis: ['org.idpf.epub-container'],
  async parse(bytes, _fileName, context) {
    const zip = unzipSync(bytes);
    const container = read(zip, 'META-INF/container.xml');
    const rootPath = container && attr(/<rootfile\b[^>]*>/.exec(container)?.[0] ?? '', 'full-path');
    if (!rootPath) throw new Error('not-an-epub');

    const opf = read(zip, rootPath) ?? '';
    const baseDir = rootPath.includes('/') ? rootPath.replace(/\/[^/]*$/, '/') : '';

    const hrefById = new Map<string, string>();
    for (const item of opf.match(/<item\b[^>]*>/g) ?? []) {
      const id = attr(item, 'id');
      const href = attr(item, 'href');
      if (id && href) hrefById.set(id, resolve(baseDir, href));
    }

    const blocks: Block[] = [];
    for (const ref of opf.match(/<itemref\b[^>]*>/g) ?? []) {
      const href = hrefById.get(attr(ref, 'idref') ?? '');
      const xhtml = href ? read(zip, href) : undefined;
      if (!xhtml) continue;
      const parsed = blocksFromXhtml(xhtml, (src) => keepImage(zip, href!, src, context));
      if (parsed.length) blocks.push({ ...parsed[0], boundary: true }, ...parsed.slice(1));
    }

    return {
      blocks,
      title: firstTagText(opf, 'dc:title'),
      author: firstTagText(opf, 'dc:creator'),
      origin: originIn(opf),
    };
  },
};

/**
 * A picture in the book becomes a file next to it and a paragraph that links
 * to it. Kept only when the pipeline handed us somewhere to put it: the
 * fixture tests parse epubs outside the app, where there is no file system.
 */
function keepImage(
  zip: Record<string, Uint8Array>,
  documentPath: string,
  src: string,
  context?: ParseContext
): string | null {
  if (!context?.saveImage) return null;
  const baseDir = documentPath.includes('/') ? documentPath.replace(/\/[^/]*$/, '/') : '';
  const path = resolve(baseDir, decodeEntities(src));
  const bytes = zip[path] ?? zip[decodeURIComponent(path)];
  if (!bytes?.length) return null;
  const name = `epub-${hash(path)}.${(path.split('.').pop() ?? 'jpg').toLowerCase()}`;
  try {
    return context.saveImage(name, bytes);
  } catch {
    // A picture that cannot be written is not worth losing the book over.
    return null;
  }
}

/** Stable per source path, so re-importing the same book reuses its files. */
function hash(value: string): string {
  let sum = 0;
  for (let at = 0; at < value.length; at++) sum = (sum * 31 + value.charCodeAt(at)) >>> 0;
  return sum.toString(36);
}

const IMG = /<(?:img|image)\b[^>]*>/gi;

/**
 * What the book was made from, where the package file says so.
 *
 * Written by `tools/convert-pdf.mjs` as ordinary OPF metadata, which every
 * other reader ignores and this one uses to check that a PDF somebody links
 * later is the PDF the book came out of.
 */
function originIn(opf: string): Origin | undefined {
  const said = (name: string) =>
    attrValue(
      opf.match(new RegExp(`<meta\\b[^>]*property="novel-man:${name}"[^>]*>`, 'i'))?.[0] ?? '',
      'content'
    ) ??
    /** `property` is EPUB 3; `name`/`content` is what EPUB 2 would have used. */
    attrValue(
      opf.match(new RegExp(`<meta\\b[^>]*name="novel-man:${name}"[^>]*>`, 'i'))?.[0] ?? '',
      'content'
    );
  const pages = Number(said('origin-pages'));
  const bytes = Number(said('origin-bytes'));
  const fingerprint = said('origin-fingerprint');
  if (!pages || !bytes || !fingerprint) return undefined;
  return { kind: said('origin-kind') ?? 'pdf', name: said('origin-name') ?? '', bytes, pages, fingerprint };
}

/**
 * `<span epub:type="pagebreak" aria-label="84"/>` — the standard way an EPUB
 * says a page of the printed book began here. Scholarly editions carry them;
 * so does anything this repo converts out of a PDF.
 *
 * Read before the tags are stripped, because stripping is what would otherwise
 * throw them away: the marker has no text of its own, and the whole of what it
 * says is in its attributes.
 */
const PAGEBREAK = /<(?:span|a|div)\b[^>]*(?:epub:type|role)="[^"]*(?:pagebreak|doc-pagebreak)[^"]*"[^>]*>/gi;

function pageIn(chunk: string): number | undefined {
  for (const tag of chunk.match(PAGEBREAK) ?? []) {
    const label = attr(tag, 'aria-label') ?? attr(tag, 'title') ?? attr(tag, 'id')?.replace(/\D+/g, '');
    const number = Number(label);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return undefined;
}

function blocksFromXhtml(xhtml: string, keep: (src: string) => string | null): Block[] {
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(xhtml)?.[1] ?? xhtml;
  // Same lazy-quantifier trap as the docx scan: only pay for it when it applies.
  const withoutNoise =
    body.indexOf('<script') >= 0 || body.indexOf('<style') >= 0
      ? body.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
      : body;
  return withoutNoise
    .replace(/<br\s*\/?>/gi, '\n')
    .split(BLOCK_END)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk && !/^(p|div|h[1-6]|li|blockquote|section)$/i.test(chunk))
    .flatMap((chunk) => {
      const heading = HEADING_OPEN.exec(chunk.trimStart());
      const text = decodeEntities(stripTags(chunk)).replace(/\s+/g, ' ').trim();
      // A figure and its caption are two paragraphs, in the order they appear.
      const figures: Block[] = [];
      for (const tag of chunk.match(IMG) ?? []) {
        const src = attr(tag, 'src') ?? attr(tag, 'xlink:href') ?? attr(tag, 'href');
        const stored = src ? keep(src) : null;
        if (stored) figures.push({ text: imageMarker(stored, attr(tag, 'alt') ?? '') });
      }
      const page = pageIn(chunk);
      const body: Block[] = text ? [heading ? { text, heading: Number(heading[1]) } : { text }] : [];
      // The marker says a page begins here, so it belongs to whatever is drawn
      // next — the picture if there is one, otherwise the paragraph.
      const all = [...figures, ...body];
      if (page !== undefined && all.length) all[0] = { ...all[0], page };
      return all;
    })
    .filter((block) => block.text.length > 0);
}

function resolve(baseDir: string, href: string): string {
  const path = `${baseDir}${href.split('#')[0]}`;
  const parts: string[] = [];
  for (const segment of path.split('/')) {
    if (segment === '..') parts.pop();
    else if (segment !== '.' && segment !== '') parts.push(segment);
  }
  return parts.join('/');
}

function read(zip: Record<string, Uint8Array>, path: string): string | undefined {
  const entry = zip[path] ?? zip[decodeURIComponent(path)];
  return entry ? decodeUtf8(entry) : undefined;
}
