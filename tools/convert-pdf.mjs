#!/usr/bin/env node
/**
 * A PDF textbook, as Markdown this app imports.
 *
 * Why here and not in the app: the app hands PDFs to pdf.js inside a hidden
 * WebView, as base64 over `injectJavaScript`. A 35 MB book becomes a 47 MB
 * JavaScript string in one bridge call, which is a phone running out of memory
 * rather than a book arriving. On a Mac the same work takes seconds.
 *
 * What it does that the in-app path does not:
 *
 * - **Reads the outline.** A real textbook ships one — 1,025 entries in
 *   Computer Architecture — and it is a table of contents somebody wrote,
 *   where `detectChapters` guessing from text is a table of contents nobody
 *   did. Placed by page *and* by height on the page, so a section starting
 *   half way down lands in the right place.
 * - **Drops the furniture.** `28 ■ Chapter One Fundamentals of Quantitative
 *   Design and Analysis` is on every page and is not a paragraph of the book.
 *   Found by what repeats, not by a rule about this book.
 * - **Rebuilds paragraphs from the page's own leading** instead of a fixed
 *   22-point gap. On this book the fixed rule gave 38 blocks a page where
 *   there are five paragraphs, and 37% of them were under forty characters.
 * - **Repairs the maths font**, as far as that is possible. See `REPAIRS`.
 *
 * What it cannot do, and no extractor can: a PDF's text layer has no second
 * dimension. A stacked fraction, a matrix, a summation with limits above and
 * below — all of it arrives as a row of characters in reading order, and the
 * structure that made it an equation is not in the file to recover. Expect the
 * prose to be excellent and the displayed equations to be approximations.
 *
 *   node tools/convert-pdf.mjs --file <book.pdf> [--out <dir>] [--pages 40-140]
 *   node tools/convert-pdf.mjs --file <book.pdf> --sample 84
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { homedir } from 'node:os';
let getDocument;
try {
  ({ getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs'));
} catch {
  console.error(
    'pdfjs-dist is missing. It is a devDependency, so: npm install\n' +
      '(It is not in the app bundle — this runs on your Mac.)'
  );
  process.exit(1);
}

function arg(name, fallback) {
  const at = process.argv.indexOf(`--${name}`);
  return at > 0 && process.argv[at + 1] && !process.argv[at + 1].startsWith('--')
    ? process.argv[at + 1]
    : fallback;
}

const file = arg('file');
if (!file) {
  console.error('Which book? --file <book.pdf>');
  process.exit(1);
}
const out = arg('out', join(homedir(), 'Downloads', 'novel-man-books'));
const sample = Number(arg('sample', '0')) || 0;
const span = arg('pages', '');

/**
 * What the maths fonts in these books have instead of the characters they are
 * drawing. The encoding is a Type 1 shift — the font's glyph for `=` sits at
 * the code point for `¼`, and so on down — and the PDF carries no `ToUnicode`
 * table to undo it, so every extractor produces the same wreckage. pdf.js and
 * poppler agree character for character, which is how we know it is the file.
 *
 * Applied **only to text drawn in a font that is one of these**, which is the
 * whole reason it is safe: `` is a closing bracket in the maths font and
 * an acute `e` in the text font, and `Politécnica` must survive. A font counts
 * as a maths font if it uses `¼` anywhere in the book — nothing else does.
 *
 * The three multiplication signs are three different fonts' versions of the
 * same glyph; all 214 sampled occurrences sit between two quantities.
 */
const GLYPHS = new Map([
  ['\u00bc', '='],
  ['\u00f0', '('],
  ['\u00de', ')'],
  // In a font whose `=` glyph sits where `¼` should be, a literal `=` is the
  // division slash. Mapped in the same single pass as the rest, which matters:
  // run as two sequential replacements, `¼`→`=` followed by `=`→`/` turns
  // every equals sign in the book into a slash.
  ['=', '/'],
  // Three fonts' versions of the same glyph. Every sampled occurrence sits
  // between two quantities.
  ['\u0001', ' \u00d7 '],
  ['\u0002', ' \u00d7 '],
  ['\u0003', ' \u00d7 '],
  ['\u0014', ' \u2264 '],
  ['\u0015', ' \u2265 '],
]);

const GLYPH = /[\u00bc\u00f0\u00de=\u0001\u0002\u0003\u0014\u0015]/g;

/**
 * The tall brackets, which a PDF draws in pieces — a top, a middle, a bottom —
 * each at its own code point. There is nothing to map them to in one line of
 * text, and leaving them in puts a control character in the book, so they go.
 */
const FRAGMENTS = /[\u0004-\u0008\u000b\u000c\u000e-\u0013\u0016-\u001f]/g;

const repaired = new Map();
const note = (why, n = 1) => repaired.set(why, (repaired.get(why) ?? 0) + n);

/**
 * One maths run, repaired.
 *
 * Done to the whole run rather than to each of pdf.js's items, because the
 * items are split wherever the typesetter moved the pen: `0.22` arrives as
 * `0` and `:22`, and a rule that wants a digit either side of the colon can
 * never see one if it is shown the two halves separately.
 */
function repairMath(run) {
  let fixed = run.replace(GLYPH, (ch) => {
    note(`${JSON.stringify(ch)} \u2192 ${GLYPHS.get(ch).trim()}`);
    return GLYPHS.get(ch);
  });
  const stripped = fixed.replace(FRAGMENTS, '');
  if (stripped !== fixed) note('bracket pieces dropped');
  return stripped.replace(/ {2,}/g, ' ');
}

const data = new Uint8Array(readFileSync(file));
const doc = await getDocument({ data }).promise;
const pages = doc.numPages;

let first = 1;
let last = pages;
if (span) {
  const [a, b] = span.split('-').map(Number);
  first = Math.max(1, a || 1);
  last = Math.min(pages, b || a || pages);
}
if (sample) {
  first = sample;
  last = sample;
}
/**
 * What the first pass reads, which for a real run is everything.
 *
 * It has to be everything. This book embeds 98 fonts because each chapter
 * carries its own subset, so a maths font learned from chapter one is not the
 * maths font chapter nine uses — and capping the scan at 400 pages found a
 * quarter of the broken equals signs and left the rest in the book. Reading
 * all 1,527 pages twice costs about four seconds.
 *
 * A sample is one page, but still needs a window around it: what repeats on
 * every page cannot be seen on one.
 */
const learnFrom = sample ? Math.max(1, sample - 60) : first;
const learnTo = sample ? Math.min(pages, learnFrom + 120) : last;

console.log(`${basename(file)} — ${pages} pages, reading ${first}–${last}\n`);

/**
 * A decimal point drawn as a colon.
 *
 * This one cannot be scoped by font. The colon is set in an ordinary text
 * font — the same font as the digits around it — so there is no maths font to
 * key off, and twenty-odd fonts in this book draw a legitimate colon.
 *
 * What does separate them is the line. `0:22` appears on lines that also
 * carry the maths font's own glyphs; a real ratio like `2:1 set associative`
 * appears in prose that carries none. So the fix is applied to a line only
 * when something else on that line was already repaired as maths, and the
 * audit below prints what it touched.
 */
function decimalsIn(line) {
  const found = line.match(/(\d):(\d)/g);
  if (!found) return line;
  note('decimal points', found.length);
  // Twice: `1:2:3` overlaps, and one pass catches only alternate colons.
  return line.replace(/(\d):(\d)/g, '$1.$2').replace(/(\d):(\d)/g, '$1.$2');
}

/**
 * Lines, from pdf.js items. `hasEOL` is the file saying where a line ended,
 * which beats inferring it from coordinates.
 *
 * Prose and maths are gathered separately and each maths run is repaired as a
 * run — see `repairMath`. A line that mixes the two keeps both: the sentence
 * around an inline formula is prose and must not be touched.
 */
function linesOf(items, mathFonts) {
  const lines = [];
  let parts = [];
  let top = null;
  let left = null;

  const flush = () => {
    let text = '';
    let run = '';
    let hadMath = false;
    for (const part of parts) {
      if (part.math) {
        hadMath = true;
        run += part.text;
        continue;
      }
      if (run) {
        text += repairMath(run);
        run = '';
      }
      text += part.text;
    }
    if (run) text += repairMath(run);
    const clean = (hadMath ? decimalsIn(text) : text).replace(/\s+/g, ' ').trim();
    if (clean) lines.push({ text: clean, y: top, x: left, math: hadMath });
    parts = [];
    top = null;
    left = null;
  };

  for (const item of items) {
    if (item.str) {
      if (top === null) {
        top = Math.round(item.transform[5]);
        left = Math.round(item.transform[4]);
      }
      parts.push({ text: item.str, math: mathFonts.has(item.fontName) });
    }
    if (item.hasEOL) flush();
  }
  flush();
  /**
   * Into reading order, which is not the order the file draws in.
   *
   * A PDF's content stream is a sequence of drawing instructions, and nothing
   * obliges it to run down the page: this book draws the running header in
   * the *middle* of several pages. Read in file order that header turned up
   * spliced into the middle of a sentence, and "the first two lines" was not
   * the top of the page, so the header was never recognised as furniture.
   *
   * Down the page, then across it. Right for a single column, which the body
   * of this book is; a genuinely two-column page interleaves either way and
   * is beyond what a text layer can be asked for.
   */
  return lines.sort((a, b) => b.y - a.y || a.x - b.x);
}

/** The commonest value, which is what "the body" means for both of these. */
function modeOf(values, fallback) {
  if (!values.length) return fallback;
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/** The commonest gap between one line and the next — the page's own leading. */
function leadingOf(lines) {
  const gaps = [];
  for (let at = 1; at < lines.length; at++) {
    const gap = lines[at - 1].y - lines[at].y;
    if (gap > 2 && gap < 60) gaps.push(Math.round(gap));
  }
  return modeOf(gaps, 14);
}

/** What a running header looks like once the page number is taken out of it. */
const shapeOf = (text) => text.replace(/\d+/g, '#').trim();

// ---- First pass: which fonts are maths, and what repeats at the page edges.
const mathFonts = new Set();
const edgeShapes = new Map();
const scanned = learnTo;
for (let page = learnFrom; page <= scanned; page++) {
  const content = await doc.getPage(page).then((p) => p.getTextContent());
  for (const item of content.items) {
    if (!item.str) continue;
    // `¼` is the tell for the shifted maths encoding, and a control character
    // is a tell on its own: no font setting prose ever emits one. Keying on
    // `¼` alone missed the symbol fonts that draw only operators, and left a
    // couple of hundred control characters in the finished book.
    if (/[¼\u0001-\u001f]/.test(item.str)) mathFonts.add(item.fontName);
  }
  const plain = linesOf(content.items, new Set());
  // Two lines at each edge, not one. A verso and a recto carry the header in
  // different orders, and a page that opens with a figure caption pushes the
  // header down a line — both of which left the header in the book.
  for (const line of [plain[0], plain[1], plain[plain.length - 2], plain[plain.length - 1]]) {
    if (!line) continue;
    const shape = shapeOf(line.text);
    if (shape.length > 3) edgeShapes.set(shape, (edgeShapes.get(shape) ?? 0) + 1);
  }
}
const pagesScanned = scanned - learnFrom + 1;
/**
 * Furniture: the same line, at the same edge of the page, over and over.
 *
 * Counted absolutely rather than as a share of the book, which is what went
 * wrong first: each chapter carries its own running header, so `Chapter One
 * Fundamentals of Quantitative Design and Analysis` is on eighty of this
 * book's 1,527 pages — five per cent, and a fifth-of-the-book threshold let
 * every one of them through. Eight is far below any chapter's page count and
 * far above anything a real paragraph does: prose does not repeat itself
 * verbatim, page-number aside, eight times at the edge of a page.
 */
const REPEATS = 8;
const furniture = new Set(
  [...edgeShapes.entries()]
    .filter(([, n]) => n >= Math.min(REPEATS, Math.max(3, pagesScanned * 0.2)))
    .map(([shape]) => shape)
);
console.log(`maths fonts: ${mathFonts.size}`);
console.log(`running headers and footers found: ${furniture.size}`);
for (const shape of [...furniture].slice(0, 4)) console.log(`   "${shape.slice(0, 70)}"`);

// ---- The outline, flattened to (page, height, depth, title).
function destOf(dest) {
  return typeof dest === 'string' ? doc.getDestination(dest) : Promise.resolve(dest);
}
const marks = [];
async function walk(entries, depth) {
  for (const entry of entries ?? []) {
    const title = (entry.title ?? '').replace(/\s+/g, ' ').trim();
    // `GR36.eps` and friends are bookmarks pointing at artwork, not sections.
    const art = /\.(eps|tif|tiff|jpg|png|ai)$/i.test(title);
    if (title && !art) {
      try {
        const dest = await destOf(entry.dest);
        if (Array.isArray(dest) && dest[0]) {
          const page = (await doc.getPageIndex(dest[0])) + 1;
          const y = typeof dest[3] === 'number' ? dest[3] : null;
          marks.push({ page, y, depth, title });
        }
      } catch {
        // A bookmark that will not resolve is one heading, not a failure.
      }
    }
    await walk(entry.items, depth + 1);
  }
}
await walk(await doc.getOutline(), 1);
marks.sort((a, b) => a.page - b.page || (b.y ?? 0) - (a.y ?? 0));
console.log(`outline entries used: ${marks.length}\n`);

// ---- Second pass: the book.
const chunks = [];
let paragraphs = 0;
let dropped = 0;
let title = '';
let author = '';

for (let page = first; page <= last; page++) {
  const content = await doc.getPage(page).then((p) => p.getTextContent());
  const all = linesOf(content.items, mathFonts);
  const lines = all.filter((line, at) => {
    const atEdge = at <= 1 || at >= all.length - 2;
    if (atEdge && furniture.has(shapeOf(line.text))) {
      dropped += 1;
      return false;
    }
    // A page number on its own.
    if (/^[\divxlc]+$/i.test(line.text)) {
      dropped += 1;
      return false;
    }
    return true;
  });
  if (!lines.length) continue;

  const leading = leadingOf(lines);
  /**
   * Where the body column starts — the commonest left edge, not the leftmost.
   * The leftmost thing on the page is the page number out in the margin, and
   * measuring the indent against that made every line on the page look
   * indented, so every line became its own paragraph.
   */
  const bodyLeft = modeOf(lines.map((line) => line.x), 0);
  const widest = Math.max(...lines.map((line) => line.text.length));

  /** Headings that belong on this page, deepest-last so order is stable. */
  const here = marks.filter((mark) => mark.page === page);
  let nextMark = 0;

  let buffer = '';
  const push = () => {
    const text = buffer.replace(/\s+/g, ' ').trim();
    buffer = '';
    if (!text) return;
    // The outline and the page both carry the section's name, so it arrived
    // twice: once as the heading, once as the first line under it.
    const above = chunks[chunks.length - 1];
    if (above && above.startsWith('#') && above.replace(/^#+\s*/, '') === text) return;
    // A paragraph that opens with a hash is a comment out of a code listing,
    // not a heading. Escaped the way Markdown escapes it.
    chunks.push(text.replace(/^(#+)/, '\\$1'));
    paragraphs += 1;
  };

  for (let at = 0; at < lines.length; at++) {
    const line = lines[at];

    // A section starts here if the outline says so at or above this line.
    while (nextMark < here.length && (here[nextMark].y === null || here[nextMark].y >= line.y)) {
      push();
      const mark = here[nextMark];
      chunks.push(`${'#'.repeat(Math.min(6, mark.depth))} ${mark.title}`);
      nextMark += 1;
    }

    const previous = lines[at - 1];
    const gap = previous ? previous.y - line.y : 0;
    const indented = line.x > bodyLeft + 10;
    // A paragraph's last line is short and ends a sentence; the next line
    // starting a new one is what a wrapped line never does.
    const ended = previous && /[.?!:]["')’”]?$/.test(previous.text) &&
      previous.text.length < widest * 0.88;
    if (buffer && (gap > leading * 1.7 || indented || ended)) push();

    if (buffer) {
      // A line broken mid-word: the hyphen is the break, not the word.
      if (/[a-zà-ÿ]-$/.test(buffer) && /^[a-z]/.test(line.text)) {
        buffer = `${buffer.slice(0, -1)}${line.text}`;
      } else {
        buffer += ` ${line.text}`;
      }
    } else {
      buffer = line.text;
    }
  }
  push();
  while (nextMark < here.length) {
    chunks.push(`${'#'.repeat(Math.min(6, here[nextMark].depth))} ${here[nextMark].title}`);
    nextMark += 1;
  }

  if (!sample && (page - first) % 100 === 99) {
    console.log(`   ${page - first + 1} pages, ${paragraphs} paragraphs`);
  }
}

// The metadata the file carries, which is better than its name.
try {
  const info = (await doc.getMetadata())?.info ?? {};
  title = (info.Title ?? '').trim();
  author = (info.Author ?? '').trim();
} catch {
  // Nothing: the file name stands in below.
}
if (!title) title = basename(file, extname(file)).replace(/[_]+/g, ' ').trim();

if (sample) {
  console.log(`\n=== page ${sample}, as the book would read ===\n`);
  console.log(chunks.join('\n\n'));
  process.exit(0);
}

const front = ['---', `title: ${title}`, author ? `author: ${author}` : null, '---', '']
  .filter((one) => one !== null)
  .join('\n');
const markdown = `${front}${chunks.join('\n\n')}\n`;

mkdirSync(out, { recursive: true });
const stem = title.replace(/[/\\:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
const path = join(out, `${stem}.md`);
writeFileSync(path, markdown);

console.log(`\n${paragraphs.toLocaleString()} paragraphs, ${markdown.length.toLocaleString()} characters`);
console.log(`${chunks.filter((c) => c.startsWith('#')).length.toLocaleString()} headings`);
console.log(`${dropped.toLocaleString()} furniture lines dropped`);
if (repaired.size) {
  console.log('maths repaired:');
  for (const [why, n] of [...repaired.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`   ${String(n).padStart(6)}  ${why}`);
  }
}
console.log(`\n→ ${path}`);
console.log('Import it through Add → From a file.');
