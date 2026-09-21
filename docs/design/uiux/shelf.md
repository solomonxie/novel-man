# Shelf — the one page

`app/index.tsx`. Search, the library, then every setting as a section of this
same page. **A page whose only job is holding links gets deleted.**

```
┌───────────────────────────────────────────┐
│ 🔍 Search content                         │ ← top of the page, not behind a
├───────────────────────────────────────────┤   nav-bar icon
│ Importing · big.docx        47%       ›   │ ← strip, only while a job runs
│ Library                                   │ ← no ＋ here: the button under
│ ┌───────┐ ┌───────┐ ┌───────┐             │   the shelf is the only way in
│ │ cover │ │ cover │ │ cover │             │   one row that runs off the edge,
│ └───────┘ └───────┘ └───────┘             │   most recently read first
│ 《长夜…》  Ash Lane   The Sec…             │
│ 14%       138.1万字   ★★★★☆                │ ← started: how far in.
│ ┌───────┐ ┌───────┐ ┌───────┐             │   unstarted: how long it is.
│ │ cover │ │ cover │ │ cover │             │   no words at all: your rating,
│ └───────┘ └───────┘ └───────┘             │   or where it stands
│                                           │
│ ╭───────────────────────────────────────╮ │ ← filled, full width. Adding a
│ │        ＋  Add a book            ⌄    │ │   book is the second thing
│ ╰───────────────────────────────────────╯ │   anybody does with this app;
│                                           │   a 26px glyph in a corner is
│ Settings                                  │   not a door. Hidden while
│ GENERAL
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
          Import a .txt, .md, .docx or .epub to start.
 searching
          In the text (12)                    ← content hits, above the grid
          《长夜纪》 ch.14 …the river had risen past…
          No book by that name.
```

## Adding a book  `src/ui/AddFlow.tsx`

**The menu is the flow.** Adding a book happens on the shelf, one question at a
time, in the card the button opens — and it never leaves the page unless a
catalog has to be searched. There is no Add page and no ＋ in a corner: one
button, under the shelf it adds to.

Opening it, and every level after, scrolls the card up with a screen-eighth of
headroom above it — whole, but not jammed against the status bar, because the
shelf is still there.

```
 ① what is it                  ② where from              ③ what it still needs
 ╭─────────────────────────╮   ╭─────────────────────╮   ╭─────────────────────╮
 │ ＋ Add a book        ⌃  │   │ ＋ Add a book    ⌃  │   │ ＋ Add a book    ⌃  │
 ╰─────────────────────────╯   ╰─────────────────────╯   ╰─────────────────────╯
 ╭─────────────────────────╮   ╭─────────────────────╮   ╭─────────────────────╮
 │ FICTION                 │   │ ‹  Novel            │   │ ‹ Create an empty…  │
 │ Novel                   │   │ From your files   ⌄ │   │ Novel             ⌄ │
 │   Fiction — cast, scenes│   │   .txt .md .docx…   │   │   Fiction — cast…   │
 │ NONFICTION              │──▶│ From a link       ⌄ │   │┌───────────────────┐│
 │ Nonfiction              │   │ Project Gutenberg   │   ││ Title▌            ││
 │ Textbook or tutorial    │   │            79,000 ›─┼─┐ ││ Author (optional) ││
 │ Academic paper          │   │ Standard Ebooks   › │ │ │└───────────────────┘│
 │ SCRIPTURE               │   │ Open Library 4,000 ›│ │ │ [[ Add to shelf ]]  │
 │ Bible                   │   ╰─────────────────────╯ │ ╰─────────────────────╯
 │ ─────────────────────── │                           │
 │ Goodreads             › │ ← a library, not a book:   │  its own page, then
 │   Your own shelves…     │   nothing about it answers └▶ straight back to ③
 │ Create an empty book  ⌄ │   "what is it"                with the book chosen
 ╰─────────────────────────╯
```

- **Two doors are not a type**, so they sit under all of them: a whole shelf
  brought over from Goodreads, and a book with nothing behind it. The one that
  fetches nothing is always last.
- **A record picks its own type inside its own form** — the type decides which
  sections its page will have, and nothing else, so it is asked where it is
  used rather than before it.
- **`‹` is the only way back**, carrying the answers so far
  (`‹ Novel · Project Gutenberg`). One tap back clears one answer.
- **`⌄` stays here, `›` leaves.** A title, a link, a key and the canon question
  are answered in the card; searching a catalog needs a field, a keyboard and a
  long list, so those are the source's own page — and picking there comes
  straight back to ③.
- **Nothing is fetched above the button.** Every level is free and reversible.

A bible's doors, in the order somebody wanting one would try them:

```
 │ ‹  Bible                │
 │ From your files       ⌄ │
 │ From a link          ⌄ │
 │ eBible.org         1,2… │ ← every redistributable edition
 │ ESV                  ⌄ │ ← licensed: nobody may hand it over, so what it
 │   Licensed by Crossway… │   needs is a key of your own
 │ GitHub                › │ ← the editions no catalog is allowed to carry
```

Level ③, per door:

```
 From your files      ash-lane.docx  ✓     ← the picker opens on the tap; what
                      Tap to choose another   came back is named here
                      [[ Add it ]]

 From a link          https://…            ← a Google Doc arrives as .docx
                      ( Fetch it ) ▸ ash-lane.docx ✓  [[ Add it ]]

 Project Gutenberg    Pride and Prejudice       Gutenberg   ← taken from its
                      en · Public domain · 558 KB            own page
                      [[ Download ]]

 eBible.org           World English Bible         eBible.org
                      Canon    66 books        ⌄ ← the one question a bible
                      66 books · 1,189 chapters…   still raises
                      [[ Download ]]

 ESV                  Your API key            Added
                      Test the key            Works
                      Add ESV to the shelf        ›
```

```
 states  nothing answered yet     no button at all
         a title typed            [[ Add to shelf ]]
         a file chosen            [[ Add it ]]
         a book chosen            [[ Download ]]   + what the source stated
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
