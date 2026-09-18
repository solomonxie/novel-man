# Scripture — a bible, in this app

Book kind `scripture`. Reasoning in [DESIGN.md](../DESIGN.md); the source
catalog it installs from is in [shelf.md](shelf.md).

**A bible chapter is a chapter, and the bible book is the part above it.**
Everything else — reading, notes, export, cast — is the app as it already is.

```
Genesis  ← part      the chapters carry it; there is no second tree
  1 2 3 … 50        ← chapters, what the arrows turn
     16             ← verses, what a tap lands on and what a note cites
```


## Installing one  `app/source/find.tsx` → `app/source/work.tsx`

Two questions, because everything else is a reading setting that must never
cost a download.

```
 ⊕ ─▶ From a public source… ─▶ 🔍 bible / 圣经
 ┌─ Find a book ──────────────────────────────┐   ┌─ Request ──────────────────┐
 │ BIBLE                                      │   │ World English Bible        │
 │ World English Bible   Public domain     ›  │   │ eBible.org · public domain │
 │   eBible.org · en · 2.9 MB                 │   │                            │
 │ King James Version    Public domain     ›  │   │ Canon   66 books        ▾  │
 │   eBible.org · en · 2.8 MB · + Apocrypha   │   │         66 books           │
 │ 新标点和合本            Public domain     ›  │   │         + Apocrypha (14)   │
 │   eBible.org · zh · 2.6 MB                 │   │                            │
 │ 新標點和合本            Public domain     ›  │   │ 66 books · 1,189 chapters  │
 │   eBible.org · zh · 2.6 MB                 │   │ · 31,102 verses · 2.9 MB   │
 │ ─────────────────────────────────────────  │   │ Structure included         │
 │ 1,412 translations · as of 3 Mar  ⟳ Update │   │     [[ Install ]]          │
 └────────────────────────────────────────────┘   └────────────────────────────┘
```

- The row's counts and licence are the catalog's own columns, not our claim.
- **Canon is the only option with a second value**, and only for editions that
  ship deuterocanonical books. One question hidden is better than one asked.
- 简体 and 繁體 are two rows, not a toggle: they are two editions upstream, and
  pretending otherwise would mean re-downloading to switch script.
- Install runs the ordinary import queue, minus one step:
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
│ │ Genesis            50 chapters    ›   │ │ ← a part opens its chapters,
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
