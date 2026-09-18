# Scripture — a bible, in this app

Book kind `scripture`. Reasoning in [DESIGN.md](../DESIGN.md); the source
catalog it downloads from is in [shelf.md](shelf.md).

**A bible chapter is a chapter, and the bible book is the part above it.**
Everything else — reading, notes, export, cast — is the app as it already is.

```
Genesis  ← part      the chapters carry it; there is no second tree
  1 2 3 … 50        ← chapters, what the arrows turn
     16             ← verses, what a tap lands on and what a note cites
```


## The editions offered  `src/scripture/ebible.ts`

A chosen list, not a search over 1,550. Order is the list's own; the counts and
the licence line come from the catalog.

```
 KJV  King James Version + Apocrypha      en   public domain   80
 ASV  American Standard Version (1901)    en   public domain   66
 WEB  World English Bible                 en   public domain   66
 BSB  Berean Standard Bible               en   public domain   66
 NET  NET Bible                           en   Biblical Studies Press
 YLT  Young's Literal Translation         en   public domain   66
 和合本 简  新标点和合本                    zh   public domain   66
 和合本 繁  新標點和合本                    zh   public domain   66
 当代译本   圣经当代译本开放资源              zh   Biblica
 當代譯本   聖經，當代譯本開放資源            zh   Biblica
 世界中文   世界中文圣经                     zh   public domain   66
```

**NIV, NKJV, NASB and 吕振中 are not here and cannot be.** Their licences
forbid redistribution — the catalog's `Redistributable` column says so — so no
source this app can reach will serve them. A row that always fails the download
would be worse than their absence, so they are absent.

The ESV is the same case with one difference: Crossway runs an API. So it is
not a book here either, but it can be asked a passage at a time — see the
lookup in [sources.md](sources.md).

A curated list also settles what the RTL filter was for: Hebrew and Arabic
editions are simply not on it, and neither is any language the reader can't
lay out.


## Downloading one  `app/scripture/translations.tsx` → `app/add.tsx`

Two questions, because everything else is a reading setting that must never
cost a download.

```
 ⊕ ─▶ Scripture ─▶ Translation ›
 ┌─ Choose a translation ─────────────────────┐   ┌─ Add a book ───────────────┐
 │ KJV · King James Version + Apocrypha   80 ›│   │ WHERE FROM                 │
 │   English · public domain · +14            │   │ eBible.org · 11 · 3 Mar ⟳  │
 │ ASV · American Standard Version (1901) 66 ›│   │                            │
 │   English · public domain                  │   │ ABOUT THIS BOOK            │
 │ WEB · World English Bible              66 ›│   │ Translation      KJV    ›  │
 │   English · public domain                  │   │ Canon       66 books    ▾  │
 │ 和合本 简 · 新标点和合本                 66 ›│   │                            │
 │   Chinese · public domain                  │   │ 66 books · 1,189 chapters  │
 │ 和合本 繁 · 新標點和合本                 66 ›│   │ · 31,102 verses            │
 │   Chinese · public domain                  │   │ Structure included         │
 │ …                                          │   │     [[ Download ]]         │
 └────────────────────────────────────────────┘   └────────────────────────────┘
```

- No search field: eleven rows are the whole answer, and a box over eleven rows
  is a question with no purpose.
- The row's counts and licence are the catalog's own columns, not our claim.
- **Canon is the only option with a second value**, and only for editions that
  ship deuterocanonical books. One question hidden is better than one asked.
- 简体 and 繁體 are two rows, not a toggle: they are two editions upstream, and
  pretending otherwise would mean re-downloading to switch script.
- It runs the ordinary import queue, minus one step:
  `Fetching from eBible.org…  ▸  Reading USFM…  ▸  Saving…` — no
  "Finding chapters…", because the edition published them.


## The book page for a bible  `app/book/[id].tsx`

Same page, parts where chapters were.

```
┌───────────────────────────────────────────┐
│ World English Bible                       │
│ 66 books · 1,189 chapters · 31,102 verses │
│ [[ Continue · John 3 ]]  [ Books ]        │
│                                           │
│ BOOKS                              66  ›  │
│ ┌───────────────────────────────────────┐ │
│ │ Genesis            50 chapters    ›   │ │ ← a part opens its own page,
│ │ Exodus             40 chapters    ›   │ │   not a wall of 1,189 rows
│ │ Leviticus          27 chapters    ›   │ │
│ │ Show 63 more                          │ │
│ └───────────────────────────────────────┘ │
│ WHO IS IN IT                      412  ›  │ ← cast, read as real people
│ WHERE                             180  ›  │
│ Analyze Genesis          ~50 chapters ›   │ ← per book. Never "analyze the
└───────────────────────────────────────────┘   bible": that is a bill nobody
                                                meant to agree to
```

Absent for this kind: Scenes, Screenplay, generated art. A chapter of
Leviticus has no scene to find, and the kind says so rather than offering a
button that returns nothing.


## One bible book  `app/book/[id]/part/[idx].tsx`

The book page's shape at the part's scale. Genesis is the unit a reader of a
bible holds in mind, and it used to be a row that only led away.

```
┌───────────────────────────────────────────┐
│ ‹  Genesis                                │
│ ┌───────┐  KING JAMES VERSION             │ ← the edition, as the eyebrow
│ │ pic ✎ │  Genesis                        │ ← title edits in place; renaming
│ └───────┘  [50] [1,533] [4 notes]         │   it renames the label its 50
│            chapters verses                │   chapters carry
│ ┌───────────────────────────────────────┐ │
│ │  ▶ Read from here    ( Analyze )      │ │
│ └───────────────────────────────────────┘ │
│ Reads the 50 chapters of Genesis — never  │ ← the bill, stated before the
│ the whole book.                           │   button is a decision
│ What is this one about?                   │ ← summary, edits in place
│                                           │
│ Chapters                            50    │
│ ┌───────────────────────────────────────┐ │
│ │ 🔍 Search chapters                    │ │ ← past 8 of them
│ │ ① Genesis 1                        ›  │ │ ← the row reads it. A part is a
│ │ ② Genesis 2                        ›  │ │   place in the book
│ └───────────────────────────────────────┘ │
│ Notes                                4  › │ ← every mark that falls inside
│ ┌───────────────────────────────────────┐ │   this book, collected by
│ │ "In the beginning God created…"    ›  │ │   offset — nothing was filed
│ │  the first thing said about him       │ │   twice to make this page
│ └───────────────────────────────────────┘ │
└───────────────────────────────────────────┘
```

- **The title is still the chapters'.** Renaming Genesis writes the label onto
  its 50 chapters, because that is where a part lives; only the summary and the
  picture, which have nowhere on a chapter to sit, are stored apart.
- **Its notes are found, not filed.** A note is anchored at a book offset, so
  the ones belonging to this part are the ones inside its range. The heading
  leads to the book-wide Notes page, which is the same marks, ungrouped.
- **Analyze is scoped here and priced here** — Genesis, not the bible.
- A chapter's own page — briefs, cast, places — is reached from Chapters or
  from the reader's `⋯`; this list is for going there and reading.


## Analyzing it — the text never leaves

A bible is the one book every model has already read, in every edition. So the
passage is named, not sent:

```
 ## THIS CHAPTER (Genesis 5)
 Edition: King James Version + Apocrypha
 Passage: Genesis 5:1-32
 Verses: 32
 The text of this passage is not included. Read it from your own knowledge of
 this edition. Where your memory of the wording differs from this edition, say
 so rather than smoothing it over, and never supply a verse you are unsure of.
```

- **A few dozen tokens a chapter instead of a few thousand.** Genesis 5 is
  ~4,000 tokens of text nobody has to pay to hand over.
- **The edition is named** because the wording is not the same in all of them,
  and the model is told to say so rather than answer about a different one.
- The estimate on the run sheet falls with it — a price the run does not spend
  is a lie, even a generous one.
- Everything else in the briefing stays: the people already known, the chapters
  just before. Those are cheap and they are what keep names consistent.
- The rest of the app is unmoved: this is the `verses` feature deciding it, so
  any kind that addresses itself by verse gets the same treatment.


## Reading it  `app/reader/[id].tsx`

The reader, with the verse as the unit a tap lands on.

```
┌───────────────────────────────────────────┐
│ ‹            John 3            ≡          │ ← the reference is the title
│                                           │
│  ¹⁶ For God so loved the world, that he   │ ← number is a mark, not text:
│  gave his one and only Son, that whoever  │   switch it off and the words
│  believes in him should not perish, but   │   are untouched
│  have eternal life.                       │
│  ¹⁷ For God didn't send his Son into the  │
│  world to judge the world, but that the   │
│  world should be saved through him.       │
│                                           │
│  ┌─────────────────────────────────────┐  │
│  │ Copy  Highlight▾  Note  Share   ✕   │  │ ← acts on the verse, and Share
│  └─────────────────────────────────────┘  │   attributes: "John 3:16 (WEB)"
│ ─────────────────────────────●──────────  │
│   ‹        Aa      ≡        ›             │
└───────────────────────────────────────────┘
```

Reading settings gain a Scripture group — all render-only, all instant, none
of them a download:

```
 Verse numbers      ─●          Section headings   ─●
 One verse per line ○─          Poetry indents     ─●
 Words of Jesus     ○─          Footnotes          ○─   (\f, \x)
```

The chapter sheet is grouped by book, because 1,189 rows in one list is not a
list:

```
 ▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁   ← half the page, dragged down
 Chapters                    [ OT | NT ]        to dismiss, landing on where
 ── John ──────────────────────────────         you are
  1  2  3● 4  5  6  7  8  9  10 …               chapter numbers as a grid:
 ── Acts ──────────────────────────────         50 taps in one screen, not 50
  1  2  3  4  5  6  7  8  9  10 …               rows
```


## Going to a reference

The search field on the shelf and the ≡ sheet both take one:

```
 🔍 John 3:16            ─▶  opens the reader at that verse
 🔍 约 3:16               ─▶  same, because the edition says 约 (\toc3)
 🔍 1 Cor 13             ─▶  the chapter, top
 🔍 loved the world      ─▶  ordinary text search, unchanged
```

A reference resolves against **the edition installed** — book names come from
that edition's own USFM, and so does its versification. Nothing pretends a
citation is universal across translations.

### States

```
 no such book     "Jhn" isn't a book in this edition. Try John.
 out of range     John has 21 chapters.
 verse missing    This edition numbers John 5 without verse 4.   ← real, and
                  a lie would be worse than the note
 not scripture    references only apply to a bible; the field stays a search
```
