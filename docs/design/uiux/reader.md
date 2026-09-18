# Reader

`app/reader/[id].tsx` — chrome earns its place only while you are using it;
reading gets the page. It fades out on idle.

## Chrome hidden

```
┌───────────────────────────────────────────┐
│                                           │ ← no nav bar
│   The rain had not stopped for three      │
│   days. ████████████████████████████████  │ ← highlight: background tint
│   ████████████, and the river had risen   │   only — no underline, no icon
│   past the second step.                   │
│                                           │
│   She went down anyway.¹                  │ ← superscript = a note exists
│                                           │
│ Chapter 12 · The Second Step        37%   │ ← the one thing never hidden
└───────────────────────────────────────────┘
```

## Sentence menu — tap any sentence

```
│   ┌─────────────────────────────────────┐ │
│   │ Copy  Highlight  Note  Bookmark  Share│ anchored to the sentence
│   └──────────────▼──────────────────────┘ │
│   ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │ ← tapped sentence, soft tint
 tap another sentence to extend the selection
 first tap ever:  Tap any sentence to highlight, note or share it.
 toasts:  Copied · Bookmarked
 already marked ⇒ the action flips: Remove · Unbookmark
```

## Chrome shown

```
┌───────────────────────────────────────────┐
│ ‹        Chapter 12 · The Second Step      │
├───────────────────────────────────────────┤
│   The rain had not stopped for three      │
│   days. …                                 │
├───────────────────────────────────────────┤
│ ▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░  37% · chapter 12 │ ← the scrubber addresses the
│   ‹        Aa      ⋯        ›             │   whole book, not the page
└───────────────────────────────────────────┘
```

**Four controls, and two of them are the arrows.** The bar had five; a reading
page is not a toolbar, and everything that isn't turning a page or resizing the
type says what it does better in words than as a glyph. So `≡` and the select
checkbox folded into `⋯`, which turns accent while select mode is on — a mode
the page is in is a thing the bar has to admit.

```
 ⋯ ▸ Jump to a chapter…          ← the sheet that was ≡
     Select sentences            ← was a checkbox nobody could name
     Go to this chapter's page   ← everything that chapter turned out to be
     Go to Genesis               ← the part, named. Only when the book has one
     Go to King James Version    ← the book page
     Analyze this chapter        ← queued, priced at a chapter: pennies
```

The three "go to" rows exist because the reader was a dead end: a bible opened
at John 3 had no way back to John, to the edition, or to what an analysis had
already found about the chapter on screen.

## What loads when

The manuscript is megabytes and the annotations have to be walked against all
of it. Waiting for both before drawing anything left the whole page — bar
included — blank for seconds on a bible, which read as a broken bottom bar.
So the reader loads in three passes:

```
 1  book · chapters · where you were      three small queries ─▶ chrome draws
 2  the text                              megabytes           ─▶ words draw
 3  annotations, re-anchored against it   walks the text      ─▶ marks appear
```

The theme is seeded from the app's appearance on the first render rather than
read from storage — a round trip to storage is one frame of Paper, which in a
dark room is a white flash. The scrubber uses the book's stored `char_count`
until the text arrives, so it starts in the right place instead of at zero.

## Pictures

A picture is a paragraph whose text links to it — `![alt](uri)`, the Markdown
everyone already writes — and the reader draws it instead of the line.

```
│   …the second step.                       │
│  ┌─────────────────────────────────────┐  │ ← at the width of the text, its
│  │                                     │  │   own proportions, never taller
│  │              figure                 │  │   than 70% of the page
│  └─────────────────────────────────────┘  │
│            Figure 2. The river            │ ← the caption, and the fallback
│   She went down anyway.                   │   if it will not load
```

Keeping it as text rather than as a second kind of block is what makes it
free: offsets, highlights, notes, search and export all go on working, and a
page that cannot load the file shows the caption rather than losing it.

Where they come from: **EPUB**, whose images are pulled out of the zip at
import; **HTML**, where they are already addresses; and **Markdown**, where an
`http(s)` link was written by hand. **A PDF's figures are not extracted** — the
extractor runs pdf.js for text only. For a paper that is now mostly moot, since
its HTML rendering is preferred; for a PDF someone uploads themselves it is the
honest state of it rather than a silent blank.

## Formulas

A displayed formula is a picture of itself, drawn once at import and tinted to
the reading colour, so it reads on paper and at night from one file:

```
│   …the cost of attention is quadratic:    │
│                                           │
│            𝑂(𝑛² · 𝑑)                      │ ← MathJax → SVG → PNG, drawn
│                                           │   black on nothing and tinted
│   which is why long sequences…            │
│   the term ` \alpha_t ` stays as its TeX  │ ← inline maths, set monospace
```

The TeX is the picture's caption, so a formula that will not load still says
what it was, and a search for `\alpha` still finds it. Inline maths is left as
its TeX rather than a picture: an image inside a line of prose is a different
problem, and the source is legible on its own.

Rendering happens in the same hidden WebView that reads PDFs — one more job on
a bridge that already existed. No network, no MathJax, or one bad formula: the
TeX stands in for itself and the import carries on.

## Reading settings — half sheet, applied live

```
┌───────────────────────────────────────────┐
│                  ───                      │
│  Aa    ⊖ ──────●────────── ⊕    17pt      │
│  Theme    ( PAPER )( Sepia )( Grey )( Night)│ ← live on the page behind
│  Font     ( SERIF )( Sans )                │   the sheet
│  Spacing  ( Compact )( NORMAL )( Loose )   │
│  Margins  ⊖ ────●───── ⊕                   │
└───────────────────────────────────────────┘
```

Serif/sans is per script — a font that is right for English is not
necessarily right for Chinese, so the list is what exists for the
manuscript's own script.

## Language — the same reader, three ways

```
 Language ▾ ⇒ ( ORIGINAL )( Translation )( Both )
 Both:
│  雨已经下了三天没有停，河水涨过了        │ ← source, dimmed
│  第二级台阶。                             │
│  The rain had not stopped for three       │ ← target, full contrast:
│  days, and the river had risen past       │   you are reading THIS
│  the second step.                         │
│  She went down anyway. ‾‾‾‾               │ ← subtle underline = edited,
                                                differs from the machine
```

Reading mode is a display choice, not a screen: the sentence menu,
highlights and notes work the same in all three.

## Share

```
 Share ▸  Share as text
          Share as a card    A themed page in your reading colors.
 ┌─────────────────────────┐
 │  "She went down         │ ← typeset in the reader's own font and theme
 │   anyway."              │
 │  ──────                 │
 │  The Second Step        │
 │  Chapter 12             │
 └─────────────────────────┘
 Rendered locally into the OS share sheet. Nothing is posted anywhere.
```

## States

```
 empty chapter   This chapter is empty.
 offline         fully offline — that is the point
```
