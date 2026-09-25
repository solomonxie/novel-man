import { unzipSync } from 'fflate';
import type { Block, Importer, ParseContext } from '../types';
import { attr, decodeEntities, firstTagText, stripTags } from '../xml';
import { imageMarker } from '../../reader/images';

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
      const body: Block[] = text ? [heading ? { text, heading: Number(heading[1]) } : { text }] : [];
      return [...figures, ...body];
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
  return entry ? new TextDecoder('utf-8').decode(entry) : undefined;
}
