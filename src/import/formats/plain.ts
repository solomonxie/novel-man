import type { Block, Importer } from '../types';
import { decodeText } from '../decode';

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
function clean(text: string): string {
  const parts: string[] = [];
  let cursor = 0;
  for (const span of text.matchAll(CODE_SPAN)) {
    const at = span.index ?? 0;
    parts.push(strip(text.slice(cursor, at)), span[0]);
    cursor = at + span[0].length;
  }
  parts.push(strip(text.slice(cursor)));
  return parts.join('');
}

function strip(prose: string): string {
  return prose.replace(COMMENTS, '').replace(MARKUP, '').replace(BARE, '');
}

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
  const blocks: Block[] = [];
  // What the front matter said wins: a converted book states its real title,
  // where the first heading is only the best guess available without one.
  let title: string | undefined = stated;
  let paragraph: string[] = [];
  let fence: string | null = null;
  let code: string[] = [];

  const endParagraph = () => {
    const text = clean(paragraph.join('\n')).trim();
    paragraph = [];
    if (text) blocks.push({ text });
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
    const lines = indented ?? [];
    indented = null;
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    if (!lines.length) return;
    const body = lines.map((line) => line.replace(INDENTED, '')).join('\n');
    blocks.push({ text: `\`\`\`\n${body}\n\`\`\`` });
  };

  for (const line of source.split(/\r?\n/)) {
    if (indented !== null) {
      if (INDENTED.test(line) || !line.trim()) {
        indented.push(line);
        continue;
      }
      endIndented();
    }

    if (fence !== null) {
      code.push(line);
      const closed = new RegExp(`^ {0,3}${fence[0] === '`' ? '`' : '~'}{${fence.length},}\\s*$`);
      if (closed.test(line)) {
        blocks.push({ text: code.join('\n') });
        code = [];
        fence = null;
      }
      continue;
    }

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
      code = [line];
      continue;
    }

    if (!line.trim()) {
      endParagraph();
      continue;
    }

    const heading = ATX.exec(line);
    if (heading) {
      endParagraph();
      const label = clean(heading[2]).trim();
      const level = heading[1].length;
      if (level === 1 && !title) title = label;
      if (label) blocks.push({ text: label, heading: level });
      continue;
    }

    paragraph.push(line.replace(ESCAPED, '$1$2').replace(/^\s*>\s?/, ''));
  }

  // A fence nobody closed still holds the rest of the document; it is code
  // either way, and losing it to a missing line of backticks is worse.
  if (code.length) blocks.push({ text: code.join('\n') });
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
