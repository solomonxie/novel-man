# Design — Novel Man

Product and business reasoning. Interface decisions live in
[UIUX_DESIGN.md](UIUX_DESIGN.md); build order in
[IMPLEMENT_PLAN.md](IMPLEMENT_PLAN.md).


## Problem

A finished novel is 300k words of undifferentiated text. The writer, their
editor, and anyone adapting it all rebuild the same mental index by hand —
which chapter is which, who appears where, what a character looks like, who
knows whom by chapter 40. Existing tools solve the *writing* (Scrivener,
Ulysses) but assume you author inside them; nobody helps with a manuscript
that already exists, and nothing runs on a phone where a lot of reading and
reviewing actually happens.

Adaptation work is worse: converting prose to script and storyboard is
entirely manual, and the appearance details needed for casting or art are
scattered across hundreds of pages.


## Goals

- Take an existing manuscript as-is, from wherever it already lives — local
  file, cloud drive, a link — and in whatever format it's already in.
- Give every book one page that is the whole app for that book: read, edit
  structure, analyze, translate, export. No hunting across tabs for a book's
  own things.
- Make translation improve with use: every correction the user makes is
  context for the next chapter, not a one-off fix.
- Get the book back out again, in the format the next tool wants.
- Structure first: chapters and scenes, correct and correctable, because
  everything downstream indexes by them.
- Unpublished work stays private by default — no account, no upload.
- Predictable cost: the user can see and control every AI call.
- A reading experience good enough that the manuscript gets read *in* the
  app — sentence-level interaction, annotations that survive re-detection.
- English and Chinese from day one, English default — the manuscripts this is
  built for are in both, and so are the readers.
- One codebase, iOS and Android, phone-first.

## Non-goals

- Not a writing/editing app. No drafting UI, no version control of prose.
- No collaboration, comments, or shared projects.
- No proprietary format that locks the manuscript in — the source file is
  copied verbatim, and export is a first-class feature, not an afterthought.
- No format zoo for its own sake. A format ships when it can be read or
  written *well* on-device; a half-working importer is worse than a missing one.
- No hosted service, no subscription, no auth — at least not in v1.
- Not a bookstore or a general e-reader. Reading is first-class, but only for
  manuscripts the user imported — no catalog, no store, no DRM formats.
- No social layer. Sharing produces a shareable artifact (image/text); it does
  not post anywhere or show other readers' notes.


## Options considered

**Who pays for AI**

| Option | Deciding factor |
|---|---|
| **BYO API keys (chosen)** | Zero infra and zero per-user cost; whole-novel analysis is far too token-heavy to eat. Friction for non-technical writers is the price. |
| Hosted backend + subscription | Frictionless onboarding, but a 300k-word analysis pass can cost dollars per run — unbounded loss on a flat subscription, and it means auth, billing, and a server before the first useful feature. |
| Hybrid (BYO now, hosted later) | The abstraction it needs is the same one BYO needs anyway, so this isn't a separate option — it's the BYO design not painting itself into a corner. |

**Where data lives**

| Option | Deciding factor |
|---|---|
| **Local-first + optional sync (chosen)** | Privacy pitch stays intact by default; multi-device is available to those who ask, paid for by their own storage. |
| Device-only, no sync | Simplest, but a phone-first app that can't reach a second device loses the "read on tablet, edit on phone" case, and one lost phone loses everything. |
| Cloud accounts from day one | Unacceptable for unpublished manuscripts; also drags in the whole backend this design is avoiding. |

**Reading surface** (added after 微信读书 was cited as the bar)

| Option | Deciding factor |
|---|---|
| **Sentence-granular tap targets (chosen)** | The interaction 微信读书 gets right: tap one sentence, act on it. No drag-handle selection for the common case, which is where mobile text selection fails. |
| OS text selection only | Free, but selecting a sentence with drag handles on a phone is miserable, and there's nowhere to hang highlight/note/share. |
| Paragraph-granular | Easier to segment, but a paragraph is too coarse to quote or annotate precisely. |

**Localisation**

| Option | Deciding factor |
|---|---|
| **en + zh from day one (chosen)** | Retrofitting i18n means touching every string in the app once it exists. Doing it before the first screen is nearly free; doing it after is a rewrite. |
| English first, translate later | Cheaper this week, and the usual way the strings end up half-hardcoded. |

**UI language and manuscript language are separate settings** and must not be
conflated: an English-speaking editor working on a Chinese manuscript is a
real, ordinary case. UI language follows the device by default; manuscript
language is detected per project from the text and overridable.

**Import breadth**

| Option | Deciding factor |
|---|---|
| **Format registry, formats are data (chosen)** | Each format is a row implementing one small interface, so adding `.rtf` or `.fb2` is additive and testable in isolation — never another branch in a growing `switch`. Same instinct as the AI vendor list. |
| Hardcoded per-format branches | Fine for three formats, unmaintainable at ten, and makes "which formats work?" unanswerable at runtime — which the UI needs to answer. |
| Convert everything server-side | Best fidelity by far (Pandoc, LibreOffice headless), and immediately reintroduces the backend this design exists to avoid. |

**Google Docs, and remote sources generally**

| Option | Deciding factor |
|---|---|
| **OS document provider + share sheet + paste-a-link (chosen)** | Google Drive, iCloud, Dropbox and OneDrive all register as providers in the system picker, and every app can "Open in…". That covers the real cases with no OAuth, no redirect target, and nowhere to keep a refresh token. |
| Google Docs API with OAuth | Needs a server for the consent redirect and token refresh. One format is not worth a backend. |
| Ask the user to export .docx themselves | What actually happens today, and it's a fine fallback — but only as a fallback, with the app naming the steps. |

**Translation granularity**

| Option | Deciding factor |
|---|---|
| **Chapter-sized request, sentence-aligned response (chosen)** | The model needs surrounding prose to resolve pronouns, honorifics and who is speaking; the app needs per-sentence anchors to show diffs and let one line be re-edited. Numbering the sentences in the prompt and validating the count back buys both. |
| Sentence at a time | Perfect anchoring, no context. Produces the classic machine-translation failure: every line defensible, the paragraph incoherent. Also N× the requests. |
| Whole chapter as free prose | Best prose, but the result can't be aligned back to source sentences, so there is nowhere to hang a diff, a correction, or a re-run of one line. |

**Where translation context comes from**

| Option | Deciding factor |
|---|---|
| **Termbase + post-edit memory (chosen)** | This is the problem translation tooling already solved: a term base for names and terminology, a translation memory for accepted prose. Both are just retrieval keyed on the source sentence, and both are things the user can edit directly. |
| Put everything in a system prompt | Works for twenty terms, not for a 400-character cast. Burns tokens on every call for entries the sentence never mentions. |
| Fine-tuning per book | Far too slow and expensive a loop for a correction the user wants to take effect on the very next chapter. |

**Chapter detection**

| Option | Deciding factor |
|---|---|
| **Heuristics first, AI fallback (chosen)** | ~90% of manuscripts have machine-detectable structure (docx heading styles, epub spine, `Chapter N` / `第N章`). Free, instant, offline. AI is reserved for the ambiguous remainder. |
| AI-only | Every import becomes a paid multi-call pass over the full text, and a nondeterministic one. Wrong on cost and on trust. |
| Manual only | Honest but useless — it's the whole job. |

**Scene boundaries out of a chapter pass**

| Option | Deciding factor |
|---|---|
| **Numbered paragraphs, model answers with numbers (chosen)** | Same trick as translation alignment. A break can only fall at a paragraph, an integer needs no matching back, and an out-of-range number is obviously wrong. |
| Model quotes the opening words of each scene | Tried first; failed. Models re-wrap and re-punctuate what they quote, so the quote has to be found again by fuzzy prefix search — most scenes were lost, and the ones found landed off. |
| Separate scene-only pass | Reliable but doubles the per-chapter bill for something the chapter pass is already reading the whole chapter for. |


## Decision

**An offline, local-first React Native + Expo app with bring-your-own AI keys,
built structure-first.**

- *Expo over bare RN or native*: one codebase, and the whole native surface
  needed (SQLite, secure storage, document picker, file system) already has a
  maintained Expo module. A phone-first tool for writers doesn't need custom
  native code, and paying the two-platform cost for it would delay everything
  downstream.
- *Structure before characters*: chapters and scenes are the index every later
  feature reads from — a character's "first appearance" is meaningless without
  them. Shipping detection alone is also independently useful, which keeps v1
  small enough to actually land.
- *Heuristics before AI* is the same instinct applied to cost: the app must be
  useful with no key configured at all. AI is an upgrade, never a dependency.
- *Offsets, not copies*: the normalized manuscript text is stored once; a
  chapter is a `(start, end)` range into it. Re-detection rewrites ranges
  without touching text, so nothing the user typed is ever lost to a re-run,
  and a 300k-word novel doesn't get stored three times.
- *Annotations anchor to the same offsets*, not to chapter ids. A highlight
  made before re-splitting chapters still points at the same words afterwards
  — which is the entire reason structure is modeled as ranges rather than as
  copied chunks. Re-importing a *revised* manuscript is the case this doesn't
  cover; see risks.
- *A book is the unit, and it gets a real home.* Everything the app knows
  about a manuscript hangs off one page — reading, structure, cast, notes,
  export. The shelf exists to get you there, and nothing else about a book
  lives anywhere else. The alternative, feature-first tabs (`Read` / `Analyze`
  / `Export`) with a book picker inside each, is how a tool with six features
  becomes unnavigable.
- *Import and export are one registry each, not a pile of special cases.* A
  format declares what it is, whether it can round-trip, and what it loses.
  The UI reads that list rather than hardcoding it — which is also what lets
  it say "PDF export is one-way" honestly instead of silently degrading.
- *Translation units are sentences, anchored on the same offsets as
  everything else.* A translated sentence, a highlight and a chapter are all
  `(start, end)` ranges into the one normalized text. That's what lets a
  translation survive re-detection, lets a highlight and its translation sit on
  the same line, and lets the reader show source and target side by side
  without a second alignment model.
- *The user's corrections are the product.* An AI translation that can't be
  fixed is a worse e-book; one whose fixes compound is a tool. Every accepted
  edit becomes a termbase entry or a memory example, so chapter 40 is
  translated better than chapter 1 because of what happened in between. This
  is the whole reason diffs are stored rather than just applied.
- *Locale is infrastructure, not a feature.* Every user-facing string goes
  through the i18n layer from the first screen, with `en` and `zh-Hans`
  catalogs in the repo. Two languages from the start is what keeps the
  third cheap; it also forces the layout to survive text that is ~40% shorter
  in Chinese and can be much longer in English.
- *Reading is a first-class surface, not a preview.* Structure detection is
  what makes the app useful; reading is what makes it used daily. Sentence as
  the unit of interaction — tap a sentence, get copy/highlight/note/share —
  because it's the smallest span a reader actually wants to act on and the
  largest one that needs no drag handles.


## Data & integrations

**Stored on device** — SQLite (`expo-sqlite`, with a `user_version` migration
runner and a typed repository layer). Drizzle was the first choice for its
typed queries, but its migrations need a Metro transformer and a generate
step — setup risk bought for typing the repository layer already provides.
Revisit if the query surface outgrows hand-written SQL.

```
Project ──┬── SourceFile   original, copied verbatim, hash-named
          ├── Document     normalized plain text (one blob per project)
          └── Chapter ──── Scene       (start,end) offsets into Document
                                        + user overrides flag

          └── Annotation   highlight / note / bookmark, (start,end) offsets
          └── ReadingState progress offset, per-project

later:    Character ── Mention ── Relationship ── Portrait
```

- Source files are copied into app storage under a `sha256` name on import;
  picker paths are temporary and go stale on reinstall.
- Generated images and export bundles are app-owned files referenced by name,
  never base64'd into the DB.

**Localisation** — `i18next` + `expo-localization`. Catalogs `en` (source of
truth) and `zh-Hans` as JSON under `src/i18n/`. Device locale on first launch,
overridable in Settings, falls back to `en` for any unmatched locale or missing
key. Numbers, dates and durations go through `Intl`, never hand-formatted.
Language-dependent *logic* — chapter heading patterns, sentence segmentation
rules, word-count method (words vs. characters) — is keyed by the **manuscript**
language, not the UI language, and lives beside the parsers rather than in the
string catalogs.

**Translation** — three tables, all anchored to the same offsets as the rest:

```
TranslationJob    book · target language · chapter range · status · cost
TranslationUnit   (start,end) → machine text · edited text · state
Term              source · target · kind (character/place/term) · note · locked
Memory            source sentence · accepted target · why (the diff that made it)
```

- **`Term` is per target language**, manually editable, and seeded from the
  cast analysis where that has run — a character named 沈墨 should be 「Shen Mo」
  everywhere or 「Chen Mo」 everywhere, and that is the user's call, not the
  model's. A locked term is a hard constraint stated in the prompt, not a hint.
- **Context is assembled per request, not globally**: the terms whose source
  strings actually occur in this chapter, the nearest memory entries, the
  previous and next paragraph for continuity, and the book's tone settings.
  Everything else stays out of the prompt.
- **`TranslationUnit` keeps machine and edited text separately** so the diff
  between them is a first-class object — displayable as diff marks, and
  promotable into `Memory` or `Term` with one tap. Discarding the machine text
  on edit would throw away the only signal worth learning from.
- **Alignment is validated, not assumed.** The response must come back with the
  same sentence count it was given; a mismatch re-runs that chapter at a smaller
  batch size rather than silently misaligning every following line.

**Credentials** — `expo-secure-store` (Keychain / Keystore), pinned
this-device-only. Never in the DB, never in an export or a sync payload.

**AI vendors** — vendor list is data (display name, key-format hint, console
URL, capabilities, models with prices), not branching code; OpenAI-shaped APIs
share one client. Model is picked per key, not per vendor, defaulting to the
vendor's cheapest — one account sweeps 500 chapters cheaply and re-reads the
few that came back wrong on something stronger; an unlisted model id can be
typed, priced as an estimate. Several keys, ordered; order is the fallback
order. Only vendors that can do
the requested job are offered for it (image generation routes separately from
text).

**Book kinds** — what a book *is* decides what it gets. Kinds are data
(`novel`, `scripture`, `nonfiction`, `tutorial`, `textbook`), each carrying a
feature set and how a pass should read it. Scripture and nonfiction keep people
and places but lose scenes, screenplay and generated art; instruction books lose
those too. The analysis prompt is built from the kind, so a non-fiction pass is
never asked to invent a motive or an arc. Asked once when adding, editable on
the book page, defaulting to `novel` — a share-sheet import has nobody to ask.

**Cost shape** — the thing to control, and why the UI has an explicit "analyze"
action rather than an automatic one:

```
import + chapter detection   0 tokens     heuristics, always free
  └─ ambiguous structure     ~2-10 calls  ToC-sized excerpt, not full text
character extraction         O(chapters)  one pass per chapter, cached
portraits                    1 image/char explicit, one at a time
translation                  O(chapters)  BOTH directions -- whole book in and
                                          whole book out. The most expensive
                                          thing the app does; per-chapter,
                                          resumable, never a single button that
                                          spends the lot
script / storyboard          O(scenes)    per-scene, opt-in
```

**Backup, restore and cloud** — per `backup-restore.md`, `cloud-bucket-sync.md`
and `platform-cloud-drive.md`. **One payload format, three front ends** — local
file export/import (user picks the file), cloud bucket backup/restore (fixed
keys, no picker) and iCloud Drive (one switch, no picker either). Only the
destination differs; the bundle is identical.

```
bucket/<prefix>/
├── library.nmbak            settings, shelf order, language, connection
│                            list — NO secrets
└── books/
    ├── <book-uuid>.nmbak    one bundle per book, so a single book can be
    └── <book-uuid>.nmbak    pulled back without touching the rest
```

A `.nmbak` is a zip:

```
snapshot.json   version · manuscript text · structure (+ which parts the user
                edited) · annotations · characters · settings
assets/
└── <sha256>.<ext>   the original source file, generated portraits, covers
```

- **Per-book bundles, not one monolith.** It's what makes "import this one
  book from the cloud" possible, and it keeps an incremental backup from
  re-uploading a 300k-word novel because a setting changed.
- **Versioned; refuse to import a bundle newer than the app understands** —
  say so, don't half-read it.
- **Restore never overwrites.** It creates a new book (or a new library
  dataset) and confirms first, restating what it will do. Matching on
  re-import uses natural keys that survive a reinstall — source-file hash,
  title, chapter offsets — never local UUIDs, which are regenerated per install.
  Anything that can't be placed is reported, not dropped.
- **Never credentials.** API keys and bucket secrets live in the keychain only
  and are absent from every bundle, local or cloud — and the UI says so where
  the user taps Export.
- **No on-device snapshot destination.** One was built and then removed: it
  lives in the sandbox it is protecting, so uninstalling takes it and the data
  together, and offering it beside real destinations reads as protection it
  can't give. Restore is automatic from the drive, or a file the user picked —
  nothing in between.
- **iCloud Drive is the default off-device destination**, because it is the
  only one with no account to make, no key to paste and no bucket to
  provision. One switch: on means every change is written there, off means
  nothing is. Flipping it on syncs at once, which answers "did that work"
  without a Sync Now button beside it.
- **The trigger is the database write itself**, debounced a few seconds, so no
  future query has to remember to mark anything dirty; the two preference
  stores, which are not in the database, raise the same signal by hand.
  Importing a novel is thousands of writes and typing a note is one per
  keystroke, hence the wait; backgrounding flushes it. Nothing awaits the
  backup, and a failed one is answered by the next change rather than by an
  alert. Leaving the manuscripts out is what makes this affordable — the
  bundle never reads a document row.
- **iCloud carries no manuscripts.** The books came from files the user still
  has and are ~100× the rest of the payload; what a reinstall would actually
  destroy is the work *around* them. So the bundle is built with the text
  left out, marked `contentOmitted`, and restore holds the text-less books
  until the matching file is imported again — matched on source hash, which is
  also why the chapter offsets still line up.
- **Restore from the drive is automatic, once, on a fresh install** — no
  prompt: there is nothing to overwrite and no context yet for the question.
  Launch pulls back *before* it pushes up, or an empty shelf would overwrite
  the backup it came for. The file picker stays the only manual path.
- **One file, always overwritten** — `novel-man.nmbak`, not a dated series.
  The folder exists so that deleting the app doesn't delete the work, and for
  that only the newest copy was ever the answer; a list of near-identical
  bundles would ask the reader to choose between them, which is a question
  they cannot answer. iCloud keeps its own file versions underneath.
- **The container is document-scope public** (`NSUbiquitousContainers`), so
  the folder is reachable in Files under the app's name. A backup the user
  can't open is worse than a local file.
- **Five states, not two.** Unsupported (Android, Expo Go) hides the row;
  unentitled build states the reason with no instruction; iCloud Drive off
  gets the full Settings path; not-ready says try again shortly. The
  entitlement is checked *before* `ubiquityIdentityToken`, which itself needs
  the entitlement and would otherwise report a signed-in user as signed out.
- **Cloud is a backup target, not browsable content** — so one provider
  (S3 / S3-compatible), one connection = one bucket + prefix, non-interactive
  credentials, **manual sync by default**, and a real persisted job queue
  rather than a view over record statuses. The bucket screen lists the book
  bundles it holds so any of them can be pulled down individually; it is not a
  general file browser.

**Sources** — where a manuscript can come from, all landing in the same
import pipeline:

```
system document picker ──┐   iCloud, Google Drive, Dropbox, OneDrive and
share sheet ("Open in…") ├──▶ every other Files provider come free here.
paste / type a URL       │    No OAuth, no tokens, no backend.
connected S3 bucket      ┤
a .nmbak bundle ─────────┘   a book (or a whole library) coming back from
                             a backup — file or bucket, same pipeline
```

A Google Doc arrives either through the Drive provider in the picker, or as a
pasted share link the app fetches via Docs' own `export?format=docx` URL.
Either way it enters as `.docx` — there is no Google-specific code path.

**Parsing on Hermes — the binding constraint.** React Native's engine has a
backtracking regex implementation with none of V8's optimisations, and a
manuscript is big enough that the difference is not a constant factor.
Measured on a 3.4MB / 1.47M-character / 509-chapter Chinese `.docx`
(27MB of `document.xml`):

```
                            Node/V8     Hermes (iPhone sim)
 scan paragraphs, regex        8ms      >7 min, never finished
   /<w:p\b[\s\S]*?<\/w:p>/g              ← lazy quantifier backtracks per
                                            character, 44,000 times over
 scan paragraphs, indexOf      —        ~400ms
```

Rules that follow, for every parser added later:

- **Scan with `indexOf`, never a lazy quantifier over the whole document.**
  `<tag` … `</tag>` is a linear scan; write it as one.
- **Never build a `RegExp` inside a per-paragraph loop** — that is 44,000
  compilations.
- **Guard a regex with a cheap `indexOf` first.** Most runs contain no `&`,
  most paragraphs no `<script`. Checking costs nothing and skips the engine.
- **Measure on the device, not in Node.** Node was 8ms on the exact input that
  never finished on Hermes; a laptop benchmark would have proved the opposite
  of the truth.

After the rewrite the same file imports in ~3.9s, of which ~2.8s is `unzip`
plus one `TextDecoder` pass over 27MB — both single native calls that cannot be
chunked or yielded. That is the floor until parsing moves off the JS thread.

**Import formats** — all parsed on-device:

| Format | Approach | Risk |
|---|---|---|
| `.txt` `.md` | Direct read, encoding sniff (UTF-8/16, GB18030, Big5) | none |
| `.docx` | Unzip → `word/document.xml` → paragraphs + heading styles | low; styles give chapters for free |
| `.epub` | Unzip → spine + nav → XHTML per item | low; spine *is* the chapter list |
| `.html` | Parse → block elements, headings | low |
| `.rtf` `.odt` | Later. `.odt` is a zip like `.docx`; `.rtf` needs a real tokenizer | medium |
| `.pdf` | `pdf.js` text extraction in a hidden WebView | **high** — see risks |

**Export formats** — what leaves, and whether it's lossy:

| Format | Carries | Round-trips |
|---|---|---|
| `.txt` | text + chapter breaks | — |
| `.md` | text, chapters as `#`, scenes as `---` | ✓ |
| `.docx` | text, chapters as Heading 1, scene breaks | ✓ |
| `.epub` | chapters as spine items, generated nav + cover | ✓ |
| `.html` | single file, optionally with annotations inline | one-way |
| `.pdf` | typeset from the reader's own themes | one-way |
| Annotations `.csv` / `.md` | highlights and notes with chapter + quote | one-way |
| Character bible `.md` / `.docx` | profiles, relations, portraits | one-way |
| Script `.fountain` / `.fdx` | scene headings, action, dialogue | one-way (later) |

Every export is built from the normalized text plus the current structure, so
what you export always matches what you're reading — including hand-made
chapter corrections.


## Risks / open questions

- **PDF text extraction is the weak leg.** No first-class RN library; scanned
  PDFs yield nothing without OCR, and two-column or heavily-formatted layouts
  produce scrambled reading order. Mitigation: ship `.txt/.md/.docx/.epub`
  first, mark PDF best-effort with a visible warning and a preview of the
  extracted text before committing an import. OCR is out of scope.
- **BYO-key friction may cap the audience.** Novelists are not the cohort that
  has an OpenAI console account. Watch whether users stall at the key screen;
  the fix is a hosted option, which the vendor abstraction already allows.
- **Word count means different things per language.** English counts words,
  Chinese counts characters; a "21h read" estimate built on one is wrong for
  the other. Reading-speed constants must be per manuscript language, and the
  UI has to name the unit rather than showing a bare number.
- **CJK chapter conventions vary more than English ones** (`第一章`, `一`,
  `楔子`, `序章`, `番外`). The heuristic set needs to be data-driven and
  extensible per language rather than one regex.
- **Large manuscripts on low-end Android.** A 300k-word string plus offset
  ranges should be fine; loading the whole normalized text into JS memory at
  once may not be. Chunked reads may be needed — measure before designing for it.
- **Sentence segmentation is language-dependent.** English `.!?` plus CJK
  `。！？…` covers most of it, but abbreviations, dialogue punctuation
  (`"…," he said.`), and CJK quote marks `「」『』` all break naive splitting.
  `Intl.Segmenter` is the correct tool but its availability under Hermes needs
  verifying before it's relied on — otherwise a hand-rolled segmenter with a
  language-keyed rule set, same shape as the chapter heuristics.
- **Re-importing a revised manuscript orphans annotations.** Offsets shift when
  the author edits chapter 3. Mitigation: store a short text fingerprint with
  each annotation (the anchored text plus a few words either side) and re-anchor
  by fuzzy match on re-import; report what couldn't be placed rather than
  dropping it silently.
- **App store policy**: API keys are classified as authentication information.
  Needs an explicit privacy declaration and a hosted privacy policy URL before
  first submission.
- **Import still blocks the UI for ~3 seconds on a long novel**, because
  `unzip` and `TextDecoder` are atomic. A queue and progress make that
  legible, not shorter. Moving parsing to a worker (`react-native-worklets`,
  or a native module) is the only real fix, and is not worth it until a
  format arrives that is slower than this one.
- **Format breadth is the obvious place this over-reaches.** Ten importers and
  ten exporters is more surface than the whole rest of v1. The registry keeps
  them independent, but the discipline has to be: ship `.txt/.md/.docx/.epub`
  both directions, then add one format at a time with a real fixture file for
  each. Everything else stays visibly listed as "coming soon" rather than
  half-present.
- **PDF export needs a typesetting engine**, which is a genuinely separate
  project from parsing one. Likely route is rendering the reader's own HTML
  through the platform print pipeline — acceptable output, no pagination
  control. Worth confirming before promising it.
- **A pasted Google Docs link only works if the doc is link-shared.** A private
  doc returns a sign-in page, which must be detected and explained ("this doc
  isn't shared — open it in the Drive app and use Share → Open in…") rather
  than imported as HTML garbage.
- **Two restore granularities is a real complexity cost** — one book vs. the
  whole library. Keeping them the same bundle format with the same code path,
  differing only in how many are selected, is what stops it becoming two
  features.
- **Translation is the one feature where the model can be confidently wrong at
  scale.** A mistranslated name propagates through 500 chapters and reads
  fluent throughout. The termbase is the mitigation, but it only helps for
  terms someone thought to add — so candidate extraction (proper nouns seen N+
  times, not yet in the termbase) has to be proactive, surfaced before a long
  run rather than discovered on page 300.
- **Re-translating after a termbase change is not free.** Changing one name
  invalidates every chapter containing it. The unit table makes it possible to
  re-run only affected sentences, but the UI has to be honest that a late
  correction costs another pass.
- **Alignment drift is the likeliest failure mode** — models merge or split
  sentences, especially between CJK and English where the natural sentence
  boundary genuinely differs. Count validation catches it; what to do when a
  language legitimately needs two sentences for one is an open question.
- **Open**: does a project ever hold more than one source file (a series, or a
  manuscript split across files)? Modeled as one-to-many already; the UI
  assumes one until there's demand.
