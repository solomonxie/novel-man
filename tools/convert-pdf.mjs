#!/usr/bin/env node
/**
 * A PDF, as an EPUB this app reads — figures and all.
 *
 * It runs here and not on the phone, and the app no longer reads PDFs at all.
 * In the app this needed pdf.js inside a hidden WebView fetched from a CDN,
 * with the whole file crossing the bridge as base64: a 35 MB book became a
 * 47 MB JavaScript string in one call. On a Mac the same book takes a couple
 * of minutes, with memory to spare and a canvas to draw on — which is the
 * thing that makes this worth doing properly.
 *
 * What it recovers that a text layer cannot:
 *
 * - **The figures.** Computer Architecture references 284 of them. It holds
 *   131 raster images and no form XObjects, so nearly every figure is vector
 *   art drawn into the page and there is nothing to extract — it is found from
 *   the drawing operators and re-rendered. See `pdf/art.mjs`.
 * - **Tables and displayed equations**, by the same route: both are laid out
 *   in two dimensions, and both come out of a text layer as a row of
 *   fragments. As pictures they are simply right.
 * - **The chapters**, from the outline the book already carries — 876 headings
 *   in that one, against a guess made from the text.
 *
 * What stays text is the prose, which is what a text layer is good at and what
 * is worth searching, highlighting and reflowing on a small screen.
 *
 *   make pdf FILE=book.pdf
 *   node tools/convert-pdf.mjs --file book.pdf [--out dir] [--pages 40-140]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { homedir } from 'node:os';

import { artOf, equationsIn, figuresOn, withText } from './pdf/art.mjs';
import { buildEpub } from './pdf/epub.mjs';

let getDocument;
let createCanvas;
try {
  ({ getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs'));
  ({ createCanvas } = await import('@napi-rs/canvas'));
} catch {
  console.error('Missing a tool dependency. Both are devDependencies, so: npm install');
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
const span = arg('pages', '');
/** Two is legible on a phone at full width without being four times the bytes. */
const SCALE = Number(arg('scale', '2'));
/**
 * WebP, which is a third of the size of the PNG for exactly the same picture:
 * the chart on page 35 is 165 KB as a PNG and 57 KB at quality 85, with every
 * label on it still readable. Over a book with 284 figures that is the
 * difference between 16 MB and 47 MB sitting in the app's storage.
 *
 * iOS has decoded WebP since 14 and this app will not install below 16.4, so
 * there is no device that takes the book and refuses the pictures. `--format
 * png` is there for a reader who finds otherwise.
 */
const FORMAT = arg('format', 'webp');
const QUALITY = Number(arg('quality', '85'));

/* ---------------------------------------------------------------- the maths */

/**
 * What the maths fonts have instead of the characters they are drawing. The
 * encoding is a Type 1 shift — the glyph for `=` sits at the code point for
 * `¼` — and the PDF carries no `ToUnicode` table to undo it, so pdf.js and
 * poppler produce identical wreckage. Applied only to text drawn in a font
 * that is one of these, which is what keeps `Politécnica` intact: `` is
 * a closing bracket in the maths font and an acute `e` in the text font.
 */
const GLYPHS = new Map([
  ['¼', '='],
  ['ð', '('],
  ['Þ', ')'],
  // In a font whose `=` glyph sits where `¼` should be, a literal `=` is the
  // division slash. Mapped in the same single pass as the rest: run as two
  // sequential replacements, `¼`→`=` then `=`→`/` turns every equals sign in
  // the book into a slash.
  ['=', '/'],
  ['', ' × '],
  ['', ' × '],
  ['', ' × '],
  ['', ' ≤ '],
  ['', ' ≥ '],
]);
const GLYPH = /[¼ðÞ=]/g;
/** Tall brackets, drawn in pieces at their own code points. Nothing to map to. */
const FRAGMENTS = /[---]/g;

const repaired = new Map();
const note = (why, n = 1) => repaired.set(why, (repaired.get(why) ?? 0) + n);

function repairMath(run) {
  const fixed = run.replace(GLYPH, (ch) => {
    note(`${JSON.stringify(ch)} → ${GLYPHS.get(ch).trim()}`);
    return GLYPHS.get(ch);
  });
  const stripped = fixed.replace(FRAGMENTS, '');
  if (stripped !== fixed) note('bracket pieces dropped');
  return stripped.replace(/ {2,}/g, ' ');
}

/**
 * A decimal point drawn as a colon, which cannot be scoped by font: the colon
 * is set in the same text font as the digits, and twenty-odd fonts here draw a
 * real one. What separates them is the line — `0:22` sits on a line that also
 * carries the maths font's glyphs, where `2:1 set associative` does not.
 */
function decimalsIn(line) {
  const found = line.match(/(\d):(\d)/g);
  if (!found) return line;
  note('decimal points', found.length);
  return line.replace(/(\d):(\d)/g, '$1.$2').replace(/(\d):(\d)/g, '$1.$2');
}

/* ---------------------------------------------------------------- the lines */

function modeOf(values, fallback) {
  if (!values.length) return fallback;
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * Lines, from pdf.js items. `hasEOL` is the file saying where one ended, which
 * beats inferring it from coordinates — and the result is sorted down the page,
 * because a content stream is a list of drawing instructions and nothing
 * obliges it to run in reading order. This book draws its running header in
 * the middle of several pages.
 */
function linesOf(items, mathFonts) {
  const lines = [];
  let parts = [];
  let top = null;
  let left = null;
  let right = null;
  let height = 10;

  const flush = () => {
    let text = '';
    let run = '';
    let hadMath = false;
    let mathChars = 0;
    for (const part of parts) {
      if (part.math) {
        hadMath = true;
        mathChars += part.text.trim().length;
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
    if (clean) lines.push({ text: clean, y: top, x: left, right, height, mathChars });
    parts = [];
    top = null;
    left = null;
    right = null;
  };

  for (const item of items) {
    if (item.str) {
      if (top === null) {
        top = Math.round(item.transform[5]);
        left = Math.round(item.transform[4]);
        height = Math.max(6, Math.round(Math.abs(item.transform[3]) || 10));
      }
      right = Math.round(item.transform[4] + (item.width ?? 0));
      parts.push({ text: item.str, math: mathFonts.has(item.fontName) });
    }
    if (item.hasEOL) flush();
  }
  flush();
  return lines.sort((a, b) => b.y - a.y || a.x - b.x);
}

/** What a running header looks like once the page number is taken out of it. */
const shapeOf = (text) => text.replace(/\d+/g, '#').trim();

/* ----------------------------------------------------------------- the book */

/**
 * pdf.js makes scratch canvases of its own while it renders, through a factory
 * that expects node-canvas. `@napi-rs/canvas` is not that: it refuses the
 * `canvas.width = 0` the stock factory does to free one, and the render dies
 * with `Failed to unwrap exclusive reference`. So it is given a factory that
 * drops the reference instead of resizing it to nothing.
 *
 * Handed to `getDocument` as a *class* under `CanvasFactory`. Passing an
 * instance under `canvasFactory` is the older spelling and 4.7 ignores it —
 * with a deprecation notice nobody sees, and the stock factory still in place.
 */
class Canvases {
  constructor() {}

  create(width, height) {
    const canvas = createCanvas(Math.max(1, width), Math.max(1, height));
    return { canvas, context: canvas.getContext('2d') };
  }

  reset(holder, width, height) {
    holder.canvas = createCanvas(Math.max(1, width), Math.max(1, height));
    holder.context = holder.canvas.getContext('2d');
  }

  destroy(holder) {
    holder.canvas = null;
    holder.context = null;
  }
}

const data = new Uint8Array(readFileSync(file));
const doc = await getDocument({ data, CanvasFactory: Canvases }).promise;
const canvasFactory = doc.canvasFactory;
const pages = doc.numPages;

let first = 1;
let last = pages;
if (span) {
  const [a, b] = span.split('-').map(Number);
  first = Math.max(1, a || 1);
  last = Math.min(pages, b || a || pages);
}

console.log(`${basename(file)} — ${pages} pages, reading ${first}–${last}\n`);

// ---- First pass: the maths fonts, and what repeats at the edges of a page.
const mathFonts = new Set();
const edgeShapes = new Map();
for (let page = first; page <= last; page++) {
  const content = await doc.getPage(page).then((p) => p.getTextContent());
  for (const item of content.items) {
    if (!item.str) continue;
    // `¼` is the tell for the shifted encoding; a control character is a tell
    // on its own, since no font setting prose ever emits one.
    if (/[¼-]/.test(item.str)) mathFonts.add(item.fontName);
  }
  const plain = linesOf(content.items, new Set());
  for (const line of [plain[0], plain[1], plain[plain.length - 2], plain[plain.length - 1]]) {
    if (!line) continue;
    const shape = shapeOf(line.text);
    if (shape.length > 3) edgeShapes.set(shape, (edgeShapes.get(shape) ?? 0) + 1);
  }
}
/**
 * Counted absolutely, not as a share of the book. Each chapter carries its own
 * running header, so one of them is on eighty of 1,527 pages — five per cent,
 * and a fifth-of-the-book threshold let every one of them through.
 */
const REPEATS = 8;
const scanned = last - first + 1;
const furniture = new Set(
  [...edgeShapes.entries()]
    .filter(([, n]) => n >= Math.min(REPEATS, Math.max(3, scanned * 0.2)))
    .map(([shape]) => shape)
);
console.log(`maths fonts: ${mathFonts.size}`);
console.log(`running headers and footers: ${furniture.size}`);

// ---- The outline, flattened to (page, height, depth, title).
const marks = [];
async function walk(entries, depth) {
  for (const entry of entries ?? []) {
    const title = (entry.title ?? '').replace(/\s+/g, ' ').trim();
    // `GR36.eps` and friends are bookmarks pointing at artwork, not sections.
    if (title && !/\.(eps|tif|tiff|jpg|png|ai)$/i.test(title)) {
      try {
        const dest =
          typeof entry.dest === 'string' ? await doc.getDestination(entry.dest) : entry.dest;
        if (Array.isArray(dest) && dest[0]) {
          marks.push({
            page: (await doc.getPageIndex(dest[0])) + 1,
            y: typeof dest[3] === 'number' ? dest[3] : null,
            depth,
            title,
          });
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
console.log(`outline entries: ${marks.length}\n`);

/** A section name is not a book name — several of these open with their preface. */
const GENERIC =
  /^(序言?|前言|目[录錄]|第[一二三四五六七八九十\d]+[部章节卷篇]|preface|foreword|introduction|contents|chapter\s|part\s)/i;

/* ---------------------------------------------------------------- the pages */

const chapters = [];
const images = new Map();
let paragraphs = 0;
let dropped = 0;
let figures = 0;
/** Pages whose art would not render, named at the end rather than swallowed. */
const unpainted = [];

/** Everything before the first outline entry still belongs somewhere. */
let current = { title: 'Front matter', blocks: [] };
const open = (title) => {
  if (current.blocks.length) chapters.push(current);
  current = { title, blocks: [] };
};

/** `[minX, minY, maxX, maxY]` in user space, cropped out of a rendered page. */
function crop(canvas, viewport, box, margin = 8) {
  const [ax, ay] = viewport.convertToViewportPoint(box[0] - margin, box[3] + margin);
  const [bx, by] = viewport.convertToViewportPoint(box[2] + margin, box[1] - margin);
  const left = Math.max(0, Math.floor(Math.min(ax, bx)));
  const top = Math.max(0, Math.floor(Math.min(ay, by)));
  const width = Math.min(canvas.width - left, Math.ceil(Math.abs(bx - ax)));
  const height = Math.min(canvas.height - top, Math.ceil(Math.abs(by - ay)));
  if (width < 24 || height < 24) return null;
  const cut = createCanvas(width, height);
  cut.getContext('2d').drawImage(canvas, left, top, width, height, 0, 0, width, height);
  return FORMAT === 'png'
    ? cut.toBuffer('image/png')
    : cut.toBuffer(`image/${FORMAT}`, QUALITY);
}

for (let page = first; page <= last; page++) {
  const sheet = await doc.getPage(page);
  const content = await sheet.getTextContent();
  const all = linesOf(content.items, mathFonts);

  // What this page draws, read before any of its text: anything inside a
  // figure belongs to the figure and must not become a paragraph of the book.
  const regions = figuresOn(await artOf(sheet), sheet.view);

  const lines = all.filter((line, at) => {
    const atEdge = at <= 1 || at >= all.length - 2;
    if (atEdge && furniture.has(shapeOf(line.text))) {
      dropped += 1;
      return false;
    }
    if (/^[\divxlc]+$/i.test(line.text)) {
      dropped += 1;
      return false;
    }
    return true;
  });

  /**
   * Where the body column starts, needed before the prose is separated out —
   * a displaced line is defined against it. The commonest left edge, not the
   * leftmost: the leftmost thing on a page is the folio in the margin.
   */
  const column = modeOf(lines.map((line) => line.x), 0);
  /**
   * Only the art is grown into the text around it, and that is the whole of
   * why: an equation band grown the same way swallows the page.
   *
   * A figure sits in whitespace, so reaching eighteen points for its axis
   * labels and its caption stops where the figure does. An equation sits
   * between two paragraphs set twelve points apart — well inside that reach —
   * so the first line of prose joined the band, and the next, and the next,
   * until a page of text had been rendered as a picture of itself. The band is
   * already exactly the lines of the equation; it needs nothing added.
   */
  const bands = equationsIn(lines, column);
  const grown = [...regions.map((region) => withText(region, lines, sheet.view, column)), ...bands];
  const inFigure = (line) =>
    grown.some(
      (box) => line.y >= box[1] && line.y <= box[3] && line.right >= box[0] && line.x <= box[2]
    );

  let rendered = null;
  if (grown.length) {
    try {
      const viewport = sheet.getViewport({ scale: SCALE });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await sheet.render({ canvasContext: canvas.getContext('2d'), viewport, canvas, canvasFactory })
        .promise;
      rendered = { canvas, viewport };
    } catch (problem) {
      // One page that will not draw is a handful of missing pictures, not a
      // lost book. A gradient fill defeats this canvas on a couple of pages
      // out of 1,527 — the prose on them is unaffected and still arrives.
      unpainted.push(page);
    }
  }

  const prose = lines.filter((line) => !inFigure(line));
  const leading = (() => {
    const gaps = [];
    for (let at = 1; at < prose.length; at++) {
      const gap = prose[at - 1].y - prose[at].y;
      if (gap > 2 && gap < 60) gaps.push(Math.round(gap));
    }
    return modeOf(gaps, 14);
  })();
  const bodyLeft = modeOf(prose.map((line) => line.x), column);
  const widest = Math.max(1, ...prose.map((line) => line.text.length));

  const here = marks.filter((mark) => mark.page === page);
  let nextMark = 0;
  let buffer = '';

  const push = () => {
    const text = buffer.replace(/\s+/g, ' ').trim();
    buffer = '';
    if (!text) return;
    const above = current.blocks[current.blocks.length - 1];
    // The outline and the page both carry a section's name, so it arrived twice.
    if (above && above.heading && above.text === text) return;
    current.blocks.push({ text });
    paragraphs += 1;
  };

  const heading = (mark) => {
    if (mark.depth === 1) open(mark.title);
    else current.blocks.push({ text: mark.title, heading: Math.min(6, mark.depth) });
  };

  /** A figure goes in where it sits on the page, among the prose. */
  const placeFiguresAbove = (y) => {
    for (const box of grown) {
      if (box.placed || box[1] < y) continue;
      box.placed = true;
      const png = rendered ? crop(rendered.canvas, rendered.viewport, box) : null;
      if (!png) continue;
      push();
      const name = `images/fig-${String(images.size + 1).padStart(4, '0')}.${FORMAT}`;
      images.set(name, png);
      // The caption names it, where one was found inside the region.
      const caption = all.find(
        (line) => /^(Figure|Table)\s+\d+[.\d]*/i.test(line.text) && line.y >= box[1] && line.y <= box[3]
      );
      current.blocks.push({ image: name, alt: caption?.text ?? '' });
      figures += 1;
    }
  };

  for (let at = 0; at < prose.length; at++) {
    const line = prose[at];
    placeFiguresAbove(line.y);

    while (nextMark < here.length && (here[nextMark].y === null || here[nextMark].y >= line.y)) {
      push();
      heading(here[nextMark]);
      nextMark += 1;
    }

    const previous = prose[at - 1];
    const gap = previous ? previous.y - line.y : 0;
    const indented = line.x > bodyLeft + 10;
    // A paragraph's last line is short and ends a sentence; a wrapped line is
    // neither, which is what tells the two apart.
    const ended =
      previous &&
      /[.?!:]["')’”]?$/.test(previous.text) &&
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
  placeFiguresAbove(-Infinity);
  while (nextMark < here.length) {
    heading(here[nextMark]);
    nextMark += 1;
  }

  if ((page - first) % 50 === 49) {
    console.log(`   ${page - first + 1} pages · ${paragraphs} paragraphs · ${figures} figures`);
  }
}
if (current.blocks.length) chapters.push(current);

/* ----------------------------------------------------------------- the file */

let title = '';
let author = '';
try {
  const info = (await doc.getMetadata())?.info ?? {};
  title = (info.Title ?? '').trim();
  author = (info.Author ?? '').trim();
} catch {
  // The file name stands in below.
}
const named = basename(file, extname(file)).replace(/[_]+/g, ' ').trim();
if (!title || GENERIC.test(title)) title = named || title;

mkdirSync(out, { recursive: true });
const stem = title.replace(/[/\\:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim() || named;
const path = join(out, `${stem}.epub`);
const epub = buildEpub({ title, author, chapters, images });
writeFileSync(path, epub);

const bytes = [...images.values()].reduce((a, b) => a + b.length, 0);
console.log(`\n${chapters.length} chapters · ${paragraphs.toLocaleString()} paragraphs`);
console.log(`${figures} figures · ${(bytes / 1024 / 1024).toFixed(1)} MB of pictures`);
console.log(`${dropped.toLocaleString()} furniture lines dropped`);
if (unpainted.length) {
  console.log(`${unpainted.length} page(s) would not draw: ${unpainted.slice(0, 12).join(', ')}` +
    (unpainted.length > 12 ? ' …' : ''));
}
if (repaired.size) {
  console.log('maths repaired:');
  for (const [why, n] of [...repaired.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`   ${String(n).padStart(6)}  ${why}`);
  }
}
console.log(`\n→ ${path}  (${(epub.length / 1024 / 1024).toFixed(1)} MB)`);
console.log('Import it through Add → From a file.');
