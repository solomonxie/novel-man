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
│ ‹        Chapter 12 · The Second Step   ⋯ │
├───────────────────────────────────────────┤
│   The rain had not stopped for three      │
│   days. …                                 │
├───────────────────────────────────────────┤
│  Aa         Language ▾        ≡ Chapters  │ ← three controls, nothing else
│ ▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░  37% · chapter 12 │ ← the scrubber addresses the
└───────────────────────────────────────────┘   whole book, not the page
```

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
