import type { Block, Importer, ParseContext } from '../types';
import { attr, decodeEntities, stripTags } from '../xml';
import { decodeText } from '../decode';
import { imageMarker } from '../../reader/images';

const BLOCK_END = /<\/(p|div|h[1-6]|li|blockquote|section|article|figcaption|pre|td)\s*>/gi;
const IMG = /<(?:img|image)\b[^>]*>/gi;
const MATH = /<math\b([^>]*)>[\s\S]*?<\/math>/gi;

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
 * Set apart so the formula can be found again after the tags are gone. A
 * private-use character, because it is the one thing no paper contains.
 */
const MARK = '\uE000';
const TOKEN = (at: number) => `${MARK}math${at}${MARK}`;

export async function blocksFromHtml(html: string, context?: ParseContext): Promise<Block[]> {
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html;
  const withoutNoise = body
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n');

  // Every formula is lifted out before the tags go, because stripping tags is
  // what would otherwise leave `E=mc2` where E = mc² was.
  const formulas: { latex: string; display: boolean }[] = [];
  const marked = withoutNoise.replace(MATH, (whole, attrs: string) => {
    const latex = decodeEntities(attr(`<math ${attrs}>`, 'alttext') ?? '').trim();
    if (!latex) return stripTags(whole);
    formulas.push({ latex, display: /display\s*=\s*["']?block/i.test(attrs) });
    return TOKEN(formulas.length - 1);
  });

  const pictures = await drawn(formulas, context);

  // Splitting on closing tags keeps the tag that closed each piece in the next
  // slot, and that — not what the piece starts with — is what says it was a
  // heading: arXiv opens every one of them `<section …><h2 …>`, so a test on
  // the opening tag finds a section and misses every title in the paper.
  const parts = marked.split(BLOCK_END);
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
    const text = decodeEntities(stripTags(piece)).replace(/[^\S\n]+/g, ' ').trim();
    if (!text) continue;
    for (const block of split(text, formulas, pictures)) {
      blocks.push(closed ? { ...block, heading: Number(closed[1]) } : block);
    }
  }
  return blocks;
}

/**
 * A formula set on its own line is a paragraph of its own; one inside a
 * sentence stays in it, as its TeX, which is what the author wrote and what
 * anyone would search for.
 */
function split(
  text: string,
  formulas: { latex: string; display: boolean }[],
  pictures: string[]
): Block[] {
  const blocks: Block[] = [];
  let carry = '';
  const parts = text.split(new RegExp(`${MARK}math(\\d+)${MARK}`));
  for (let at = 0; at < parts.length; at++) {
    if (at % 2 === 0) {
      carry += parts[at];
      continue;
    }
    const index = Number(parts[at]);
    const formula = formulas[index];
    if (!formula) continue;
    if (!formula.display) {
      carry += `\`${formula.latex}\``;
      continue;
    }
    if (carry.trim()) blocks.push({ text: carry.trim() });
    carry = '';
    // The TeX is the caption, so a picture that will not load still says what
    // it was — and a search for the formula still finds it.
    blocks.push({
      text: pictures[index]
        ? imageMarker(pictures[index], `$${formula.latex}$`)
        : `\`${formula.latex}\``,
    });
  }
  if (carry.trim()) blocks.push({ text: carry.trim() });
  return blocks;
}

/** Nothing to draw with, or nothing drawn: the TeX stands in for itself. */
async function drawn(
  formulas: { latex: string; display: boolean }[],
  context?: ParseContext
): Promise<string[]> {
  const wanted = formulas.map((formula, at) => ({ at, formula })).filter((entry) => entry.formula.display);
  if (!wanted.length || !context?.renderMath || !context.saveImage) return [];
  try {
    const drawings = await context.renderMath(wanted.map((entry) => entry.formula.latex));
    const pictures: string[] = [];
    wanted.forEach((entry, index) => {
      const encoded = drawings[index];
      if (!encoded) return;
      const bytes = bytesFromBase64(encoded);
      if (bytes.length) pictures[entry.at] = context.saveImage!(`math-${entry.at}-${bytes.length}.png`, bytes);
    });
    return pictures;
  } catch {
    return [];
  }
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
