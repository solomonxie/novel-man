#!/usr/bin/env node
/**
 * Reading annotations out of Word, into books this app imports.
 *
 * The exports are `.doc` — binary Word 97, not the OOXML zip that `.docx` is
 * and that `src/import/formats/docx.ts` reads. A parser for the old format is
 * thousands of lines of structured-storage archaeology and would sit in the
 * app's bundle for ever to serve one migration, so the conversion happens here
 * instead, on a Mac, once. `textutil` ships with macOS and already reads it.
 *
 * What the highlights actually are, in these files: a character style. The
 * annotated copies mark kept passages with `span.s1 { text-decoration:
 * underline; color: #ff0000 }` — underlined and red. Nothing about that is
 * guessed; the stylesheet is in the file and is read rather than assumed, so a
 * copy that used a different colour still works.
 *
 * Out comes Markdown with front matter and the kept passages wrapped in
 * `==…==`, which is the one piece of inline syntax this app's reader draws as
 * a highlight. So the book imports through the ordinary Markdown path — no new
 * importer, no bundle to restore, nothing that can touch a book already on the
 * shelf — and the passages are marked the moment it opens. The sidecar JSON
 * beside each book carries the same passages with the text either side of
 * them, which is what `src/reader/anchor.ts` needs to place a real annotation
 * row later.
 *
 *   node tools/convert-annotations.mjs [--from <dir>] [--out <dir>] [--limit n]
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { homedir } from 'node:os';

const DEFAULT_FROM = join(homedir(), 'Downloads', 'life-logs', 'blobs', 'Book Annotations');
const DEFAULT_OUT = join(homedir(), 'Downloads', 'novel-man-books');
/** Half a line either side, the same window the app's re-anchoring uses. */
const CONTEXT = 40;
/**
 * Shorter than this and it is not a passage somebody kept. The link text of a
 * cross-reference is a bare numeral, and those were arriving as highlights —
 * 484 of them in one book, most of which were `4` and `5`.
 */
const SHORTEST_MARK = 4;
/** A name and a nationality. Anything longer is the back cover. */
const LONGEST_AUTHOR = 40;
/**
 * How many paragraphs in the title page can possibly be. Several of these
 * documents have no heading above body size anywhere, so "before the first
 * heading" is the whole book — and the author became `（本章完）` or `(附注)`,
 * whichever bracketed aside happened to come first.
 */
const TITLE_PAGE = 6;

function arg(name, fallback) {
  const at = process.argv.indexOf(`--${name}`);
  return at > 0 && process.argv[at + 1] ? process.argv[at + 1] : fallback;
}

const from = arg('from', DEFAULT_FROM);
const out = arg('out', DEFAULT_OUT);
const limit = Number(arg('limit', '0')) || Infinity;

/** Every `.doc` under the export, wherever the folders put it. */
function docsUnder(dir) {
  const found = [];
  const walk = (at) => {
    let entries;
    try {
      entries = readdirSync(at, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const path = join(at, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/^\.docx?$/i.test(extname(entry.name))) found.push(path);
    }
  };
  walk(dir);
  return found.sort();
}

const decode = (value) =>
  value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');

/**
 * Word field codes, which `textutil` renders as text because that is what they
 * are in the file. 联邦党人文集 was built from a CHM and carries a HYPERLINK
 * field at every cross-reference, so without this the book reads
 * `HYPERLINK "mk:@MSITStore:e:E:\\2006年春季备课本\\…"` between its sentences.
 */
const FIELD_CODE = /\s*HYPERLINK\s+"[^"]*"\s*/g;

const strip = (html) =>
  decode(html.replace(/<[^>]+>/g, ''))
    .replace(FIELD_CODE, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * The stylesheet, read rather than assumed.
 *
 * A paragraph's role is its font size: the largest is the title, anything
 * above the commonest size is a heading, and the commonest size is the body.
 * That holds across all of these files without a per-file rule, because they
 * were all made by the same export.
 */
function stylesOf(html) {
  const style = /<style[^>]*>([\s\S]*?)<\/style>/i.exec(html)?.[1] ?? '';
  const paragraphs = new Map();
  const marks = new Set();
  for (const rule of style.matchAll(/(p|span)\.([\w-]+)\s*\{([^}]*)\}/g)) {
    const [, tag, name, body] = rule;
    if (tag === 'p') {
      paragraphs.set(name, Number(/font:\s*([\d.]+)px/.exec(body)?.[1] ?? 0));
      continue;
    }
    // Underlined, or coloured anything but black. Either is somebody marking
    // a passage; neither happens by accident in an export like this.
    const coloured = /color:\s*#([0-9a-f]{6})/i.exec(body)?.[1]?.toLowerCase();
    if (/text-decoration:\s*[^;]*underline/i.test(body) || (coloured && coloured !== '000000')) {
      marks.add(name);
    }
  }
  const sizes = [...paragraphs.values()].filter(Boolean);
  const body = sizes.length ? mode(sizes) : 0;
  return { paragraphs, marks, body, biggest: sizes.length ? Math.max(...sizes) : 0 };
}

function mode(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * `《自卑与超越》` is a title in Chinese typography and the brackets are not part
 * of it. Taken out wherever they sit, not only at the ends: half these files
 * are named `失控》凯文·凯利`, with the opening bracket already lost somewhere
 * upstream of here.
 */
const titleOf = (text) => text.replace(/[《》〈〉「」【】]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * A section name is not a book name. Several of these documents open with
 * their preface at title size and nothing above it, so the largest text on the
 * page is `序言` — and a shelf with three books called `Preface` on it is
 * worse than one that fell back to the file name.
 */
const GENERIC = /^(序言?|前言|引言|目[录錄]|导[读論]|绪论|第[一二三四五六七八九十\d]+[部章节卷篇]|preface|foreword|introduction|contents|chapter\s|part\s)/i;

function convert(path) {
  const html = execFileSync('textutil', ['-convert', 'html', '-stdout', path], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  const styles = stylesOf(html);

  let title = '';
  let author = '';
  const lines = [];
  /** Every kept passage, in order, with where it landed in the output. */
  const marked = [];
  let chapter = '';
  /**
   * The author is on the title page or nowhere. Looked for only before the
   * first heading, because `（２５８－２５９页）` and `（本章完）` and `（杰伊）`
   * are bracketed short lines too, and taken from the whole document the
   * author of a book became whichever page marker came first.
   */
  let titlePage = TITLE_PAGE;

  for (const found of html.matchAll(/<p class="([\w-]+)"[^>]*>([\s\S]*?)<\/p>/g)) {
    const [, cls, inner] = found;
    const text = strip(inner);
    if (!text) continue;
    const size = styles.paragraphs.get(cls) ?? styles.body;

    if (!title && size === styles.biggest && size > styles.body) {
      title = titleOf(text);
      continue;
    }
    // Centred small text under the title: the subtitle, then the author. The
    // bracketed nationality is how a Chinese edition prints one.
    //
    // The length test is the whole of it. `[英]亚当·斯密所著的《国富论》，全名
    // 为…` is four hundred characters of blurb that begins exactly like an
    // author line, and without a ceiling it became the author of the book.
    if (
      !author &&
      titlePage > 0 &&
      text.length <= LONGEST_AUTHOR &&
      /^[【\[(（].{1,12}[】\])）]/.test(text) &&
      // An aside, not a name: a page reference, or a clause left hanging.
      !/[：;；]$/.test(text) &&
      !/[页頁]/.test(text)
    ) {
      author = text;
      continue;
    }
    titlePage -= 1;
    if (size > styles.body) {
      titlePage = 0;
      chapter = text;
      lines.push('', `# ${text}`, '');
      continue;
    }

    // The marks inside this paragraph, wrapped where they sit. Done on the
    // markup rather than the stripped text so the offsets cannot drift.
    const pieces = [];
    let cursor = 0;
    for (const span of inner.matchAll(/<span class="([\w-]+)"[^>]*>([\s\S]*?)<\/span>/g)) {
      const at = span.index ?? 0;
      pieces.push(strip(inner.slice(cursor, at)));
      const quote = strip(span[2]);
      if (styles.marks.has(span[1]) && quote.length >= SHORTEST_MARK) {
        pieces.push(`==${quote}==`);
        marked.push({ quote, chapter });
      } else {
        pieces.push(quote);
      }
      cursor = at + span[0].length;
    }
    pieces.push(strip(inner.slice(cursor)));
    const paragraph = pieces.filter(Boolean).join('').replace(/\s+/g, ' ').trim();
    if (paragraph) lines.push(paragraph, '');
  }

  const named = titleOf(basename(path, extname(path)));
  // The file name is the better answer whenever the document's own largest
  // text is a section heading rather than a title.
  if (!title || GENERIC.test(title)) title = named || title;

  const front = ['---', `title: ${title}`, author ? `author: ${author}` : null, '---', '']
    .filter((one) => one !== null)
    .join('\n');
  const markdown = `${front}${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;

  // The passage plus the text either side of it, so a later step can place a
  // real annotation row even after the chapters have been re-split.
  const plain = markdown.replace(/==/g, '');
  const annotations = marked.map(({ quote, chapter: where }) => {
    const at = plain.indexOf(quote);
    return {
      quote,
      chapter: where,
      prefix: at < 0 ? '' : plain.slice(Math.max(0, at - CONTEXT), at),
      suffix: at < 0 ? '' : plain.slice(at + quote.length, at + quote.length + CONTEXT),
    };
  });

  return { title, author, markdown, annotations };
}

mkdirSync(out, { recursive: true });

let docs;
try {
  statSync(from);
  docs = docsUnder(from);
} catch {
  console.error(`No such folder: ${from}`);
  process.exit(1);
}

if (!docs.length) {
  console.error(`No .doc files under ${from}`);
  process.exit(1);
}

console.log(`${docs.length} document${docs.length === 1 ? '' : 's'} under ${from}\n`);

const failures = [];
/**
 * The same book is in this export up to four times — under `Screenshot`, under
 * `阅读批注/Screenshot`, and as an annotated copy in each of the two
 * `Word批注版` folders. Converting all of them would put four of every book on
 * the shelf, so they are grouped by title and the best copy wins: the one
 * carrying the most highlights, and the annotated folder to break a tie.
 */
const byTitle = new Map();

for (const path of docs.slice(0, limit)) {
  try {
    const converted = convert(path);
    const annotated = path.includes('批注版');
    const existing = byTitle.get(converted.title);
    const better =
      !existing ||
      converted.annotations.length > existing.annotations.length ||
      (converted.annotations.length === existing.annotations.length &&
        annotated &&
        !existing.annotated) ||
      (converted.annotations.length === existing.annotations.length &&
        annotated === existing.annotated &&
        converted.markdown.length > existing.markdown.length);
    if (better) byTitle.set(converted.title, { ...converted, path, annotated });
  } catch (problem) {
    failures.push(basename(path));
    console.log(`  FAIL ${basename(path)} — ${problem instanceof Error ? problem.message : problem}`);
  }
}

let books = 0;
let highlights = 0;

for (const [title, book] of [...byTitle.entries()].sort()) {
  // One name for both files, and one a file system will accept.
  const stem = title.replace(/[/\\:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim() || basename(book.path);
  writeFileSync(join(out, `${stem}.md`), book.markdown);
  if (book.annotations.length) {
    writeFileSync(join(out, `${stem}.annotations.json`), `${JSON.stringify(book.annotations, null, 1)}\n`);
  }
  books += 1;
  highlights += book.annotations.length;
  console.log(
    `  ok   ${stem}${book.author ? ` · ${book.author}` : ''} — ` +
      `${book.markdown.length.toLocaleString()} chars, ${book.annotations.length} highlights`
  );
}

console.log(
  `\n${books} book${books === 1 ? '' : 's'}, ${highlights} highlights → ${out}` +
    (failures.length ? `\n${failures.length} failed: ${failures.join(', ')}` : '')
);
console.log(
  '\nImport the .md files through Add → From a file. A book not on the shelf is\n' +
    'added; the highlights are already marked in the text.'
);
process.exit(failures.length ? 1 : 0);
