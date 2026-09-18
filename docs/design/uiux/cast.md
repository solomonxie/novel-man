# Cast — characters, places, the graph

## All characters  `app/book/[id]/cast.tsx`

```
┌───────────────────────────────────────────┐
│ ‹  Characters                             │
│ ANALYSIS                                  │
│ ┌───────────────────────────────────────┐ │
│ │ Find the characters   costs money  ›  │ │
│ │ Find relationships    costs money  ›  │ │
│ │ Check continuity      costs money  ›  │ │
│ │ Relationship graph                 ›  │ │
│ └───────────────────────────────────────┘ │
│ Each pass reads the book once and caches  │
│ what it learns, so running it again costs │
│ nothing for the parts that haven't changed│
│ CONTINUITY                                │
│ ┌───────────────────────────────────────┐ │
│ │ 林小满  ch.3 says 27, ch.40 says 19   │ │ ← flags are suggestions, each
│ │                        ( Dismiss )    │ │   dismissable
│ └───────────────────────────────────────┘ │
│ ┌───────────────────────────────────────┐ │
│ │ ╭────╮ 林小满            小满      ›  │ │
│ │ │ 林小 │ ch.1 – ch.40 · 12 chapters   │ │
│ │ ╰────╯                                │ │
│ │ 老陈                    unseen     ›  │ │ ← in the glossary, not yet in
│ └───────────────────────────────────────┘ │   any analyzed chapter
│ empty  No characters yet.                 │
└───────────────────────────────────────────┘
 results:  47 character entries across the book. 2 chapters failed.
           12 relationships. 0 batches failed.
           3 things to look at. 0 characters failed.
```

Each AI row says what leaves the device:

```
 Find the characters   Reads the opening of every chapter and lists who
                       appears, what they look like and how they speak.
 Find relationships    Sends profiles, not the manuscript.
 Check continuity      Compares what different chapters said about the same
                       person and flags what disagrees.
```

## Character profile  `app/entity/[id].tsx`

A character *is* a person as far as the interface is concerned — same shape
as `bring-your-own-photos`' person profile.

```
┌───────────────────────────────────────────┐
│ ‹ 《长夜纪》                               │
│ ┌─────────────────────────────────┐       │
│ │ CHARACTER                       │       │ ← the eyebrow says what kind
│ │ ╭────╮ 林小满                   │       │   of page this is
│ │ │ 林小 │ 小满                   │       │ ← the face leads the line
│ │ ╰────╯                          │       │
│ │ [12]    [ch.1]    [ch.40]       │       │ ← facts as pills
│ │ chapters first     last         │       │
│ │ ( Polish with AI ) ( Export )   │       │ ← what you can do, as buttons
│ └─────────────────────────────────┘       │
│ 灯塔守夜人，第一章出场…                   │ ← summary, edits in place
│ ANALYSIS                                  │
│ ┌─────────────────────────────────┐       │
│ │ Role        守夜人              │       │
│ │ Appearance  青衫，声音很轻       │       │
│ │ Voice       …                   │       │
│ │ Arc         …                   │       │
│ └─────────────────────────────────┘       │
│ DETAILS                     ＋ Add a detail│ ← beyond name/alias/summary the
│ ┌─────────────────────────────────┐       │   schema is yours: cultivation
│ │ Age         27                  │       │   level, house, ship, species
│ │ Gender      …                   │       │
│ └─────────────────────────────────┘       │
│ RELATIONSHIPS          ＋ Add a relationship│
│ ┌─────────────────────────────────┐       │
│ │ 老陈          师父            ›  │       │
│ └─────────────────────────────────┘       │
│ Nobody else in this book yet.             │
│ WHERE THEY APPEAR                         │
│ ▁▂▅▇▃▁▁▂▇▅▃▁▁▁  ← tap a bar               │
│ Each bar covers 4 chapters — tap one      │
│ ch.1 – ch.4 · 6 mentions                  │
│ CHAPTER BY CHAPTER                12      │
│ ┌─────────────────────────────────┐       │
│ │ (1) 第一章 灯灭                 │       │ ← the badge is the chapter
│ │     青衫，声音很轻              │       │   number: an index means
│ └─────────────────────────────────┘       │   position
│ [ Delete this profile ]!                  │
└───────────────────────────────────────────┘
 Polish with AI:  Turns 12 chapter notes about this character into a
 profile: summary, role, appearance, voice and arc.
 Add a relationship ⇒ Search the cast, or type a new name
                      Create "老陈" and link
```

## Place profile  `app/place/[id].tsx`

Same page, different words — characters and places share one table with a
`kind`, since they differ only in what they are called.

```
 ‹ 《长夜纪》
 PLACE
 灯塔                             Also called  塔
 Other names, separated by commas
 A line or two about this place.
 WHERE IN THE BOOK
 First appears  ch.1        Last appears  ch.40
 SCENES HERE
 At the lighthouse       ch.12               ›
 No scenes recorded here yet.
 WHO IS HERE
 林小满            12 ch                      ›
 Nobody recorded here yet.
 CHAPTER BY CHAPTER
 Not recorded in any chapter yet.
```

## Relationship graph  `app/book/[id]/graph.tsx`

```
┌───────────────────────────────────────────┐
│ ‹  Relationship graph                     │
│          ╭──────────────╮                 │
│          │  ◯ 林小满    │                 │  hand-rolled layout
│          │    ╱    ╲    │                 │
│          │ ◯ 老陈  ◯ 阿九│                 │
│          ╰──────────────╯                 │
│  tap a node ─▶ that profile               │
│ empty  Add relationships to see the graph.│
└───────────────────────────────────────────┘
```
