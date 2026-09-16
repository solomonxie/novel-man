# UI/UX Design — Novel Man

Interface only. Product reasoning in [DESIGN.md](DESIGN.md).

Written against the `uiux` skill: `references/foundations.md`,
`references/mobile.md`, and the `media-library`, `byo-ai-keys`,
`credentials`, `cloud-bucket-sync`, `backup-restore`, `paste-to-fill`
patterns. Reader interaction takes 微信读书 as the reference bar.


## Screens & surfaces

| Surface | Kind | Why it's this kind |
|---|---|---|
| **Shelf** | page (tab root) | Home. Cover grid of books (`media-library`). |
| Add book | menu → sheet per source | The source choice is one tap from ⊕; each source then gets the sheet it needs. |
| Import | full sheet | Multi-step (fetch → parse → preview → detect), cancellable without losing the fetched file. |
| **Book** | page | The hub. Everything about one book lives here and nowhere else. |
| **Reader** | page, chrome-hidden | The screen the app is used in. Full bleed, no tab bar. |
| Sentence actions | popover anchored to the sentence | Must not cover what it acts on. Never a bottom sheet. |
| Note editor | half sheet | One field over the quoted sentence. |
| Reading settings | half sheet | Live preview — applies to the page behind it. |
| Structure editor | page | Merge/split/reorder needs room and a persistent edit mode. |
| Notes & highlights | page, pushed from Book | Per-book, searchable. |
| Cast / relation graph | page, pushed from Book | Graph needs the full screen. |
| Export | full sheet | Format choice → options → destination. |
| Settings | page (tab root) | AI keys, language, cloud, backup. |
| Add AI key | half sheet | Two fields (`byo-ai-keys`). |
| Cloud connection | full sheet | Variable fields, paste mode, save-time verification (`cloud-bucket-sync`). |
| Cloud library | page, pushed from Settings | Lists the bundles in the bucket so one book can be pulled back. |
| Sync queue | sheet | Global across connections, surfaced once (`cloud-bucket-sync`). |

Two tabs: **Shelf · Settings**. Notes, Cast and Export are *per book*, so they
push from the Book page rather than becoming tabs — a top-level "Notes" tab
would force a book picker inside it.


## Flows

### Adding a book — one pipeline, four doors

```
Shelf  ⊕
   │
   ├─ From Files…      ── OS document picker ──┐   Drive / iCloud / Dropbox /
   │                                            │   OneDrive all appear here
   ├─ From a link…     ── paste URL ───────────┤   free, with no OAuth
   │                      (Google Docs share    │
   │                       link → export?format │
   │                       =docx, transparently)│
   ├─ From cloud backup ─ bucket bundle list ──┤
   │                                            │
   └─ (Share sheet, from any other app) ───────┘
                                                │
                     ┌──────────────────────────┘
                     ▼
        copy into app storage, sha256-named   ← ALWAYS first. Picker paths are
                     │                          temporary; container UUIDs
                     │                          change on reinstall
                     ▼
              ┌── unsupported type ─▶ ⚠ inline, sheet stays open, file kept
              │
              ├── link needs sign-in ─▶ ⚠ "This doc isn't shared. Open it in
              │                            Drive and use Share → Open in…"
              ▼
            parse ──┬─ 0 chars ─▶ ⚠ "No text found. Scanned PDF?"  nothing saved
                    ▼
        ┌── EXTRACTED TEXT PREVIEW ──┐   ← PDF only. Prose comes out scrambled
        │  first ~40 lines           │     often enough that committing blind
        │  [Looks wrong] [Continue]  │     is wrong
        └────────────────────────────┘
                    ▼
       heuristic chapter detection   (offline, instant, 0 tokens)
                    │
          ┌─────────┴──────────┐
      confident              unsure (no headings, or <3 hits in 300k words)
          │                      │
          │        ┌─────────────▼─────────────────────┐
          │        │ Couldn't find chapter headings.   │
          │        │ [Detect with AI]  ~4 requests     │ ← cost stated BEFORE
          │        │ [Split on blank lines]            │   spending; row hidden
          │        │ [Keep as one chapter]             │   entirely when no key
          │        └───────────────────────────────────┘   is configured
          ▼                      ▼
          └──────▶ Book page, chapters ready ──▶ [Start reading]
```

A `.nmbak` bundle entering by any of these doors is recognised and routed to
restore instead of parse — same door, different handler.

### Reading → sentence action

The core interaction. One tap, no drag handles, menu never covers the target:

```
  tap a sentence
        │
        ▼
  sentence fills with a soft tint  ← the whole sentence, so the tap target and
        │                            the acted-on span are the same thing
        ▼
  ┌──────────────────────────────────────────┐
  │  Copy   Highlight ▾   Note   Share   ⋯   │ ← anchored ABOVE the sentence;
  └──────────────────▼───────────────────────┘   flips below near the top edge.
        the sentence being acted on              Never a bottom sheet — that
        │                                        hides the text
        ├─ Copy       ─▶ dismiss + brief toast
        ├─ Highlight ─▶ default colour instantly; ▾ or long-press for the
        │                colour row. Tapping an existing highlight reopens
        │                this menu with Remove in place of Highlight
        ├─ Note      ─▶ half sheet, sentence quoted above the field
        ├─ Share     ─▶ rendered quote card
        └─ ⋯         ─▶ Extend selection · Look up · Translate · Copy with source
```

**Extend selection** is the escape hatch, not the default: it converts the
tinted sentence into an ordinary two-handle selection across sentences. The
common case never touches a handle.

### Reading chrome

```
  tap the CENTRE of the page (not a sentence)  ─▶ toggle chrome
  tap left / right third                       ─▶ page back / forward (paginated)
  swipe                                        ─▶ page (paginated) / scroll
  swipe down from the top                      ─▶ chapter list
  long-press a sentence                        ─▶ falls through to OS selection
```

Chrome starts hidden; entering the reader shows it for ~1.5s then fades, so the
controls are discoverable once without being permanent.

### Export

```
Book  ⋯  ─▶ Export
   │
   ▼
┌──────────────────────────────────────────────┐
│  Manuscript      .txt .md .docx .epub .pdf   │ ← one-way formats carry the
│  Annotations     .md  .csv                   │   label, not a warning icon
│  Character bible .md  .docx      (needs cast)│
│  Backup bundle   .nmbak                      │
└──────────────────────────────────────────────┘
   │
   ▼  options for that format (include annotations? cover? chapter numbering?)
   │
   ▼  destination ─▶ Share sheet · Save to Files · Cloud bucket
```

Export always renders from the normalized text plus the **current** structure,
so hand-made chapter fixes are in every output.

### Backup and restore (`backup-restore`)

```
  LOCAL                            CLOUD (same bundle, different destination)
  Export bundle ─▶ Files/Share     Back Up Now ─▶ queue ─▶ bucket/<prefix>/
  Import bundle ─▶ file picker     Cloud Library ─▶ pick a bundle ─▶ restore
  Restore Latest ─▶ auto-snapshot
     (never needs a picker)

  RESTORE, either source:
    confirm, restating what it does
        ▼
    creates a NEW book / dataset — never overwrites what's there
        ▼
    match on natural keys (source hash, title, offsets), never local UUIDs
        ▼
    result screen: "Restored 1 book · 412 annotations · 3 couldn't be placed"
                                                        ▲ reported, not dropped
```


## Layout sketches

### Shelf (`media-library` grid)

```
┌───────────────────────────────────────────┐
│ Shelf                                   ⊕ │ ← large title
│ 🔍 Search books                           │
│                                           │
│ Reading                                   │ ← bold section header
│ ┌───────┐ ┌───────┐                       │
│ │       │ │       │                       │ ← generated cover when the file
│ │ cover │ │ cover │                       │   has none: title typeset on a
│ │       │ │      ◌│                       │   colour derived from the title
│ └───────┘ └───────┘                       │   ◌ = not yet backed up. ONLY the
│ The Second  Ash Lane                      │   exceptional state is badged —
│ 37% · ch.12 12%                           │   a healthy shelf reads clean
│                                           │
│ Library                                   │
│ ┌───────┐ ┌───────┐ ┌───────┐             │
│ │       │ │      ☁│ │      ⚠│             │ ← ☁ = in cloud, not on device
│ └───────┘ └───────┘ └───────┘             │   ⚠ = structure needs review
│                                           │
└───────────────────────────────────────────┘
   long-press a cover ─▶ context menu:
       Open · Continue reading · Export · Back up now · Rename · Delete
   (per-item actions live here, never as persistent on-tile buttons)
```

Multi-select reuses the same tile with a checkmark overlay — no separate mode
screen. Cover image source falls through: embedded cover → user-set image →
generated → placeholder; the cache is a fallback, never the preference.

### Book — the hub

```
┌───────────────────────────────────────────┐
│ ‹                                       ⋯ │ ← ⋯ : Export · Back up · Re-detect
│ ┌───────┐                                 │       structure · Replace source ·
│ │ cover │  The Second Step                │       Rename · Delete
│ │       │  Imported from ash-lane.docx    │
│ └───────┘  312,400 words · 47 ch · 21h    │ ← "words" vs "characters" per the
│                                           │   manuscript's own language
│ ┌───────────────────────────────────────┐ │
│ │        ▶  Continue · Chapter 12       │ │ ← the one primary action
│ └───────────────────────────────────────┘ │   ("Start reading" before first open)
│                                           │
│ CHAPTERS                            Edit  │
│ ┌───────────────────────────────────────┐ │
│ │ 1  Crossing               2,140 · 9m  │ │
│ │ 2  The House at Ash Lane  3,002 · 12m✎│ │ ← ✎ = user-edited, so re-detection
│ │ 3  Untitled               1,870 · 7m ⚠│ │   leaves it alone
│ │             Show all 47  ›            │ │ ← ⚠ = heuristics weren't confident
│ └───────────────────────────────────────┘ │
│                                           │
│ NOTES                               412 › │
│ CAST                    Analyse · ~47 req │ ← accent text control; the cost
│ Not analysed yet.                         │   IS the label
│ SCRIPT & STORYBOARD         Coming soon   │ ← visibly listed, honestly disabled
│                                           │
│ Backed up 2 hours ago · ash-lane.docx  ›  │ ← provenance + backup state, one line
└───────────────────────────────────────────┘
```

### Reader — chrome hidden

```
┌───────────────────────────────────────────┐
│                                           │ ← no nav bar
│   The rain had not stopped for three      │
│   days. ████████████████████████████████  │ ← highlight: background tint only,
│   ████████████, and the river had risen   │   no underline, no icon
│   past the second step.                   │
│                                           │
│   She went down anyway.¹                  │ ← superscript = a note exists
│                                           │
│   ┌─────────────────────────────────────┐ │
│   │ Copy  Highlight ▾  Note  Share  ⋯   │ │
│   └──────────────▼──────────────────────┘ │
│   ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │ ← tapped sentence, soft tint
│   ░░░░░░░░░░░░░░░░░░░░░░                  │
│                                           │
│ Chapter 12 · The Second Step        37%   │ ← always visible, small, dim.
└───────────────────────────────────────────┘   The one thing never hidden.
```

### Reader — chrome shown

```
┌───────────────────────────────────────────┐
│ ‹        Chapter 12 · The Second Step   ⋯ │ ← ⋯ : Bookmark · Notes in this
├───────────────────────────────────────────┤      chapter · Analyse chapter ·
│   The rain had not stopped for three      │      Edit structure · Export chapter
│   days. …                                 │
├───────────────────────────────────────────┤
│  Aa        ☀/☾        ≡ Chapters          │ ← three controls, nothing else
│ ▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░  37% · 8m left  │ ← scrub within the chapter
└───────────────────────────────────────────┘
```

### Reading settings (half sheet, live)

```
┌───────────────────────────────────────────┐
│                  ───                      │
│  Aa    ⊖ ──────●────────── ⊕    17pt      │
│                                           │
│  Theme  ( Paper )( Sepia )( Grey )( Night)│ ← applied live to the page behind
│  Font    Serif · Sans · System       ›    │   the sheet
│  Spacing Compact · Normal · Loose         │
│  Margins ⊖ ────●───── ⊕                   │
│  Page turn  Slide · Fade · Scroll         │ ← Scroll switches the reader to
│  Brightness ☀ ──────●──── ☾               │   continuous mode
│  Keep screen on                     [ ● ] │
└───────────────────────────────────────────┘
```

Serif/sans choice is per script — a font that's right for English isn't
necessarily right for Chinese, so the picker lists what's available for the
manuscript's script.

### Notes & highlights (per book)

```
┌───────────────────────────────────────────┐
│ ‹  Notes                             ⇪    │ ← ⇪ = export these
│ 🔍 Search notes and highlights            │
│ ( All )( Highlights )( Notes )( Marks )   │
│                                           │
│ Chapter 3                                 │ ← grouped by chapter in reading
│ ┌───────────────────────────────────────┐ │   order, not by date
│ │ ▌"…the river had risen past the       │ │
│ │ ▌ second step."                       │ │ ← ▌ carries the highlight colour
│ │   check this against ch.20            │ │
│ │   Sep 14                          ⋯   │ │ ← ⋯ : Jump to · Edit · Share · Delete
│ └───────────────────────────────────────┘ │
└───────────────────────────────────────────┘
```

Tapping a row opens the reader at that offset and briefly flashes the sentence
— jumping to a note has to land *on* it, not near it.

### Share card

```
┌─────────────────────────┐
│  "She went down         │ ← typeset in the reader's own font and theme
│   anyway."              │
│  ──────                 │
│  The Second Step        │
│  Chapter 12             │
└─────────────────────────┘
  Theme ( ○ ○ ○ ○ )
  [ Copy text ] [ Save image ] [ Share ]
```

Rendered locally into the OS share sheet. Nothing is posted anywhere.

### Settings — AI keys (`byo-ai-keys`)

```
AI KEYS                                Sequential ▾  ← order IS the fallback
Used by chapter detection and analysis. Keys never      order, so rows reorder
leave this device, including in backups.
┌─────────────────────────────────────────────────┐
│ OpenAI                             ↑   ↓    ⋯   │ ← ⋯ holds Delete: visible,
│ 128 requests                                    │   not a hidden long-press
├─────────────────────────────────────────────────┤
│                  + Add AI Key                   │ ← centered accent link
└─────────────────────────────────────────────────┘
```

Adding one is a half sheet and **Save is the test**: one real cheap request,
persisted only on success, spinner inline in the form, never an alert.
Autocorrect, smart quotes and smart dashes off on the key field
(`credentials`); a failed attempt is kept as a draft so a 40-character secret
never gets retyped.

### Settings — backup & cloud

```
BACKUP
Survives a bad import or a corrupt database —      ← states the REAL protection
not a lost phone. Copy the file off to keep it safe.  scope, not a reassurance
┌─────────────────────────────────────────────────┐
│ Export bundle…                              ›   │
│ Import bundle…                              ›   │
│ Restore Latest        auto-snapshot, 4h ago ›   │ ← never needs a file picker
└─────────────────────────────────────────────────┘

CLOUD                                              ← "Private Cloud": storage
Storage you own. Off by default.                     the user owns; Drive/Dropbox
┌─────────────────────────────────────────────────┐  are import sources, not this
│ ☁  Archive        s3://my-bucket/novels/    ›   │
│    Backed up 2 hours ago · 12 books              │
├─────────────────────────────────────────────────┤
│                  + Connect a bucket             │
└─────────────────────────────────────────────────┘
Sync queue: 12 pending · 2 at a time            ›  ← global, lives here ONCE
```

Add-connection form takes the whole credential block at once via paste-to-fill,
derives region rather than asking, and **Save proves the connection** with a
real scoped list call — failure keeps the sheet open with the provider's own
error code verbatim and stores nothing.

### Cloud library — pulling one book back

```
┌───────────────────────────────────────────┐
│ ‹  Archive                              ⋯ │ ← ⋯ : Sync: Manual ▸ · Sync Now ·
│ s3://my-bucket/novels/  ·  12 books       │      Sync Queue · Delete Connection
│                                           │
│ ┌───────┐ The Second Step                 │
│ │       │ 312k words · backed up Sep 14 ✓ │ ← ✓ = already on this device
│ ├───────┤ Ash Lane                        │
│ │       │ 98k words · Sep 2          [Get]│ ← not on device: one tap to pull
│ └───────┘                                 │
└───────────────────────────────────────────┘
```

Not a file browser — a list of the bundles this connection holds. Pulling one
runs the same restore path as a local bundle: confirm, create new, report what
couldn't be placed.


## States

| Screen | Empty | Loading | Error | Offline | First-run |
|---|---|---|---|---|---|
| Shelf | "No books yet." + ⊕ + one line on supported formats | covers fade in per tile; never a full-screen spinner | — | full function | same as empty, no tour |
| Import | — | the step that's running is named ("Downloading…", "Reading .docx…", "Finding chapters…"), not a bare spinner | inline in the sheet; sheet stays open, nothing saved, file kept | picker/local work; link + AI rows hidden | — |
| Book | no chapters → "Couldn't split this into chapters" + [Edit structure] | — | source file missing → "The original file is gone. Text and notes are safe." + [Replace source] | full function | — |
| Reader | empty chapter → "This chapter is empty" + [Edit structure] | first page paints from local DB; no spinner in normal use | "Couldn't open this chapter" + [Re-detect structure] | **fully offline — the point** | chrome shown ~1.5s, then fades |
| Sentence menu | — | — | copy/share failure → toast, menu stays | full function | first tap ever: one-time hint above the menu |
| Notes | "Highlights and notes you make while reading show up here." | — | — | full function | — |
| Cast | "Not analysed yet" + cost | per-chapter progress ("Chapter 7 of 47") + Cancel; partial results kept | failed chapters listed, retried individually — never a whole-run rollback | "Needs a connection" on the action only | — |
| Export | formats needing cast are listed disabled with why | "Building .epub…" with Cancel | inline, sheet stays open | local formats work; cloud destination disabled | — |
| AI keys | "+ Add AI Key" only | "⟳ Testing the key…" inline | vendor's own error code verbatim + a friendly line | "Couldn't reach OpenAI" | — |
| Cloud | "Your data stays on this device." + Connect | "Checking bucket access…" | `AccessDenied: …` verbatim; sheet open, nothing stored | queue holds and resumes; "Manual" fetches nothing | — |
| Restore | — | per-item progress | bundle too new → "Made by a newer version of the app." Nothing imported. | local bundle fine; cloud disabled | — |

Two partial states that matter:

- A book **detected but not analysed** is the normal, permanent state for most
  users. It must never look unfinished — no "complete setup" banner, no
  progress ring stuck at 1/3.
- A book **in the cloud but not on device** is a first-class shelf state (☁),
  not an error. Tapping it offers to pull it down.


## Components & copy

New or non-standard:

- **`<Sentence>`** — the atom of the reader. A tappable span with four visual
  states: plain · tinted (acted on) · highlighted (4 colours) · highlighted +
  noted (superscript). Must hit-test the full line-box including trailing
  space, or short sentences become unhittable.
- **Anchored action menu** — positions above the target span, flips below near
  the top edge, clamps to the margin horizontally, dismisses on tap-elsewhere
  and on page turn.
- **Cost-stating action** — an accent *text* control whose label carries the
  price (`Analyse · ~47 requests`). Used wherever an AI call is spent. Never a
  filled button: spending money is not the primary action on any screen.
- **Confidence marker `⚠`** — on a chapter row the heuristics were unsure
  about. Tapping explains why and offers the fix.
- **Cover** — falls through embedded → user-set → generated (title typeset on a
  colour derived from the title hash) → placeholder. Never blank.

Copy — real strings, both languages (`en` is the source of truth):

| Where | English | 简体中文 |
|---|---|---|
| Shelf empty | `No books yet.` / `Import a .txt, .md, .docx, .epub or .pdf to start.` | `还没有书。` / `导入 .txt、.md、.docx、.epub 或 .pdf 开始。` |
| Add menu | `From Files…` / `From a link…` / `From cloud backup…` | `从文件…` / `从链接…` / `从云端备份…` |
| PDF preview | `This is what we could read from the PDF. Scanned pages come out blank.` | `这是从 PDF 中读取到的内容。扫描件会是空白。` |
| No text | `No text found in this file. If it's a scanned PDF, the pages are images — we can't read those.` | `文件中没有找到文字。如果是扫描版 PDF，页面是图片，无法读取。` |
| Private Google Doc | `This doc isn't shared. Open it in Drive and use Share → Open in…` | `该文档未开放共享。请在 Drive 中打开，使用「分享 → 用其他应用打开」。` |
| Detection unsure | `Couldn't find chapter headings.` | `没有找到章节标题。` |
| AI option | `Detect with AI · ~4 requests` | `用 AI 识别 · 约 4 次请求` |
| AI hint | `Sends a short excerpt, not the whole manuscript.` | `只发送一小段内容，不是整本书。` |
| First sentence tap | `Tap any sentence to highlight, note or share it.` | `点按任意句子，即可标注、写想法或分享。` |
| Note sheet | `Note` / `What's worth remembering here?` | `想法` / `这里有什么值得记下来的？` |
| Keys hint | `Used by chapter detection and analysis. Keys never leave this device, including in backups.` | `用于章节识别与分析。密钥只保存在本机，备份中也不包含。` |
| Key billing | `Requests are billed to your own OpenAI account.` | `请求会计入你自己的 OpenAI 账户。` |
| Analyse confirm | `Analyse 47 chapters? This sends chapter text to OpenAI and costs about 47 requests.` | `分析 47 章？会将章节正文发送给 OpenAI，约消耗 47 次请求。` |
| Re-detect warning | `Chapters you renamed or split by hand will be kept.` | `你手动改名或拆分过的章节会保留。` |
| Cloud empty | `Your data stays on this device. Connect a bucket you own to sync it across devices.` | `数据只保存在本机。连接你自己的存储桶即可跨设备同步。` |
| Backup scope | `An on-device snapshot survives a bad import — not a lost phone. Copy the file off to keep it safe.` | `本机快照能应对导入出错，但手机丢了就没了。请把文件另存一份。` |
| Bundle too new | `Made by a newer version of the app.` | `该备份来自更新版本的应用。` |
| Restore result | `Restored 1 book · 412 annotations · 3 couldn't be placed` | `已恢复 1 本书 · 412 条标注 · 3 条无法定位` |
| Export one-way | `PDF export is one-way — it can't be imported back.` | `PDF 为单向导出，无法再导入。` |

Tone, both languages: state what happens and what it costs. No exclamation
marks, no encouragement, no "✨ AI-powered". The Chinese is written, not
translated — it should read as if drafted in Chinese.


## Localisation in the layout

- **UI language ≠ manuscript language.** Two separate settings; an
  English-speaking editor on a Chinese manuscript is ordinary. UI follows the
  device locale on first launch, falls back to `en`.
- Chinese runs ~40% shorter than English for the same string: never size a
  control to its label. Buttons and menu rows must survive both, so no
  fixed-width tab bars or truncation-prone single-line rows.
- Counts are `Intl`-formatted and unit-aware — `312,400 words` vs `31.2万字`,
  with the unit chosen by the **manuscript's** language, not the UI's.
- CJK text needs looser default line-height than Latin; the reader's Spacing
  presets resolve to different values per script.
- Punctuation-aware sentence tapping differs by script (`。！？…「」` vs
  `.!?"`), which is the segmenter's job, not the view's.


## Platform notes

- Sentence tap must not fight OS selection: long-press falls through to native
  selection deliberately, so the behaviour people know still exists.
- iOS back-swipe is disabled in the reader's paginated mode (it conflicts with
  page-back on the left third); `‹` in the chrome is the way back, one tap away.
- Android hardware back leaves the reader rather than paging back.
- Safe areas: the chapter/progress footer sits above the home indicator; the
  anchored menu never enters a safe-area inset.
- Share-sheet ingestion registers the app as a handler for the supported
  document types on both platforms — that's what makes "Open in Novel Man"
  work from Drive, Mail and Files.
- Dynamic Type / font scale is respected in all chrome; the reading text size
  is the app's own setting, deliberately independent of it.


## Deviations from the `uiux` skill

- `references/foundations.md` and `references/mobile.md` are currently
  unfilled (all TODO), so layout, type, colour and gesture decisions here are
  local and should be re-checked against those files once written.
- `my-mobile-design-guideline.md`, referenced by several pattern files, doesn't
  exist in the skill; section anatomy follows the ASCII layouts in
  `byo-ai-keys.md` and `cloud-bucket-sync.md` directly.
- `cloud-bucket-sync.md` assumes the bucket is browsable content. Here it's a
  backup target, so there's no recursive folder browser — one connection, a
  flat list of book bundles, one global sync queue, per that file's own
  "cloud is a SIDE FEATURE" branch.
- `media-library.md` groups tiles under date headers; the shelf groups by
  reading state instead (Reading / Library), because a book's last-opened date
  is not how anyone looks for a book they're mid-way through.
