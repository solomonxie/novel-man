# UI/UX Design — Novel Man

Interface only. Product reasoning in [DESIGN.md](DESIGN.md).

Written against the `uiux` skill: `references/foundations.md`,
`references/mobile.md`, and the `media-library`, `byo-ai-keys`,
`credentials`, `cloud-bucket-sync`, `backup-restore`, `paste-to-fill`
patterns. Reader interaction takes 微信读书 as the reference bar;
information architecture follows `bring-your-own-photos`, and AI settings
follow `bring-your-own-podcasts`.

**One page, no tab bar.** If the content is one library, it's one scrollable
page with stacked sections — a tab per section is a tab standing in for a
section. Everything about a book hangs off that book's own page; nothing is
reachable only through a tab.


## Screens & surfaces

| Surface | Kind | Why it's this kind |
|---|---|---|
| **Home** | one scrollable page | Search · Reading · Library · Settings. No tabs. |
| Add book | menu → sheet per source | The source choice is one tap from ⊕; each source then gets the sheet it needs. |
| Import | the queue sheet | Multi-step (fetch → parse → preview → detect) and cancellable without losing the fetched file. Built as the queue sheet rather than a second surface: imports run in the background, so the list of them *is* the import screen. |
| **Book** | page | The hub. Everything about one book lives here and nowhere else. |
| **Reader** | page, chrome-hidden | The screen the app is used in. Full bleed, no tab bar. |
| Sentence actions | popover anchored to the sentence | Must not cover what it acts on. Never a bottom sheet. |
| Note editor | half sheet | One field over the quoted sentence. |
| Reading settings | half sheet | Live preview — applies to the page behind it. |
| Structure editor | page | Merge/split/reorder needs room and a persistent edit mode. |
| Notes & highlights | page, pushed from Book | Per-book, searchable. |
| Cast / relation graph | page, pushed from Book | Graph needs the full screen. |
| Translation | page, pushed from Book | Owns the run, the unit list and the glossary entry point. |
| Bilingual reader | the reader, in a second mode | Reading a translation is still reading; a separate screen would fork every reader feature. |
| Unit editor | half sheet | Source above, target editable below, diff marks inline. |
| Glossary | page, pushed from Translation | A searchable list that grows to hundreds of entries. |
| Term editor | inline on the Glossary row | Built inline rather than as a sheet: three fields is less than the sheet that would frame them, and editing in place keeps the surrounding terms visible for consistency. |
| Export | full sheet | Format choice → options → destination. |
| Settings | sections on Home | Every one, including AI keys, backup and cloud. Nothing pushes to a settings page, because there isn't one. |
| Add AI key | full sheet | Two fields plus a vendor list and a save that makes a real request (`byo-ai-keys`). |
| Cloud connection | form inside the Cloud section | Variable fields, paste mode, save-time verification (`cloud-bucket-sync`). Inline rather than in a sheet so a failed save keeps the draft on screen next to the bucket list that explains it. |
| Cloud library | page, pushed from Settings | Lists the bundles in the bucket so one book can be pulled back. |
| Sync queue | part of the Cloud section | Global across connections, surfaced once (`cloud-bucket-sync`). Not a sheet: it is only ever read from where the work is started. |
| Screenplay | page, pushed from Book | A formatted script needs the full width, and its exports are its own. |
| Paid run | dialog | Every AI pass wears the same one: what it does, what it is estimated to cost, Run, and a Stop that cancels the requests. |

No tabs at all. Notes, Cast, Places, Translation and Export are *per book*, so
they live on the Book page — a top-level "Notes" tab would force a book picker
inside it. Settings is a section at the bottom of Home, not a destination of
equal weight to the library.


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

A `.nmbak` bundle entering by any of these doors is recognized and routed to
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
        ├─ Highlight ─▶ default color instantly; ▾ or long-press for the
        │                color row. Tapping an existing highlight reopens
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
  tap the CENTER of the page (not a sentence)  ─▶ toggle chrome
  tap left / right third                       ─▶ page back / forward (paginated)
  swipe                                        ─▶ page (paginated) / scroll
  swipe down from the top                      ─▶ chapter list
  long-press a sentence                        ─▶ falls through to OS selection
```

Chrome starts hidden; entering the reader shows it for ~1.5s then fades, so the
controls are discoverable once without being permanent.

### Translating a book

```
Book ─▶ Translation ─▶ [ Target language ▾ ]
                              │
                              ▼
              ┌──────────────────────────────────────────┐
              │ Before we start                          │  ← candidate terms are
              │ 41 names and terms appear 3+ times and   │    surfaced BEFORE the
              │ aren't in your glossary yet.             │    run, not discovered
              │ [ Review them ]   [ Translate anyway ]   │    on chapter 300
              └──────────────────────────────────────────┘
                              │
                              ▼
              chapters queued one by one (visible queue)
                              │
         ┌────────────────────┴────────────────────┐
         │                                          │
   aligned ✓                              count mismatch ✗
   units stored                           retry that chapter at a
         │                                smaller batch, then flag it
         ▼
   read it bilingually, edit any line
         │
         ▼
   an edit is kept as a DIFF, not an overwrite
         │
         ├─▶ [Save as term]     ─▶ Glossary, applies to every later chapter
         └─▶ kept as memory      ─▶ quoted to the model on nearby sentences
```

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

### Home — one page

```
┌───────────────────────────────────────────┐
│ 🔍 Search books                           │ ← search is the top of the page,
├───────────────────────────────────────────┤   not behind a nav-bar icon
│ Importing · big.docx        47%       ›   │ ← queue strip, only while active
│                                           │
│ Library           Show 4 more          ＋ │ ← ＋ sits on the row that names
│ ┌───────┐ ┌───────┐ ┌───────┐             │   what it adds to
│ │ cover │ │ cover │ │ cover │             │
│ └───────┘ └───────┘ └───────┘             │   three across, two rows, most
│ 《系统…》  Ash Lane   The Sec…             │   recently read first
│ 14%       138.1万字   2%                   │
│ ┌───────┐ ┌───────┐ ┌───────┐             │
│ │ cover │ │ cover │ │ cover │             │
│ └───────┘ └───────┘ └───────┘             │
│                                           │
│ SETTINGS                                  │ ← a section, not a tab, and flat
│ ┌───────────────────────────────────────┐ │   all the way down: no settings
│ │ Language                    English   │ │   page exists at all
│ │ Appearance                   System   │ │ ← picking a value opens a sheet
│ └───────────────────────────────────────┘ │   over the page, never a push
│                                           │
│ AI KEYS                      Sequential   │ ← the fallback strategy is the
│ ┌───────────────────────────────────────┐ │   section's own action
│ │ OpenAI              12 requests ↑↓ ⋯  │ │
│ │ ＋ Add AI Key                         │ │
│ └───────────────────────────────────────┘ │
│                                           │
│ BACKUP                                    │
│ ┌───────────────────────────────────────┐ │
│ │ Export the whole library              │ │
│ │ Restore from a file…                  │ │
│ └───────────────────────────────────────┘ │
│                                           │
│ PRIVATE CLOUD                             │ ← its own section: storage you
│ ┌───────────────────────────────────────┐ │   own, named as the user thinks
│ │ my-manuscripts    bucket/prefix    ›  │ │   of it. The › goes to what's
│ │ Connect a bucket                      │ │   *in* the bucket — a different
│ └───────────────────────────────────────┘ │   place, not a settings page
│ Storage you own. Off by default.          │
└───────────────────────────────────────────┘
```

**A page whose only job is holding links gets deleted.** Settings had exactly
that shape twice over: a row pushing a page of four rows, three of which
pushed pages of their own. Every one of those pages is now a section here, and
`app/settings/` holds a single screen — the cloud library, which browses what
is *in* a bucket rather than configuring it.

The only rows left that push are the ones that lead somewhere genuinely else.
A row that leads to more settings is a row that shouldn't exist.

**One shelf, not two.** Reading and Library were separate rows, with Library
holding everything — which meant that with one book in progress the same cover
appeared twice, one above the other, and the second row said nothing the first
hadn't. Sorting by last-read gives what the Reading shelf was for: the book you
had open is first. A tile shows how far in you are if you've started it, and
how long it is if you haven't.

The grid is three across and two rows deep — six covers, which is as much as
fits before Settings is pushed off the page. Past that, **Show N more**; the
count is in the label so the tap is a known quantity. Cover falls through:
user-set image → generated (title on a color derived from the title) →
placeholder. Never blank.

### Book — the hub, as one page with clear sections

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
│ CHAPTERS                                  │
│ ┌───────────────────────────────────────┐ │
│ │ Jump to chapter              509   ›  │ │ ← 509 chapters is a PICKER, not a
│ └───────────────────────────────────────┘ │   section. Collapsed by default;
│ NOTES                                     │   the sheet is searchable and
│ ┌───────────────────────────────────────┐ │   marks ⚠ low-confidence ones
│ │ Highlights and notes          12   ›  │ │
│ └───────────────────────────────────────┘ │
│                                           │
│ CHARACTERS                             ＋ │
│ ┌───────────────────────────────────────┐ │
│ │ 沈墨                        老沈   ›  │ │ ← each opens its own profile page
│ └───────────────────────────────────────┘ │
│ PLACES                                 ＋ │
│                                           │
│ SECTIONS                                  │ ← named honestly as unbuilt
│ ┌───────────────────────────────────────┐ │   rather than hidden
│ │ Story arcs              Coming soon   │ │
│ │ Translations            Coming soon   │ │
│ │ Illustrations           Coming soon   │ │
│ │ Animations              Coming soon   │ │
│ └───────────────────────────────────────┘ │
└───────────────────────────────────────────┘
```

**The header IS the edit form.** Title, author, year and edition are editable
where they're displayed, committing on blur. The first build had both a header
*and* a Details section repeating the same four values — the same information
twice, with the copy you can't touch on top. The cover carries a small ✎ badge
in its corner rather than a stray `+` floating beneath it, which named nothing.

**No control that does nothing.** An "Edit" action sat on the chapter heading
wired to an empty handler because the structure editor isn't built. A dead
control is worse than a missing one; it was removed until T3.6 lands.

### Character / place profile

One page per named thing in the story, modeled on `bring-your-own-photos`'
person profile — because a character *is* a person as far as the interface is
concerned.

```
┌───────────────────────────────────────────┐
│ ‹ 《系统代理人》         沈墨              │
│                 ╭───────╮                 │
│                 │  沈墨  │                 │ ← initials fallback; CJK takes the
│                 ╰───────╯                 │   first two characters, Latin the
│                     ＋                    │   initials. Tap to set a portrait
│                   沈墨                     │ ← name edits in place
│ ┌───────────────────────────────────────┐ │
│ │ Alias      老沈                        │ │
│ │ Summary    系统绑定者，第一章出场…      │ │
│ └───────────────────────────────────────┘ │
│                                           │
│ DETAILS                                ＋ │
│ ┌───────────────────────────────────────┐ │
│ │ 年龄    27                         ✕  │ │ ← user-defined label/value pairs
│ │ 阵营    代理人协会                  ✕  │ │
│ │ 能力    时间回溯                    ✕  │ │
│ └───────────────────────────────────────┘ │
└───────────────────────────────────────────┘
```

**Beyond name/alias/summary the schema is user-defined**, because what matters
about a character is genre-specific — cultivation level, house, ship, species,
rank. A fixed set of fields would be wrong for most books and padded for the
rest. Characters and places share one table with a `kind`, since they differ
only in what they're called.

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
├───────────────────────────────────────────┤      chapter · Analyze chapter ·
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

### Bilingual reader

```
┌───────────────────────────────────────────┐
│ ‹     Chapter 12 · 中↔EN           Aa  ⋯ │ ← the language pair, not a flag
├───────────────────────────────────────────┤
│  雨已经下了三天没有停，河水涨过了        │ ← source, dimmed
│  第二级台阶。                             │
│  The rain had not stopped for three       │ ← target, full contrast:
│  days, and the river had risen past       │   you are reading THIS
│  the second step.                         │
│                                           │
│  她还是下去了。                           │
│  She went down anyway. ~~˜~~              │ ← subtle underline = edited,
│                                           │   differs from the machine output
│  ┌─────────────────────────────────────┐ │
│  │ Edit   Original   Term   Copy   ⋯   │ │ ← same anchored menu as the
│  └──────────────▼──────────────────────┘ │   monolingual reader; "Original"
│                                           │   shows what the model first said
└───────────────────────────────────────────┘
   ⋯ on the nav bar: Source only · Target only · Both ▸
```

Reading mode is a display choice, not a separate screen — the sentence tap,
highlights and notes all work the same in all three.

### Unit editor (half sheet)

```
┌───────────────────────────────────────────┐
│ Cancel            Sentence          Save  │
├───────────────────────────────────────────┤
│ 她还是下去了。                            │ ← source, not editable
│                                           │
│ She went down ~~regardless~~ anyway.      │ ← diff vs. the machine output:
│                                           │   strikethrough = removed,
│ ┌───────────────────────────────────────┐ │   underline = added
│ │ She went down anyway.                 │ │ ← the editable field
│ └───────────────────────────────────────┘ │
│                                           │
│ [ Revert to original ]                    │
│ [ Save “regardless → anyway” as a term ]  │ ← one tap promotes the diff into
└───────────────────────────────────────────┘   the glossary
```

### Glossary

```
┌───────────────────────────────────────────┐
│ ‹  Glossary · English                 ⊕   │ ← per target language
│ 🔍 Search                                 │
│ ( All )( Characters )( Places )( Terms )  │
│                                           │
│ CHARACTERS                                │
│ ┌───────────────────────────────────────┐ │
│ │ 沈墨          Shen Mo            🔒   │ │ ← 🔒 = locked: a hard constraint
│ │ 老陈          Old Chen                │ │   in the prompt, not a hint
│ ├───────────────────────────────────────┤ │
│ │ 系统代理人    System Agent       🔒   │ │
│ └───────────────────────────────────────┘ │
│                                           │
│ SUGGESTED                          41  ›  │ ← proper nouns seen 3+ times that
│ Seen often, not in your glossary yet.     │   nobody has decided on
└───────────────────────────────────────────┘
```

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
│ │ ▌ second step."                       │ │ ← ▌ carries the highlight color
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
| Translation | "Not translated yet" + language picker + cost | per-chapter progress with Cancel; finished chapters stay readable | a chapter that fails alignment is flagged and retried alone, never rolling back the book | "Needs a connection" on the action only | candidate-term review offered once, skippable |
| Glossary | "No terms yet. Add names you want translated consistently." | — | — | full function | seeded from the cast analysis when that has run |
| Cast | "Not analyzed yet" + cost | per-chapter progress ("Chapter 7 of 47") + Cancel; partial results kept | failed chapters listed, retried individually — never a whole-run rollback | "Needs a connection" on the action only | — |
| Export | formats needing cast are listed disabled with why | "Building .epub…" with Cancel | inline, sheet stays open | local formats work; cloud destination disabled | — |
| AI keys | "+ Add AI Key" only | "⟳ Testing the key…" inline | vendor's own error code verbatim + a friendly line | "Couldn't reach OpenAI" | — |
| Cloud | "Your data stays on this device." + Connect | "Checking bucket access…" | `AccessDenied: …` verbatim; sheet open, nothing stored | queue holds and resumes; "Manual" fetches nothing | — |
| Restore | — | per-item progress | bundle too new → "Made by a newer version of the app." Nothing imported. | local bundle fine; cloud disabled | — |

Two partial states that matter:

- A book **detected but not analyzed** is the normal, permanent state for most
  users. It must never look unfinished — no "complete setup" banner, no
  progress ring stuck at 1/3.
- A book **in the cloud but not on device** is a first-class shelf state (☁),
  not an error. Tapping it offers to pull it down.


## Light and dark

Two separate things, and conflating them is the mistake to avoid:

- **Appearance** (System · Light · Dark) themes the *interface* — shelf, book
  page, sheets, settings. System is the default and what most people leave it
  on; the override exists for the same reason the language override does, and
  sits beside it.
- **Reading theme** (Paper · Sepia · Grey · Night) themes the *page*, and is
  picked while reading, in the sheet that applies it live. It is not a
  light/dark switch — Sepia and Grey are neither.

They meet exactly once: on a first read, the page opens in Night when the
appearance is dark. After that the reading theme is whatever you last chose,
and appearance never touches it again — a reader who sets Sepia means Sepia at
2am too.

Color rules that fall out of this:

- Nothing hard-codes a background, a border or a scrim. The three that used to
  (sheet scrims, the grabber, the selected-swatch ring) are palette tokens now.
- `onAccent` is its own token, not white. The dark accent is a lighter blue, so
  white-on-accent loses contrast exactly where the light scheme had it.
- The scrim is deeper in dark: a 35% black veil over a black page separates
  nothing.
- Every sheet carries a hairline border. In light the shadow does that work; on
  a black page there is no shadow to see.
- The navigator is themed from the same palette, or the header is one white and
  the page under it another.
- White text stays white on a *fixed* fill — covers, portrait initials, graph
  nodes, the sentence menu. Those are colored slabs, not surfaces, and they do
  not follow the scheme.


## Components & copy

New or non-standard:

- **`<Sentence>`** — the atom of the reader. A tappable span with four visual
  states: plain · tinted (acted on) · highlighted (4 colors) · highlighted +
  noted (superscript). Must hit-test the full line-box including trailing
  space, or short sentences become unhittable.
- **Anchored action menu** — positions above the target span, flips below near
  the top edge, clamps to the margin horizontally, dismisses on tap-elsewhere
  and on page turn.
- **Cost-stating action** — an accent *text* control whose label carries the
  price (`Analyze · ~47 requests`). Used wherever an AI call is spent. Never a
  filled button: spending money is not the primary action on any screen.
- **Confidence marker `⚠`** — on a chapter row the heuristics were unsure
  about. Tapping explains why and offers the fix.
- **Cover** — falls through embedded → user-set → generated (title typeset on a
  color derived from the title hash) → placeholder. Never blank.

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
| Translation empty | `Not translated yet.` | `尚未翻译。` |
| Candidate terms | `41 names and terms appear 3+ times and aren't in your glossary yet.` | `有 41 个名称和术语出现了 3 次以上，还没有加入术语表。` |
| Alignment failure | `Chapter 12 came back misaligned. Retried on its own.` | `第 12 章译文未能对齐，已单独重试。` |
| Term saved | `Saved. Chapters translated from here on will use it.` | `已保存。之后翻译的章节都会使用它。` |
| Re-translate cost | `Changing this term affects 38 chapters already translated. Re-translating them costs about 38 requests.` | `修改该术语会影响已翻译的 38 章。重新翻译约需 38 次请求。` |
| Analyze confirm | `Analyze 47 chapters? This sends chapter text to OpenAI and costs about 47 requests.` | `分析 47 章？会将章节正文发送给 OpenAI，约消耗 47 次请求。` |
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
  selection deliberately, so the behavior people know still exists.
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

- The `media-library` grid is replaced by horizontal shelves on Home, because
  the library is one section of a page here rather than the whole screen — a
  grid would push Settings off the bottom. The grid returns behind "More".
- `references/foundations.md` and `references/mobile.md` are currently
  unfilled (all TODO), so layout, type, color and gesture decisions here are
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
