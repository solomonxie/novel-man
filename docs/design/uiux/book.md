# Book — the hub

`app/book/[id].tsx` — one page that is the whole app for one book. Nothing
about a book lives anywhere else.

```
┌───────────────────────────────────────────┐
│ ‹                                         │
│ ┌───────┐                                 │
│ │ cover │  [12]        [47]        [21h]  │ ← facts as pills
│ │    ✎  │  long     chapters     to read  │   ✎ badge edits the cover
│ └───────┘                                 │
│ ┌───────────────────────────────────────┐ │
│ │   ▶ Continue          ( Analyze )     │ │ ← "Start reading" before the
│ └───────────────────────────────────────┘ │   first open
│ Title      The Second Step                │ ← THE HEADER IS THE EDIT FORM:
│ Author     …                              │   every field commits on blur
│ Year  2024        Edition  1st            │
│ Imported from ash-lane.docx               │
│ What is this book about? A few sentences. │ ← summary, edits in place
│                                           │
│ INSIDE                        Jump to…    │
│ ┌───────────────────────────────────────┐ │
│ │ Chapters                     47   ›   │ │
│ │ Scenes                      128   ›   │ │
│ │ Notes                        12   ›   │ │
│ └───────────────────────────────────────┘ │
│ CHARACTERS               All characters ›  │
│ ┌───────────────────────────────────────┐ │
│ │ 林小满                    小满    ›   │ │ ← each opens its own profile
│ │ None yet             ( Add one )      │ │
│ └───────────────────────────────────────┘ │
│ PLACES                                 ＋ │
│ UTILITIES                                 │
│ ┌───────────────────────────────────────┐ │
│ │ Translations                      ›   │ │
│ │ Screenplay                        ›   │ │
│ │ Illustrations        Coming soon      │ │ ← named honestly as unbuilt,
│ │ Animations           Coming soon      │ │   never hidden
│ │ Category                Fantasy   ›   │ │
│ └───────────────────────────────────────┘ │
│ ┌───────────────────────────────────────┐ │
│ │ Export…                           ›   │ │
│ │ Delete book                        !  │ │
│ └───────────────────────────────────────┘ │
└───────────────────────────────────────────┘
```

```
✗ a header AND a Details section repeating the same four values — the same
  information twice, with the copy you can't touch on top
✗ a control wired to an empty handler ("Edit" on the chapter heading): a dead
  control is worse than a missing one
```

## One page, five shapes

The page above is the **novel**. It is not five pages: the kind declares which
sections it has and in what order, and this page renders that list. A kind
nobody has built a section for still gets a readable book — title, chapters,
notes, export — because those belong to every kind.

| section | novel | scripture | paper | nonfiction | how-to | textbook |
|---|---|---|---|---|---|---|
| the facts pill row | words · chapters · hours | books · chapters · verses | words · **sections** · hours | words · parts | steps · modules | units · terms |
| Inside | Chapters · Scenes · Notes | **Books** · Notes | **Sections** · Notes | Parts · Notes | Modules · Notes | Units · Notes |
| People | Characters · Places | **Who and where**, as record | — the people are the authors | same | — | — |
| Utilities | Translations · Screenplay · Illustrations · Animations | Translations | Translations | Translations | Translations | Translations |
| its own thing | — | **go to a reference** | **authors · arXiv id · category, from the source** | the index | the step list | figures · key terms |
| Analyze | the book, or a chapter | **one bible book at a time** | **what it claims and what it rests on** | one part | one module | one unit |

Two rules the table encodes:

- **A section a kind can't use is absent, not disabled.** A novel's Screenplay
  row does not appear greyed on a bible; it is not part of that page. What is
  built-but-unbuilt (`Illustrations · Coming soon`) still shows, because that
  is a promise about this app, not a feature this book lacks.
- **A kind says what reading it is for.** A story is followed, an argument is
  weighed: the same pass over a paper asks what the section claims and on what
  evidence, and the book summary it writes is an abstract rather than a blurb.
- **Analysis is scoped by the unit above the chapter.** "Analyze" on a novel
  means the book; on a bible it means Genesis, because 1,189 chapters is a bill
  nobody meant to agree to. The button's label says which.

A bible's version of the same page, drawn in full, is in
[scripture.md](scripture.md).

```
 scripture                        how-to
┌───────────────────────────┐    ┌───────────────────────────┐
│ [66] [1,189] [31,102]     │    │ [7] [58] [12]             │
│ books chapters   verses   │    │ modules steps  commands   │
│ ▶ Continue · John 3       │    │ ▶ Continue · Step 12      │
│ BOOKS               66 ›  │    │ MODULES              7 ›  │
│ WHO IS IN IT       412 ›  │    │ COMMANDS            12 ›  │
│ Go to a reference…     ›  │    │ Notes                7 ›  │
│ Analyze Genesis  ~50ch ›  │    │ Analyze module 3  ~8st ›  │
└───────────────────────────┘    └───────────────────────────┘
```

## Jump to chapter — a sheet, not a section

509 chapters is a picker.

```
 ▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁
 47 chapters
 ┌──────────────────────────────────────┐
 │ 🔍 Search chapters                   │
 └──────────────────────────────────────┘
 1   第一章 灯灭                    12,400 chars
 2   Untitled                  ⚠ unsure
 …
 No chapter matches that.
```

## Analyze — one sheet, the cost stated before the tap

```
 ▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁
 Analyze this book with AI →
 Reads all 47 chapters one at a time — each with the book so far as
 context — and writes their briefs, …
 About $0.42 · ~180k tokens in · OpenAI
 An estimate, not a quote. Billed to your own account. Results are
 cached, so a repeat run is free.
                  [[ Run ]]
 no key   No AI key configured. Add one in Settings first.
 no cost  Cost unknown without a key.
 queued   47 chapters queued. Tap the bar at the bottom to watch it.
```

## Export  `src/ui/ExportSheet.tsx`

Every format says what it keeps and what it drops **before** you pick it.

```
 ▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁
 Export
 MANUSCRIPT
 .epub      keeps chapters, formatting · drops notes · imports back
 .docx      keeps chapters · drops formatting
 .txt       keeps chapters
 HIGHLIGHTS AND NOTES
 .md        keeps notes
 Character bible                            ·  needs the cast
 Translation · Screenplay · Notes, cast and chapter list
 ( Share… )        ( Save in the app )
 ⟳ Building .epub…            ( Cancel )
 Saved as the-second-step.epub
 ⊗ Export failed.
```

## Delete

```
 Delete book
 Delete this book? Its notes and highlights go with it.
      ( Cancel )        [ Delete book ]!
```

## States

```
 no chapters   Couldn't split this into chapters.      → structure.md
 source gone   The original file is gone. Text and notes are safe.
               ( Replace source )
 detected but not analyzed — the normal, permanent state for most books:
 ✗ no "complete setup" banner, no progress ring stuck at 1/3
```
