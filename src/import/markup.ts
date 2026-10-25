import { attr, decodeEntities, stripTags } from './xml';
import { marked } from './normalize';

/**
 * What an EPUB or a web page says in markup that plain paragraphs lose: code
 * set as written, tables, links and the places they point at. Shared by both
 * importers, which differ only in how a link's address is resolved.
 */

/** Stands in for a lifted block until the paragraphs are cut; private-use, like the link marks. */
const LIFTED = '';
export const liftedIn = (text: string): number | null => {
  const found = /^(\d+)$/.exec(text.trim());
  return found ? Number(found[1]) : null;
};

const PRE = /<pre\b([^>]*)>([\s\S]*?)<\/pre>/gi;
const TABLE = /<table\b[^>]*>([\s\S]*?)<\/table>/gi;
const ROW = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
const CELL = /<(t[hd])\b([^>]*)>([\s\S]*?)<\/t[hd]>/gi;
const CODE = /<code\b[^>]*>([\s\S]*?)<\/code>/gi;
const MATH = /<math\b([^>]*)>[\s\S]*?<\/math>/gi;

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** `language-cpp`, `lang-py`, `sourceCode cpp`, `highlight-source-js`, `brush: js`, Enlighter's `data-enlighter-language`. */
function languageOf(attrs: string, inner: string): string {
  const tag = `<x ${attrs}>`;
  const said = (attr(tag, 'data-lang') || attr(tag, 'data-enlighter-language') || attr(tag, 'data-language'))?.toLowerCase();
  if (said) return said === 'generic' || said === 'text' || said === 'plain' ? '' : said;
  const classes = `${attr(tag, 'class') ?? ''} ${/<code\b[^>]*class="([^"]*)"/i.exec(inner)?.[1] ?? ''}`;
  const named = /(?:language|lang|highlight-source|brush:)[-\s]?([\w+#-]+)/i.exec(classes)?.[1];
  if (named) return named.toLowerCase();
  const source = /\bsourceCode\s+([\w+#-]+)/.exec(classes)?.[1];
  return source && source !== 'sourceCode' ? source.toLowerCase() : '';
}

function codeOf(attrs: string, inner: string): string {
  const body = decodeEntities(stripTags(inner.replace(/<br\s*\/?>/gi, '\n'))).replace(/^\n+|\s+$/g, '');
  return `\`\`\`${languageOf(attrs, inner)}\n${body}\n\`\`\``;
}

/** Inline markup a cell keeps: code, and links once they are marked. */
function cellText(html: string, link: (href: string) => string | null): string {
  const text = decodeEntities(stripTags(links(html.replace(CODE, (_, code: string) => `\`${stripTags(code)}\``), link)));
  return text.replace(/\s+/g, ' ').trim().replace(/\|/g, '\\|');
}

/** A heading row: `<th>` throughout, or every filled cell bold — what a blog editor makes of one. */
const BOLD = /^\s*<(strong|b)\b[^>]*>[\s\S]*<\/\1>\s*$/i;

function tableOf(inner: string, link: (href: string) => string | null): string[] {
  type Cell = { text: string; span: number; head: boolean };
  const rows: Cell[][] = [];
  for (const row of inner.matchAll(ROW)) {
    const cells = [...row[1].matchAll(CELL)].map((cell) => {
      const text = cellText(cell[3], link);
      const span = Math.max(1, Number(attr(`<x ${cell[2]}>`, 'colspan')) || 1);
      return { text, span, head: cell[1].toLowerCase() === 'th' || !text || BOLD.test(cell[3]) };
    });
    if (cells.length) rows.push(cells);
  }
  // A label over the columns — one filled cell spanning the rest — is said before the table.
  const labels: string[] = [];
  while (rows.length > 1) {
    const filled = rows[0].filter((cell) => cell.text);
    if (filled.length !== 1 || !rows[0].some((cell) => cell.span > 1)) break;
    labels.push(filled[0].text.replace(/\\\|/g, '|'));
    rows.shift();
  }
  if (!rows.length) return labels;
  const spread = rows.map((row) => row.flatMap((cell) => [cell.text, ...Array<string>(cell.span - 1).fill('')]));
  const width = Math.max(...spread.map((row) => row.length));
  const line = (cells: string[]) =>
    `| ${Array.from({ length: width }, (_, at) => cells[at] || ' ').join(' | ')} |`;
  const lines = spread.map(line);
  if (rows.length > 1 && rows[0].every((cell) => cell.head) && rows[0].some((cell) => cell.text)) {
    lines.splice(1, 0, `|${' --- |'.repeat(width)}`);
  }
  const table = lines.length === 1 ? lines[0].replace(/^\| | \|$/g, '').replace(/ \| /g, ' · ') : lines.join('\n');
  return [...labels, table];
}

/**
 * Code and tables out of the flow before the paragraphs are cut, each left as
 * a paragraph of its own holding a token. Cutting first would split a table
 * at every `<td>` and fold a listing's lines into one.
 */
export function lift(html: string, link: (href: string) => string | null): { html: string; lifted: string[] } {
  const lifted: string[] = [];
  const hold = (...texts: (string | null)[]) =>
    texts
      .filter((text): text is string => Boolean(text))
      .map((text) => {
        lifted.push(text);
        return `</p><p>${LIFTED}${lifted.length - 1}${LIFTED}</p><p>`;
      })
      .join('');
  const out = html
    // The author's own TeX, which MathML carries in `alttext` and which is
    // what gets drawn; without it, the MathML's own text is all there is.
    .replace(MATH, (whole: string, attrs: string) => {
      const tex = decodeEntities(attr(`<math ${attrs}>`, 'alttext') ?? '').trim();
      if (!tex) return stripTags(whole);
      return /display\s*=\s*["']?block/i.test(attrs) ? hold(`$$\n${tex}\n$$`) : `$${escapeHtml(tex)}$`;
    })
    .replace(PRE, (_, attrs: string, inner: string) => hold(codeOf(attrs, inner)))
    .replace(TABLE, (_, inner: string) => hold(...tableOf(inner, link)))
    .replace(CODE, (_, inner: string) => `\`${inner}\``);
  return { html: out, lifted };
}

const A_HREF = /<a\b([^>]*\bhref\s*=\s*["']([^"']*)["'][^>]*)>([\s\S]*?)<\/a>/gi;

/** Every `<a href>` marked with where it goes; one going nowhere is its words. */
export function links(html: string, link: (href: string) => string | null): string {
  if (html.indexOf('href') < 0) return html;
  return html.replace(A_HREF, (_, _attrs: string, href: string, inner: string) => {
    const target = link(decodeEntities(href).trim());
    return target && stripTags(inner).trim() ? marked(inner, target) : inner;
  });
}

const ID = /<[a-z][\w:-]*\b[^>]*?\s(?:id|name)\s*=\s*["']([^"']+)["']/gi;

export function idsIn(html: string): string[] {
  if (html.indexOf('id=') < 0 && html.indexOf('name=') < 0) return [];
  return [...html.matchAll(ID)].map((found) => found[1]);
}

/** An address on the web stays one; anything else this importer has to resolve. */
export const isWeb = (href: string) => /^(https?:|mailto:)/i.test(href);
