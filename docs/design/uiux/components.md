# Components

`src/ui/primitives.tsx` and `src/ui/detail.tsx` — every page is these.

```
 Section(title, action)        SECTION TITLE            action ▾
 ┌───────────────────────────────────────────┐
 │ Row(label, value, detail)  value      ›   │   › only when it pushes
 │ Row(danger)                               │   destructive, last
 │ Toggle(label, detail, directions)    ─●   │   directions = the one
 └───────────────────────────────────────────┘   fixable blocked state
 Hint          a footnote line under a section, muted, never a paragraph
               at the bottom of the page
 PrimaryAction [[ ▶ Continue ]]   one per page, and only one
 Cover         image ▸ generated (title on a hue from the title) ▸
               placeholder. Never blank.
```

```
 Hero(eyebrow, avatar, facts, actions, note)
 ┌─────────────────────────────────┐
 │ CHARACTER                       │  eyebrow: what kind of page this is
 │ ╭────╮ 林小满                   │  avatar leads the name line rather
 │ │ 林小 │ 小满                   │  than floating centred above it
 │ ╰────╯                          │
 │ [12]  [ch.1]  [ch.40]           │  Fact: value over label
 │ ( Polish with AI )( Export )    │  Action: what you can do, as buttons —
 └─────────────────────────────────┘  a list row would say "over here"

 Block(title, count, action, onOpen)   BLOCK          12   action ›
 Item(badge, title, detail, meta)      (1) 第一章 灯灭
                                           青衫，声音很轻
 Badge                                 (1)  the chapter number — an index
                                            means position
 Chip / ChipRow                        ( 林小满 )( 老陈 a place )
 Tiles / Tile                          value over label, tappable
 Empty(text, action)                   None yet        ( Add one )
 Writable(empty)                       a field that edits in place and
                                       commits on blur; placeholder shows
                                       when empty
 Quote                                 ▌ the manuscript's own words
```

## Sheets — everything modal

```
 PickerSheet      title, then one row per option with a detail line
 QueueSheet       import queue
 WorkQueue        AI work, global
 ExportSheet      formats with keeps/drops stated before the tap
 ReadingSettings  live on the page behind it
 UnitEditor       Cancel / title / Save
 AiRunSheet       what it sends · the estimate · [[ Run ]]
```

## Rules the primitives encode

```
✓ picking a value opens a sheet over the page
✗ pushing a page to pick a value
✓ a row that leads somewhere genuinely else
✗ a row that leads to more settings — that row shouldn't exist
✓ an unbuilt feature named with "Coming soon"
✗ a control wired to nothing
✓ every AI action states what leaves the device, and the estimated cost,
  before it runs
```

## Cost and progress, everywhere AI appears

```
 est. 12k tokens · $0.03            ← inline on the row
 add an AI key to see the cost      ← no key
 About $0.42 · ~180k tokens in · OpenAI
 An estimate, not a quote. Billed to your own account. Results are
 cached, so a repeat run is free.
 7 of 47                            ← progress, per unit of work
 costs money  /  on device          ← which engine a row will use
```
