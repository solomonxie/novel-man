# Shelf — the one page

`app/index.tsx`. Search, the library, then every setting as a section of this
same page. **A page whose only job is holding links gets deleted.**

```
┌───────────────────────────────────────────┐
│ 🔍 Search content                         │ ← top of the page, not behind a
├───────────────────────────────────────────┤   nav-bar icon
│ Importing · big.docx        47%       ›   │ ← strip, only while a job runs
│ Library              Show 4 more       ＋ │ ← ＋ on the row that names what
│ ┌───────┐ ┌───────┐ ┌───────┐             │   it adds to
│ │ cover │ │ cover │ │ cover │             │   three across, two rows,
│ └───────┘ └───────┘ └───────┘             │   most recently read first
│ 《长夜…》  Ash Lane   The Sec…             │
│ 14%       138.1万字   2%                   │ ← started: how far in.
│ ┌───────┐ ┌───────┐ ┌───────┐             │   unstarted: how long it is
│ │ cover │ │ cover │ │ cover │             │
│ └───────┘ └───────┘ └───────┘             │
│                                           │
│ Settings                                  │ ← a section, not a destination
│ GENERAL                                   │
│ ┌───────────────────────────────────────┐ │
│ │ Analysis queue       3 running    ›   │ │ ← leads the section: the only
│ │ Language                    English   │ │   row that is ever doing
│ │ Appearance                   System   │ │   something. The strip only
│ └───────────────────────────────────────┘ │   exists mid-run
│ PUBLIC SOURCES                         ＋ │
│ ┌───────────────────────────────────────┐ │
│ │ Project Gutenberg      3 Mar    ⟳ ›   │ │ ← when its index was last
│ │ eBible.org             3 Mar    ⟳ ›   │ │   fetched; ⟳ refreshes one
│ │ 中文古籍                 1 Mar    ⟳ ›   │ │
│ │ my-texts  added by you 3 Mar    ⟳ ›   │ │ ← yours is labelled as yours
│ └───────────────────────────────────────┘ │
│ Where "From a public source" looks. Only  │
│ books the source states a licence for.    │
│ AI KEYS                        Fallback ▾ │
│ ┌───────────────────────────────────────┐ │
│ │ OpenAI        128 requests · gpt-4o   │ │
│ │                          ↑   ↓   ⋯    │ │
│ │ ＋ Add AI Key                         │ │
│ └───────────────────────────────────────┘ │
│ Used by chapter detection and analysis.   │
│ Keys never leave this device, including   │
│ in backups.                               │
│ CLOUD BACKUP                           ＋ │
│ ┌───────────────────────────────────────┐ │
│ │ iCloud Drive                     ─●   │ │
│ │ Files → iCloud Drive → Novel Man      │ │
│ │ my-manuscripts   bucket/prefix    ›   │ │
│ └───────────────────────────────────────┘ │
│ iCloud keeps what you made — notes,       │
│ characters, progress, settings — and not  │
│ the books.                                │
│ BACKUP                                    │
│ ┌───────────────────────────────────────┐ │
│ │ Export the whole library          ›   │ │
│ │ Restore from a file…              ›   │ │
│ └───────────────────────────────────────┘ │
└───────────────────────────────────────────┘
```

Cover falls through: user-set image → generated (title on a hue derived from
the title) → placeholder. **Never blank.**

## States

```
 empty    No books yet.
          Import a .txt, .md, .docx or .epub to start.        ＋
 searching
          In the text (12)                    ← content hits, above the grid
          《长夜纪》 ch.14 …the river had risen past…
          No book by that name.
```

## Adding a book  `app/add.tsx`

＋ pushes a page, not a sheet. **What kind of book comes first**, because it
decides which sources are worth offering, what else to ask, and what the book
page will be. Rows appear as they become answerable — no steps, no Next.

```
┌─ Add a book ──────────────────────────────┐
│ WHAT KIND                                 │
│ (●Novel) ( Scripture ) ( Nonfiction )     │ ← chips, Novel preselected so
│ ( How-to ) ( Textbook )                   │   the ordinary path is untouched
│ Fiction — characters, scenes, a screenplay│ ← one line on what this kind
│ and illustrations.                        │   buys. The reason to care
│                                           │
│ WHERE FROM                                │
│ ┌───────────────────────────────────────┐ │
│ │ ash-lane.docx        ready        ─●  │ │ ← a file already in hand (share
│ │ From Files…     .txt .md .docx .epub  │ │   sheet, "Open in…") sits on top,
│ │ From a link…    a Google Doc, a URL   │ │   already chosen
│ │ Project Gutenberg   70k public-domain │ │ ← only sources that carry THIS
│ └───────────────────────────────────────┘ │   kind. eBible isn't here
│                                           │
│ ABOUT THIS BOOK                           │
│ ┌───────────────────────────────────────┐ │
│ │ Language          Auto — 中文      ▾  │ │ ← detected, overridable
│ │ Chapters          第N章 found      ▾  │ │
│ │ Volumes (卷)              ○─          │ │ ← only for kinds that have one
│ └───────────────────────────────────────┘ │
│                                           │
│            [[ Add it ]]                   │
│ Nothing is fetched until you tap this.    │
└───────────────────────────────────────────┘
```

The kind decides which public sources are on the page. Each is a door to its
own search — see [sources.md](sources.md):

```
│ WHERE FROM                        novel   │
│ ┌───────────────────────────────────────┐ │
│ │ Project Gutenberg          Search  ›  │ │ ← 79,000 books out of copyright
│ │ From your files      .txt .md .epub…  │ │
│ │ From a link                           │ │
│ └───────────────────────────────────────┘ │
│ WHERE FROM                      tutorial  │
│ ┌───────────────────────────────────────┐ │
│ │ From your files                       │ │ ← a kind with no public source
│ │ From a link                           │ │   still has the two every kind
│ └───────────────────────────────────────┘ │   has
```

Choosing **Scripture** puts eBible in the same place, and it is the one source
with a list worth keeping: eleven editions, cached with their date.

```
│ WHERE FROM                                │
│ eBible.org · 11 translations   Search  ›  │ ← the only source that carries a
│ Update the list of bibles         ⟳       │   bible
│ ABOUT THIS BOOK                           │
│ ┌───────────────────────────────────────┐ │
│ │ Translation                   WEB  ›  │ │ ← pushes the chosen list; eleven
│ │                                       │ │   editions, no search box
│ │ Canon         66 books             ▾  │ │ ← only when the edition has
│ └───────────────────────────────────────┘ │   deuterocanonical books
│ 66 books · 1,189 chapters · 31,102 verses │
│ · 2.9 MB · structure included             │
│            [[ Download ]]                 │
```

- **The kind's chips never disappear.** Changing your mind re-renders the rows
  under them; nothing is lost that still applies, and a file already chosen
  stays chosen if the new kind can take it.
- **Sources belong to kinds.** A novel is offered Gutenberg, a tutorial is
  offered GitHub, a bible eBible; a kind with no public source shows the file
  picker and the link box, which every kind has."
- **Detected values are shown as detected** (`Auto — 中文`, `第N章 found`), so
  the reader overrides a fact rather than filling a blank.
- **`Add it` is the first moment anything is fetched.** Everything above it is
  free and reversible.
- A `.zip` backup recognized on this page routes to restore, as from any door.

```
 From a link…
 ┌──────────────────────────────────────┐
 │ https://…                            │
 └──────────────────────────────────────┘
 A Google Doc link comes in as .docx. The file must be readable
 without signing in.
                ( Fetch it )
 ⊗ That link asked us to sign in. Share it as "anyone with the link",
   or download it and import the file.
 ⊗ Couldn't fetch that link.   ⊗ Can't read .pages files yet.
```

The import strip names **the step that is running**, never a bare spinner:

```
 Reading the file…  ▸ Reading .docx…  ▸ Finding chapters…  ▸ Saving…
 Waiting for you            ← needs the preview confirmed
 Import failed              ( Try another file )  ( Cancel )
```

```
 ▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁
 Is this the text?
 .docx · 312,400 characters · 47 chapters
 ┌──────────────────────────────────────┐
 │ The rain had not stopped for three   │  first page of what was
 │ days…                                │  actually extracted
 └──────────────────────────────────────┘
        ( Discard )        [[ Keep it ]]
 Nothing readable came out. If the pages are scans, they're images.
```

## From a public source

Two pushed pages: find it, then say which edition. Both are generated from the
source's own index — the app has no screen that knows what a bible is.

```
 Find a book                                    Request
 ┌──────────────────────────────────────┐      ┌──────────────────────────────┐
 │ 🔍 A title, an author, 圣经…          │      │ King James Version           │
 │                                      │      │ Gutenberg · public domain    │
 │ BIBLE                                │      │                              │
 │ King James Version   Public domain › │      │ Canon      Protestant (66) ▾ │
 │   Gutenberg · en · 4.4 MB            │      │ Verses     One per line    ▾ │
 │ World English Bible  Public domain › │      │ Verse numbers          ─●    │
 │   eBible · en · 4.1 MB               │      │ Red letter             ○─    │
 │ 和合本                Public domain › │      │ Maps and plates  ○─ +12 MB   │
 │   eBible · zh · 3.8 MB               │      │                              │
 │ ────────────────────────────────────  │      │ 66 books · 1,189 chapters ·  │
 │ Indexes as of 3 Mar       ⟳ Refresh  │      │ ~4.4 MB, structure included  │
 └──────────────────────────────────────┘      │      [[ Get it ]]            │
                                               └──────────────────────────────┘
```

Rules the two pages follow:

- **The licence is on the row**, before anything is fetched. No licence, no row.
- **The source is on the row too** — "Gutenberg", "added by you" — so a result
  is never anonymous.
- **Options are the source's**, rendered from its schema: pick-one (▾), toggle
  (─●), or a typed value. An option that changes the size says so.
- **The line above the button is what you'll get**, recomputed as options
  change. It is the only promise the screen makes.
- **Then it is an ordinary import** — same queue, same strip, same preview gate
  for a PDF. Editions that carry a structure map skip chapter detection.

### States

```
 no sources yet   Nothing to search. Add a source, or turn one back on.   ＋
 searching        …as you type, over cached indexes. No network needed.
 nothing found    No book by that name in your sources.
                  ⟳ Refresh indexes      ＋ Add a source
 offline          Indexes as of 3 Mar · couldn't refresh. Search still works;
                  getting a book needs a connection.
 already have it  ⚠ You already have this edition.  ( Open it ) ( Get it again )
 source down      ⊗ Couldn't reach Gutenberg. Your other sources still work.
 moved            ⊗ That edition has moved. Refresh the index and try again.
```

### Adding a source

```
 ▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁
 Add a source
 ┌──────────────────────────────────────┐
 │ https://…/index.json                 │
 └──────────────────────────────────────┘
 An index lists books and where to get them. Books come from wherever
 it points, so add one you trust.
                ( Check it )
 ✓ 1,204 books · en, zh · last published 2 Mar      [[ Add ]]
 ⊗ That URL didn't return a source index.
```
