import { unzipSync } from 'fflate';
import type { Block, Importer } from '../types';
import { attr, decodeEntities, firstTagText, stripTags } from '../xml';

const BLOCK_END = /<\/(p|div|h[1-6]|li|blockquote|section)\s*>/gi;
const HEADING_OPEN = /^<h([1-6])\b/i;

export const epubImporter: Importer = {
  id: 'epub',
  label: 'EPUB',
  extensions: ['epub'],
  mimeTypes: ['application/epub+zip'],
  async parse(bytes) {
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
      const parsed = blocksFromXhtml(xhtml);
      if (parsed.length) blocks.push({ ...parsed[0], boundary: true }, ...parsed.slice(1));
    }

    return {
      blocks,
      title: firstTagText(opf, 'dc:title'),
      author: firstTagText(opf, 'dc:creator'),
    };
  },
};

function blocksFromXhtml(xhtml: string): Block[] {
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
    .map((chunk) => {
      const heading = HEADING_OPEN.exec(chunk.trimStart());
      const text = decodeEntities(stripTags(chunk)).replace(/\s+/g, ' ').trim();
      return heading ? { text, heading: Number(heading[1]) } : { text };
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
