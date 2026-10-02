import { OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';

/**
 * Finding the figures in a page, from what the page draws rather than from
 * what it says.
 *
 * The text layer cannot describe a chart, and the obvious alternative — pull
 * the embedded images out — does not work on a book like this: Computer
 * Architecture references 284 figures and contains 131 raster images and no
 * form XObjects at all. Nearly every figure is vector art, drawn straight into
 * the page with path and fill operators. There is nothing to extract. It has
 * to be re-rendered.
 *
 * So the art is located by walking the operator list. A page of prose draws
 * nothing — pages 49 and 52 of that book have zero `constructPath`, `fill` and
 * `stroke` between them — and a page with a figure draws constantly: page 35
 * has 79 paths, 41 fills and 37 strokes. That is a clean signal with no text
 * heuristic in it, and it finds a rotated full-page chart exactly as readily
 * as an inline diagram.
 */

/** [a, b, c, d, e, f] — the PDF's own 3x2 matrix, same order as `transform`. */
const UNIT = [1, 0, 0, 1, 0, 0];

function multiply(m, n) {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

function apply(m, x, y) {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** A box in user space, through a matrix, as a box again — all four corners,
 *  because a rotation turns a rectangle into a diamond and back. */
function through(m, [x0, y0, x1, y1]) {
  const corners = [apply(m, x0, y0), apply(m, x1, y0), apply(m, x0, y1), apply(m, x1, y1)];
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/**
 * Marks too small to be a figure: the rule under a heading, the stem of a
 * letter drawn as a path, the hairline of a table. Kept out so a page of prose
 * with one underline on it is not called an illustration.
 */
const THINNEST = 10;

/** Painted areas on one page, in PDF user space. */
export async function artOf(page) {
  const list = await page.getOperatorList();
  const boxes = [];
  let ctm = UNIT;
  const stack = [];

  for (let at = 0; at < list.fnArray.length; at++) {
    const fn = list.fnArray[at];
    const args = list.argsArray[at];
    if (fn === OPS.save) {
      stack.push(ctm);
    } else if (fn === OPS.restore) {
      ctm = stack.pop() ?? UNIT;
    } else if (fn === OPS.transform) {
      ctm = multiply(ctm, args);
    } else if (fn === OPS.constructPath) {
      // pdf.js hands the path's own bounding box as the third argument, which
      // saves walking every curve in it.
      const bounds = args[2];
      if (bounds && bounds.length === 4) boxes.push(through(ctm, Array.from(bounds)));
    } else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject) {
      // An image is drawn into the unit square and placed by the matrix.
      boxes.push(through(ctm, [0, 0, 1, 1]));
    }
  }

  return boxes.filter((b) => b[2] - b[0] >= THINNEST && b[3] - b[1] >= THINNEST);
}

/** Does one box touch another, allowing for a gap of `near` between them? */
function touches(a, b, near) {
  return (
    a[0] - near <= b[2] && b[0] - near <= a[2] && a[1] - near <= b[3] && b[1] - near <= a[3]
  );
}

function union(a, b) {
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
}

/**
 * Marks that belong to one picture, gathered into one picture.
 *
 * A chart is hundreds of separate paths — every gridline, every bar, every
 * tick — and the gaps between them are the gaps inside a drawing. Anything
 * within `near` points of the growing region joins it, repeatedly, until
 * nothing else is close enough.
 */
export function clusters(boxes, near = 14) {
  const left = [...boxes];
  const found = [];
  while (left.length) {
    let region = left.pop();
    let grew = true;
    while (grew) {
      grew = false;
      for (let at = left.length - 1; at >= 0; at--) {
        if (touches(region, left[at], near)) {
          region = union(region, left[at]);
          left.splice(at, 1);
          grew = true;
        }
      }
    }
    found.push(region);
  }
  return found;
}

/**
 * What a figure has to be worth before it is one.
 *
 * Small clusters are the furniture of a page rather than its illustrations: a
 * logo, a bullet drawn as a circle, the box around a sidebar. The test is area
 * against the page, because a wide short banner and a tall thin chart are both
 * real and neither is caught by a width or a height alone.
 */
const SMALLEST_SHARE = 0.012;

/**
 * A banner is not a figure.
 *
 * Every section heading in this book sits on a shaded bar — a filled rectangle
 * the width of the column and twenty points tall. It is drawn, so it clusters,
 * so it was a figure; and being a figure it grew into the text around it until
 * a whole page of prose had been rendered as a picture of itself. A rule under
 * a heading and a table's ruled edge are the same shape and the same mistake.
 *
 * Charts are not this shape. Nothing with a vertical axis is six times wider
 * than it is tall *and* shorter than two lines of type.
 */
function isBanner(box) {
  const width = box[2] - box[0];
  const height = box[3] - box[1];
  return height < 40 && width > height * 6;
}

export function figuresOn(boxes, view, near = 14) {
  const pageArea = (view[2] - view[0]) * (view[3] - view[1]);
  return clusters(boxes, near)
    .filter((b) => {
      const area = (b[2] - b[0]) * (b[3] - b[1]);
      // Not the whole page either: a full-bleed background rectangle is not a
      // figure, it is the paper.
      return area >= pageArea * SMALLEST_SHARE && area <= pageArea * 0.97 && !isBanner(b);
    })
    .sort((a, b) => b[3] - a[3]);
}

/**
 * Grown to take in the labels and the caption that belong to it — and no
 * further.
 *
 * The ceiling is the point. Growing by eighteen points at a time through a
 * column of text set twelve points apart never stops: the line below joins,
 * then the line below that, and the region walks off the bottom of the page
 * taking the chapter with it. A figure with its labels and its caption is a
 * part of a page; past `MOST` of one it has stopped being a figure and started
 * being the page, and whatever it has absorbed is prose that belongs in the
 * book as words.
 */
const MOST = 0.62;

export function withText(region, lines, view, bodyLeft, near = 18) {
  const ceiling = view ? (view[2] - view[0]) * (view[3] - view[1]) * MOST : Infinity;
  let grown = region;
  let grew = true;
  while (grew) {
    grew = false;
    for (const line of lines) {
      if (line.taken) continue;
      /**
       * A line that begins where every other line of the page begins is the
       * body of the book, not part of the picture. Axis labels, legends and
       * tick marks are placed by the drawing and start nowhere in particular;
       * prose starts in the column.
       *
       * This keeps the paragraph above a chart out of the chart — and keeps
       * the caption as a paragraph, which is the better place for it: a
       * caption is worth searching, and the picture still carries it as alt
       * text for anyone who cannot see the picture.
       */
      if (bodyLeft !== undefined && Math.abs(line.x - bodyLeft) <= 4) continue;
      const box = [line.x, line.y - 2, line.right, line.y + line.height];
      if (!touches(grown, box, near)) continue;
      const next = union(grown, box);
      if ((next[2] - next[0]) * (next[3] - next[1]) > ceiling) continue;
      grown = next;
      line.taken = true;
      grew = true;
    }
  }
  return grown;
}

/**
 * Displayed equations, which the drawing operators cannot find.
 *
 * An equation is not drawn — it is text set in a maths font, laid out in two
 * dimensions, with at most a rule or two for the fraction bars. The page that
 * carries the reliability equation in Computer Architecture has twelve drawing
 * operations on it, far too few and too scattered to cluster into a figure,
 * and the equation itself arrives as five fragments:
 *
 *     Improvement power supply pair = 1   |  = 1
 *     1 × 0.22( ) + 0.22                  |  0.78 = 1.28
 *     4150
 *
 * which is what a two-dimensional fraction looks like once it has been read in
 * one dimension. There is no repairing that in text, so the band is rendered.
 *
 * What marks one out is the pair: it carries maths-font characters *and* it is
 * not in the body column. The second half is what keeps a paragraph with an
 * inline formula as prose — `Despite an impressive 4150 × improvement` has a
 * maths character in it and starts exactly where every other body line starts.
 */
export function equationsIn(lines, bodyLeft, gap = 26) {
  const displaced = lines.filter(
    (line) => line.mathChars > 0 && Math.abs(line.x - bodyLeft) > 8
  );
  if (!displaced.length) return [];

  const bands = [];
  let band = null;
  // Down the page, so "the next line" means the one under it.
  for (const line of [...displaced].sort((a, b) => b.y - a.y)) {
    const box = [line.x, line.y - 4, line.right, line.y + (line.height ?? 10)];
    if (band && band[1] - box[3] <= gap) {
      band = [
        Math.min(band[0], box[0]),
        Math.min(band[1], box[1]),
        Math.max(band[2], box[2]),
        Math.max(band[3], box[3]),
      ];
      bands[bands.length - 1] = band;
    } else {
      band = box;
      bands.push(band);
    }
  }
  return bands;
}
