# UI/UX mockups — Novel Man

Every surface drawn as it is built today. `../UIUX_DESIGN.md` carries the
rules, flows and reasoning; these files carry the pictures.

Glyphs follow the `uiux` skill (`references/notation.md` + `text-figma.md`):
`─●` on · `○─` off · `( A )( B )` chips (selected filled) · `[[ x ]]` primary ·
`[ x ]` secondary · `›` pushes · `▾` opens a sheet · `⟳` working · `←`
annotation · `!` destructive · `·` disabled · `[brackets]` = sheet.

## Screen map

```
 launch
   │
   ▼
 app/index.tsx — Shelf: search, library grid, then Settings as sections
   │  ＋ ─▶ app/add.tsx — kind first, then source, then that kind's options
   │         └─ source/find ─▶ source/work ─▶ [Import preview]
   │  Analysis queue ─▶ [Work]  Language / Appearance ─▶ [pickers]
   │  Public sources ─▶ settings/source/[id]
   │  AI keys ─▶ ai-key/[id]    Cloud ─▶ settings/cloud-library
   │  cover ▼
 app/book/[id].tsx — the book hub, one page
   ├─ [[ Continue · Chapter 12 ]] ─▶ app/reader/[id].tsx
   │        └─ sentence menu · [Reading settings] · [Share card]
   ├─ Books (scripture) ─▶ the part's chapters ─▶ chapter/[id]
   ├─ Inside   ─▶ book/[id]/structure ─▶ chapter/[id]
   │            ─▶ book/[id]/scenes    ─▶ scene/[id]
   │            ─▶ book/[id]/notes
   ├─ Characters ─▶ entity/[id]        Places ─▶ place/[id]
   │  All characters ─▶ book/[id]/cast ─▶ book/[id]/graph
   ├─ Utilities ─▶ book/[id]/translation ─▶ book/[id]/terms
   │            ─▶ book/[id]/script
   └─ Export ─▶ [Export sheet]         Delete book !
```

## Files

| File | Covers |
|---|---|
| `shelf.md` | the shelf page, search, import, public sources, settings sections |
| `book.md` | the book hub and its sheets |
| `reader.md` | reader chrome, sentence menu, reading settings, share card |
| `structure.md` | chapter list, chapter page, scenes |
| `cast.md` | cast, character/place profiles, relationship graph |
| `translation.md` | translation, glossary, sentence editor, screenplay |
| `notes.md` | notes and highlights |
| `scripture.md` | a bible: downloading one, parts and verses, references |
| `sources.md` | the public sources: eBible, Gutenberg, arXiv, and the rules they follow |
| `cloud.md` | AI keys, cloud backup, work queue, cloud library, restore |
| `components.md` | the shared primitives every page is built from |
