# Notes & highlights

`app/book/[id]/notes.tsx` — per book, grouped by chapter in **reading
order**, not by date.

```
┌───────────────────────────────────────────┐
│ ‹  Notes                             ⇪    │ ← ⇪ = export these
│ ┌───────────────────────────────────────┐ │
│ │ 🔍 Search notes and highlights        │ │
│ └───────────────────────────────────────┘ │
│ ( ALL )( Highlights )( Notes )( Bookmarks)│
│ Chapter 3                                 │
│ ┌───────────────────────────────────────┐ │
│ │ ▌"…the river had risen past the       │ │ ← ▌ carries the highlight
│ │ ▌ second step."                       │ │   colour
│ │   check this against ch.20            │ │
│ │   Sep 14                          ⋯   │ │
│ └───────────────────────────────────────┘ │
│ Unplaced                                  │ ← the sentence moved under it
│ ┌───────────────────────────────────────┐ │   (a re-detect); the note is
│ │ ▌"…"                              ⋯   │ │   kept, never dropped
│ └───────────────────────────────────────┘ │
│ empty    Highlights and notes you make    │
│          while reading show up here.      │
│ no hits  Nothing matches.                 │
│ ⋯ ▸ Jump to · Edit · Share · Delete !     │
│      ⇒ Delete this highlight?             │
└───────────────────────────────────────────┘
```

Tapping a row opens the reader at that offset and briefly flashes the
sentence — jumping to a note has to land **on** it, not near it.

## Writing one

```
 sentence menu ▸ Note ↓
 ┌──────────────────────────────────────┐
 │ What do you want to remember about   │
 │ this?                                │
 └──────────────────────────────────────┘
      ( Cancel )        [[ Save ]]
```
