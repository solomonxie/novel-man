import type { Block, Importer } from '../types';
import { decodeText } from '../decode';
import { marked } from '../normalize';

function blocksFromText(text: string): Block[] {
  return text
    .split(/\n{2,}|\r\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((text) => ({ text }));
}

export const txtImporter: Importer = {
  id: 'txt',
  label: 'Plain text',
  extensions: ['txt'],
  utis: ['public.plain-text'],
  async parse(bytes) {
    return { blocks: blocksFromText(decodeText(bytes)) };
  },
};

/** What the author took out. Never read, wherever it sits. */
const COMMENTS = /<!--[\s\S]*?-->/g;

/**
 * Raw HTML in Markdown, which is allowed everywhere and meant to be read
 * nowhere. The CppCoreGuidelines put an `<a name="…"></a>` in front of all
 * 2,627 of its headings, so every chapter in the book was called
 * `<a name="s-abstract"></a>Abstract` until this ran.
 *
 * The test is not a tag name, and that is the point. A C++ document is full of
 * `#include <span>` and `vector<int>`, and `span` is an HTML element as surely
 * as it is a standard header — a list of names eats the code. So what counts
 * as a tag is how it is written: a closing tag, a self-closing one, or one
 * carrying an attribute. `<a name="main">` qualifies on its attribute,
 * `</a>` on its slash, and `<span>` on nothing at all, which is the answer we
 * want for both of them.
 */
const MARKUP = /<\/[A-Za-z][\w-]*\s*>|<[A-Za-z][\w-]*(?:\s+[^<>]*?)?\/>|<[A-Za-z][\w-]*\s+[^<>]*?>/g;

/**
 * The handful that are real HTML even bare, because nobody includes a header
 * called any of them. `<br>` and `<p>` are what a hand-written table row uses
 * for a line break, and leaving them in is reading the markup.
 */
const BARE = /<\/?(?:br|hr|p|div|b|i|em|strong|sup|sub|u|s|center|small|big|tt|kbd|ul|ol|li|table|thead|tbody|tr|td|th|blockquote|details|summary|figure|figcaption|h[1-6]|wbr)\s*\/?>/gi;

/** Code is quoted, not written: nothing in here is markup and nothing is touched. */
const CODE_SPAN = /(`+)[\s\S]*?\1/g;

/**
 * Markup out, code left exactly as it was typed. Splitting on the backtick
 * spans first is what keeps `` `<vector>` `` whole while `<a name="x">` goes.
 */
type Refs = Map<string, string>;

/** `$x^2$`, kept as typed for the same reason code is: TeX is full of backslashes. */
const MATH_SPAN = /\$[^\s$](?:[^$\n]*?[^\s$\\])?\$(?!\d)/;
const PROTECTED = new RegExp(`${CODE_SPAN.source}|${MATH_SPAN.source}`, 'g');

/**
 * Markup out, links marked, code and maths left exactly as typed. Links go
 * first, because a link's words are often code: [`throw`](#rc-throw).
 */
function clean(source: string, refs: Refs = new Map()): string {
  const spans = [...source.matchAll(PROTECTED)].map((span) => [span.index ?? 0, (span.index ?? 0) + span[0].length]);
  const inCode = (at: number) => spans.some(([from, to]) => at > from && at < to);
  const text = source.replace(LINK, (whole: string, bang: string, words: string, url: string, at: number) => {
    if (inCode(at)) return whole;
    const href = url.replace(/^<|>$/g, '');
    if (bang) return /^(https?:|data:)/i.test(href) && whole.trim() === source.trim() ? whole : words;
    return words.trim() ? marked(words, href) : '';
  });
  const parts: string[] = [];
  let cursor = 0;
  for (const span of text.matchAll(PROTECTED)) {
    const at = span.index ?? 0;
    parts.push(strip(text.slice(cursor, at), refs), span[0]);
    cursor = at + span[0].length;
  }
  parts.push(strip(text.slice(cursor), refs));
  return parts.join('');
}

/**
 * `[text](url "title")`, whose text may hold escaped brackets or code. A
 * picture keeps its marker only alone and fetchable; a relative path resolves
 * against nothing once this is text.
 */
const LINK = /(!?)\[((?:\\.|`[^`\n]*`|\[[^\[\]]*\]|[^\[\]\\`])*)\]\((<[^>]*>|[^()\s]*(?:\([^()]*\)[^()\s]*)*)(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g;
const REF_LINK = /\[((?:\\.|[^\]\\])+)\]\[([^\]]*)\]/g;
const AUTOLINK = /<((?:https?|mailto):[^<>\s]+)>/g;
/** A bare address, as GitHub links one — but not one already inside a link. */
const BARE_URL = /(?<![\w/"'=(])https?:\/\/[^\s<>()\[\]-]*[^\s<>()\[\]-.,;:!?'"*_]/g;
/** Not `\|`: a table needs it to tell a cell's pipe from the edge of one. */
const ESCAPE = /\\([\\`*_{}\[\]()#+\-.!<>~])/g;

function strip(prose: string, refs: Refs): string {
  return prose
    .replace(COMMENTS, '')
    .replace(MARKUP, '')
    .replace(BARE, '')
    .replace(REF_LINK, (whole, words: string, id: string) => {
      const href = refs.get((id || words).trim().toLowerCase());
      return href ? marked(words, href) : words;
    })
    .replace(AUTOLINK, (_, url: string) => marked(url, url))
    .replace(BARE_URL, (url) => marked(url, url))
    .replace(ESCAPE, '$1');
}

/** The words a reader sees, for a title or an anchor. */
function plainOf(label: string): string {
  return label.replace(/[^]*/g, '').replace(//g, '');
}

/**
 * The id GitHub gives a heading, which is what `[see](#the-heading)` names:
 * lower case, punctuation out, spaces to hyphens.
 */
export function slugOf(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[!-,./:-@[-^`{-~]/g, '')
    .replace(/\s/g, '-');
}

const ANCHOR_TAG = /<a\s[^>]*?\b(?:name|id)\s*=\s*["']([^"']+)["'][^>]*>/gi;
const REF_DEFINITION_AT = /^ {0,3}\[([^\]]+)\]:\s+<?([^\s>]+)>?/;

/**
 * Front matter, as every static site generator and half the Markdown in the
 * world writes it. Only `title` and `author` are read — they are the two the
 * file name cannot carry, and a book converted from somewhere else arrives
 * knowing both. Anything else in the block is skipped rather than guessed at.
 */
const FRONT_MATTER = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

function frontMatter(source: string): { body: string; title?: string; author?: string } {
  const found = FRONT_MATTER.exec(source);
  if (!found) return { body: source };
  const fields = new Map<string, string>();
  for (const line of found[1].split(/\r?\n/)) {
    const pair = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (pair) fields.set(pair[1].toLowerCase(), pair[2].trim().replace(/^["']|["']$/g, ''));
  }
  return {
    body: source.slice(found[0].length),
    title: fields.get('title') || undefined,
    author: fields.get('author') || undefined,
  };
}

/**
 * `\#` at the start of a line is Markdown's own way of saying "a hash, not a
 * heading", and it has to be honoured because converted books rely on it: a
 * Python comment lifted out of a code listing begins `# Create model`, and
 * read as a heading it became a chapter of the book — seven of them, in the
 * middle of a chapter on domain-specific architectures.
 */
const ESCAPED = /^(\s{0,3})\\(#)/;

const FENCE_OPEN = /^ {0,3}(```+|~~~+)/;
const ATX = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
/** Four spaces or a tab: Markdown's older way of setting a block of code. */
const INDENTED = /^(?: {4}|\t)/;
/**
 * A bullet indented under another bullet, which is the one thing that looks
 * exactly like indented code and is not. Markdown has always been ambiguous
 * here; a nested list is far commoner than a code block that opens with `*`.
 */
const BULLET = /^\s*(?:[*+-]|\d+[.)])\s/;
const LIST_ITEM = /^\s*(?:([*+-])|(\d+[.)]))\s+/;
const RULE = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/;
const SETEXT = /^ {0,3}(=+|-+)\s*$/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_RULE = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;
const REF_DEFINITION = /^ {0,3}\[[^\]]+\]:\s+\S/;

/**
 * Markdown, read a line at a time rather than a blank line at a time.
 *
 * Splitting the file on blank lines first is what made this wrong twice. A
 * heading with prose on the very next line — which is most headings people
 * write — landed in a chunk the heading pattern could not match, so it became
 * a paragraph and the chapter went missing. And a fenced code block with a
 * blank line in it was torn into pieces, none of which began with a fence any
 * more, so the reader set a C++ listing as prose and wrapped it.
 *
 * So the fence is tracked across lines and closed by its own run of backticks,
 * and the block keeps its fences — `codeBlockIn` wants to see them.
 */
function markdownBlocks(input: string): { blocks: Block[]; title?: string; author?: string } {
  const { body: source, title: stated, author } = frontMatter(input);
  const lines = source.split(/\r?\n/);
  const refs: Refs = new Map();
  for (const line of lines) {
    const definition = REF_DEFINITION_AT.exec(line);
    if (definition) refs.set(definition[1].trim().toLowerCase(), definition[2]);
  }

  const blocks: Block[] = [];
  // What the front matter said wins: a converted book states its real title,
  // where the first heading is only the best guess available without one.
  let title: string | undefined = stated;
  let paragraph: string[] = [];
  let fence: string | null = null;
  let code: string[] = [];
  let lang = '';
  let maths: string[] | null = null;
  let table: string[] = [];
  /** Named by an `<a name>` above, waiting for the block it names. */
  let anchors: string[] = [];
  const slugs = new Map<string, number>();

  const push = (block: Block) => {
    if (anchors.length) {
      block.anchors = [...(block.anchors ?? []), ...anchors];
      anchors = [];
    }
    blocks.push(block);
  };

  const pushHeading = (raw: string, level: number) => {
    const label = clean(raw, refs).trim();
    const words = plainOf(label);
    if (level === 1 && !title) title = words;
    if (!label) return;
    const slug = slugOf(words);
    const seen = slugs.get(slug) ?? 0;
    slugs.set(slug, seen + 1);
    push({ text: label, heading: level, anchors: slug ? [seen ? `${slug}-${seen}` : slug] : [] });
  };

  const endParagraph = () => {
    const text = clean(paragraph.join('\n'), refs).trim();
    paragraph = [];
    if (text) push({ text });
  };

  const endTable = () => {
    if (!table.length) return;
    const rows = table;
    table = [];
    // One row is not a table, and reads better as the line it is.
    if (rows.length === 1) push({ text: clean(rows[0].trim().replace(/^\||\|$/g, ''), refs).trim() });
    else push({ text: rows.map((row) => clean(row.trim(), refs)).join('\n') });
  };

  /**
   * An indented block, held open across the blank lines inside it. Emitted
   * fenced, because fences are what the reader looks for — and what it does
   * with them is set the lines monospaced and leave them unwrapped and
   * unsegmented, which is the whole reason to tell code from prose.
   *
   * The CppCoreGuidelines are written this way throughout: no fences at all
   * and 7,045 indented lines, so every C++ listing in the book arrived as
   * paragraphs of prose to be wrapped and split into sentences.
   */
  let indented: string[] | null = null;
  const endIndented = () => {
    const held = indented ?? [];
    indented = null;
    while (held.length && !held[held.length - 1].trim()) held.pop();
    if (!held.length) return;
    const body = held.map((line) => line.replace(INDENTED, '')).join('\n');
    push({ text: `\`\`\`\n${body}\n\`\`\`` });
  };

  /** Every fence is written back as three backticks, which is the one the reader reads. */
  const endFence = () => {
    push({ text: `\`\`\`${lang}\n${code.join('\n')}\n\`\`\`` });
    code = [];
    fence = null;
  };

  for (const line of lines) {
    if (indented !== null) {
      if (INDENTED.test(line) || !line.trim()) {
        indented.push(line);
        continue;
      }
      endIndented();
    }

    if (fence !== null) {
      const closed = new RegExp(`^ {0,3}${fence[0] === '`' ? '`' : '~'}{${fence.length},}\\s*$`);
      if (closed.test(line)) endFence();
      else code.push(line);
      continue;
    }

    if (maths !== null) {
      const closing = line.trimEnd().endsWith('$$');
      maths.push(closing ? line.trimEnd().slice(0, -2) : line);
      if (closing) {
        push({ text: `$$\n${maths.join('\n').trim()}\n$$` });
        maths = null;
      }
      continue;
    }

    if (!TABLE_ROW.test(line)) endTable();

    for (const tag of line.matchAll(ANCHOR_TAG)) anchors.push(tag[1]);

    // Only where a paragraph is not already open: Markdown will not let an
    // indented block interrupt one, and a wrapped sentence is often indented.
    if (!paragraph.length && INDENTED.test(line) && !BULLET.test(line)) {
      indented = [line];
      continue;
    }

    const opens = FENCE_OPEN.exec(line);
    if (opens) {
      endParagraph();
      fence = opens[1];
      lang = line.slice(opens[0].length).trim().split(/\s+/)[0]?.replace(/^\{\.?|\}$/g, '') ?? '';
      code = [];
      continue;
    }

    const display = /^ {0,3}\$\$(.*)$/.exec(line);
    if (display) {
      endParagraph();
      const rest = display[1].trimEnd();
      if (rest.endsWith('$$') && rest.length > 2) push({ text: `$$\n${rest.slice(0, -2).trim()}\n$$` });
      else maths = rest ? [rest] : [];
      continue;
    }

    if (!line.trim()) {
      endParagraph();
      continue;
    }

    if (paragraph.length === 1 && SETEXT.test(line)) {
      const raw = paragraph[0];
      paragraph = [];
      pushHeading(raw, line.trim()[0] === '=' ? 1 : 2);
      continue;
    }

    if (RULE.test(line) || REF_DEFINITION.test(line)) {
      endParagraph();
      continue;
    }

    if (TABLE_ROW.test(line)) {
      endParagraph();
      table.push(line);
      continue;
    }

    // Each item its own paragraph, or the list runs together into one.
    const item = LIST_ITEM.exec(line);
    if (item) {
      endParagraph();
      const rest = line.slice(item[0].length).replace(/^\[ \]\s/, '☐ ').replace(/^\[[xX]\]\s/, '☑ ');
      paragraph.push(`${item[1] ? '•' : item[2]} ${rest}`);
      continue;
    }

    const heading = ATX.exec(line);
    if (heading) {
      endParagraph();
      pushHeading(heading[2], heading[1].length);
      continue;
    }

    paragraph.push(line.replace(ESCAPED, '$1$2').replace(/^\s*>\s?/, ''));
  }

  // A fence nobody closed still holds the rest of the document; it is code
  // either way, and losing it to a missing line of backticks is worse.
  if (fence !== null) endFence();
  if (maths !== null) push({ text: `$$\n${(maths as string[]).join('\n').trim()}\n$$` });
  endTable();
  endIndented();
  endParagraph();
  return { blocks, title, author };
}

export const markdownImporter: Importer = {
  id: 'markdown',
  label: 'Markdown',
  extensions: ['md', 'markdown'],
  utis: ['net.daringfireball.markdown'],
  async parse(bytes) {
    return markdownBlocks(decodeText(bytes));
  },
};
