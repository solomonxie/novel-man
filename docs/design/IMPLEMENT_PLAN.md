# Implementation Plan — Novel Man

Reasoning in [DESIGN.md](DESIGN.md), interface in [UIUX_DESIGN.md](UIUX_DESIGN.md).

Stack: Expo SDK 57 · React Native 0.87 · TypeScript · expo-router ·
expo-sqlite · expo-secure-store · i18next · fflate · expo-print ·
react-native-webview.

**v1 = Phases 1-5.** Everything after was roadmap, built in order of how much
it depends on the structure model being right.

Phases 1-11 are implemented except the four tasks still unticked below;
Phase 12 is designed and not started. Phases 13 and 14 are partly built: a
bible is downloaded from eBible.org with its structure, and the Add page asks the
kind first — what each phase still owes is unticked below.
`(partial: …)` marks a task whose core landed but whose listed scope is not
fully covered, and `(removed: …)` one that shipped and was then taken out —
those notes are the honest remainder, not a to-do list that was forgotten.


## Phase 1: Foundations

Nothing above this can be written twice cheaply. i18n and the DB schema in
particular are the two things that are nearly free now and a rewrite later:
every string and every query written before them has to be revisited.

- [x] T1.1 Expo + TypeScript project scaffold, expo-router, strict tsconfig — `app/`, root config — depends: none (partial: a bare-strings and catalog-parity check stands in for eslint, which cannot run on TypeScript 7 yet; no EAS config)
- [x] T1.2 i18n layer: i18next + expo-localization, `en` and `zh-Hans` catalogs, device-locale detection, `en` fallback, in-app override — `src/i18n/` — depends: none
- [x] T1.2b Lint rule banning bare user-facing strings — the catalogs only stay complete if drift is caught mechanically — `src/i18n/` — depends: T1.2
- [x] T1.3 SQLite setup, `user_version` migration runner, schema for Book / Document / Chapter / Annotation / ReadingState — `src/db/` — depends: none (partial: Drizzle dropped for plain `expo-sqlite`, see DESIGN)
- [x] T1.4 App-owned file storage: sha256-named copies, path healing when a container UUID changes — `src/storage/` — depends: none (partial: no temp cleanup)
- [x] T1.5 Theme + typography tokens, paper/sepia/grey/night, per-script line-height — `src/theme/` — depends: T1.2 (partial: no per-script font stacks)
- [x] T1.6 Design-system primitives: section list, row, primary action, cover — `src/ui/` — depends: T1.5

## Phase 2: Import pipeline

The app can't do anything until text is in it. Built as a registry from the
start because Phase 2 ships four formats and the roadmap adds six more; the
pipeline's shape is fixed here and never revisited.

- [x] T2.1 Format registry + `Importer` interface (`detect`, `extract`, capability flags), source-agnostic pipeline: fetch → store → parse → normalize — `src/import/` — depends: T1.3, T1.4
- [x] T2.2 Text normalization: encoding sniff (UTF-8/16, GB18030, Big5), line-ending and whitespace normalization, offset-stable output — `src/import/normalize/` — depends: T2.1
- [x] T2.3 `.txt` / `.md` importers — `src/import/formats/` — depends: T2.1, T2.2
- [x] T2.4 `.docx` importer: unzip, `word/document.xml`, paragraphs + heading styles surfaced as structure hints — `src/import/formats/` — depends: T2.1, T2.2
- [x] T2.5 `.epub` importer: unzip, OPF spine, XHTML per item — `src/import/formats/` — depends: T2.1, T2.2 (partial: cover still not extracted)
- [x] T2.6 `.pdf` importer: pdf.js text extraction in a hidden WebView, with the extracted-text preview gate — `src/import/extractor.tsx` — depends: T2.1, T2.2 (partial: pdf.js loads from a CDN, so PDF is the one import that needs a network)
- [x] T2.7a System document picker — `src/import/sources/` — depends: T2.1
- [x] T2.7b Share-sheet ingestion (both platforms) and URL fetch, with the Google Docs `export?format=docx` rewrite and sign-in-page detection — `src/import/sources/` — depends: T2.7a (partial: share-sheet types are declared in app.json, but the extension itself needs a dev build)
- [x] T2.9 Linear `indexOf` XML scanning, entity/regex guards, no per-paragraph `RegExp` — a lazy-quantifier scan never finished on Hermes for a 27MB `document.xml` — `src/import/xml.ts` — depends: T2.4
- [x] T2.10 Import queue: sequential jobs, per-stage progress, retry, clear, visible strip and sheet — `src/import/queue.ts`, `src/ui/ImportQueue.tsx` — depends: T2.1 (partial: still in memory, so a kill mid-import loses the job; no cancel)
- [x] T2.11 Yield to the UI thread between parse chunks, and batch chapter inserts — `src/async/`, `src/db/repo.ts` — depends: T2.9
- [ ] T2.12 Move parsing off the JS thread — `unzip` + `TextDecoder` are ~2.8s of atomic work on a 3.4MB docx and cannot be chunked. Needs a worklet or a native module, so it also needs a dev build — `src/import/` — depends: T2.9
- [x] T2.8 Import sheet UI: per-step progress, preview gate, inline errors that keep the file — `src/ui/ImportQueue.tsx` — depends: T2.1, T1.6 (the queue sheet *is* the import sheet; a second screen would have been the same list twice)

## Phase 3: Structure detection

Chapters and scenes are the index every later feature reads from — a
character's "first appearance" is meaningless without them. Heuristics ship
before any AI so the app is fully useful with no key configured.

- [x] T3.1 Sentence segmenter, language-keyed rules (Latin `.!?` + abbreviation guards, CJK `。！？…「」『』`), `Intl.Segmenter` where available — `src/text/segment/` — depends: T2.2
- [x] T3.2 Heuristic chapter detector: heading styles, numbered patterns per language (`Chapter N`, `第N章`, `楔子`, `序章`, `番外`), confidence flag per chapter — `src/structure/` — depends: T2.2
- [x] T3.3 Scene detector: blank-line runs, separator glyphs (`* * *`, `---`, `※`) — `src/structure/` — depends: T3.2
- [x] T3.4 Structure persistence as `(start, end)` offsets with a user-edited flag — `src/db/` — depends: T1.3, T3.2
- [x] T3.5 Language detection per manuscript + per-language word/character counting and reading-time estimates — `src/text/` — depends: T2.2
- [x] T3.6 Structure editor UI: rename, merge, split at a tap point, reorder, confidence markers — `app/book/structure/` — depends: T3.4, T1.6

## Phase 4: Shelf and Book page

The navigation spine. It comes after structure because the Book page's whole
job is displaying what Phase 3 produces — building it earlier would mean
designing against placeholders.

- [x] T4.1 Home as one scrollable page: search, horizontal Reading and Library shelves, More-to-grid, ＋ on the Library heading, Settings section — no tab bar — `app/index.tsx` — depends: T1.6, T1.3 (partial: no badges, context menu or multi-select)
- [x] T4.2 Cover pipeline: user-set image → generated (title on a hashed color) → placeholder — `src/ui/` — depends: T1.4 (partial: embedded epub covers not extracted)
- [x] T4.3 Book page as one page with clear sections: header, Continue, editable details, collapsed chapter picker, characters, places, unbuilt sections named honestly — `app/book/[id].tsx` — depends: T3.4, T4.1
- [x] T4.4 Book metadata: editable title, author, year, edition, cover; delete — `src/db/repo.ts` — depends: T4.3 (partial: delete still leaves the stored source file behind; no replace-source)
- [x] T4.5 Settings: section on Home plus a pushed page, language override — `app/settings/` — depends: T1.2, T1.6
- [x] T4.6 Character and place profiles: portrait with initials fallback, inline-editable name/alias/summary, user-defined label/value details — one table with a kind — `app/entity/[id].tsx` — depends: T4.3

## Phase 5: Reader

The screen the app is used in. Depends on structure for chapters and on the
segmenter for its tap targets, so it can't precede either — but everything
in it is v1.

- [x] T5.1 Chapter renderer, continuous mode, offset-accurate position mapping — `src/reader/` — depends: T3.4, T1.5 (partial: paginated mode not built)
- [x] T5.2 `<Sentence>` component: full line-box hit testing, four visual states, no interference with OS long-press selection — `src/reader/` — depends: T3.1, T5.1
- [x] T5.3 Anchored action menu: above-the-sentence positioning, edge flipping, dismissal rules — `src/ui/` — depends: T5.2, T1.6
- [x] T5.4 Annotations: highlight, stored on offset anchors — `src/db/`, `src/reader/` — depends: T1.3, T5.2
- [x] T5.5 Reader chrome: tap zones, auto-fade, progress scrubber — `app/reader/` — depends: T5.1 (partial: continuous mode only, so the tap zones page by a screenful rather than turning)
- [x] T5.6 Reading settings sheet with live application: font size, four themes, per-script spacing, margins, serif/sans; persisted — `src/ui/ReadingSettingsSheet.tsx`, `src/reader/settings.ts` — depends: T5.5, T1.5
- [x] T5.7 Reading state: per-book progress offset, resume, last-read chapter on the shelf — `src/reader/` — depends: T5.1, T1.3
- [x] T5.8 Notes & highlights page: grouped by chapter in reading order, search, filters, copy, jump-to with sentence flash — `app/book/[id]/notes.tsx` — depends: T5.4
- [x] T5.9 Share card renderer: themed quote image + text, into the OS share sheet — `src/share/` — depends: T5.4, T1.5 (partial: the card renders through the print pipeline, so it shares as a page rather than a PNG)

## Phase 6: Export and backup

Deliberately after the reader: export renders the normalized text *plus* the
current structure and annotations, so it needs all three to exist before it
can be written once rather than extended per feature.

- [x] T6.1 Export registry + `Exporter` interface with round-trip and lossiness flags the UI reads — `src/export/` — depends: T3.4
- [x] T6.2 `.txt` / `.md` / `.html` exporters — `src/export/formats/` — depends: T6.1
- [x] T6.3 `.docx` exporter: chapters as Heading 1, scene breaks — `src/export/formats/` — depends: T6.1
- [x] T6.4 `.epub` exporter: spine, generated nav, cover — `src/export/formats/` — depends: T6.1, T4.2 (partial: cover not embedded)
- [x] T6.5 `.pdf` export via the platform print pipeline, typeset from the reader's themes — `src/export/formats/` — depends: T6.1, T5.1
- [x] T6.6 Annotation export `.md` / `.csv` — `src/export/formats/` — depends: T6.1, T5.4
- [x] T6.7 Backup bundle: a plain `.zip` of versioned `snapshot.json` + `assets/`, per-book and whole-library, never any credential; reads the older `.nmbak` name too — depends: T6.1, T5.4
- [x] T6.8 Restore: confirm, create-new-never-overwrite, natural-key matching, unplaceable-item reporting, refuse newer versions — `src/backup/` — depends: T6.7
- [x] T6.9 Auto-snapshot on a schedule + "Restore Latest" with no file picker — `src/backup/` — depends: T6.7, T6.8 (removed: an on-device snapshot dies in the sandbox it protects, and T8.8's switch is the automatic restore it was standing in for)
- [x] T6.10 Export sheet UI: format list with lossiness labels, per-format options, destination choice — `app/book/[id]/export/` — depends: T6.1, T1.6

## Phase 7: AI layer

First feature that spends money, so it lands only once the app is already
useful without it — that ordering is what makes "degrade, never error"
enforceable rather than aspirational.

- [x] T7.1 Vendor registry as data (7 vendors, 3 API shapes); one client for OpenAI-shaped APIs — `src/ai/vendors.ts`, `src/ai/client.ts` — depends: T1.3
- [x] T7.2 Key storage in expo-secure-store, this-device-only, ordered list, per-key request counts — `src/ai/keys.ts` — depends: T7.1
- [x] T7.3 Fallback strategies (sequential / round-robin) — `src/ai/keys.ts` — depends: T7.2 (partial: still no per-capability routing, so image models are not separated from text)
- [x] T7.4 Add-AI-key sheet where Save is the test; input hardening, vendor errors verbatim — `app/settings/ai-keys.tsx` — depends: T7.2, T1.6 (partial: no failed-attempt drafts)
- [x] T7.5 Request layer: cost estimation, per-run opt-in, result caching keyed by content hash, cancellation, per-unit retry — `src/ai/` — depends: T7.3
- [x] T7.6 AI chapter detection fallback: ToC-sized excerpt only, wired into the import flow's unsure branch — `src/structure/ai/` — depends: T7.5, T3.2

## Phase 8: Cloud

A backup destination for the bundle Phase 6 already produces — which is why it
comes after it, and why it needs no new payload format.

- [x] T8.1 S3 / S3-compatible client, scoped to one bucket + prefix, presigned reads — `src/cloud/` — depends: T1.4
- [x] T8.2 Connection form: per-type fields, paste-to-fill block parsing, region derivation, Save that proves access with a real list call, per-attempt drafts — `app/settings/cloud/` — depends: T8.1, T1.6
- [x] T8.3 Persisted job queue: own table, claim-on-dequeue in a transaction, pause/resume, bounded concurrency, stale-running requeue at launch — depends: T1.3 (partial: one job at a time rather than bounded concurrency)
- [x] T8.4 Backup upload: per-book bundles under `books/`, library bundle at the root, change detection by hash-at-last-upload — `src/cloud/` — depends: T8.3, T6.7
- [x] T8.5 Cloud library screen: bundle list, per-book Get, restore through the Phase 6 path — `app/settings/cloud/[id]/` — depends: T8.4, T6.8
- [x] T8.6 Sync frequency per connection (manual default), queue sheet, connection menu — `app/settings/cloud/` — depends: T8.3
- [x] T8.7 iCloud Drive native module: ubiquity container, five-state availability (entitlement read from the embedded profile *before* the account token), document-scope-public folder, copy in/out with placeholder download — `modules/icloud/` — depends: T1.4
- [x] T8.8 iCloud auto-sync switch: one row, flip-on syncs at once, blocked states replace the location line and only `driveOff` gets directions, re-checked on foreground — `src/settings/Backup.tsx` — depends: T8.7
- [x] T8.9 Change-driven sync: one change signal raised by the single SQLite write path and by the preference stores, debounced, flushed on backgrounding, guarded against its own upload record, awaited by nothing — `src/backup/changes.ts`, `src/backup/icloud.ts` — depends: T8.8
- [x] T8.11 Flat task queue: one row per unit named for the work itself, per-task stop and retry, stop-everything at the foot, opened from Settings as well as the strip — `src/ui/WorkQueue.tsx`, `src/db/work.ts` — depends: T7.5
- [x] T8.10 Content-free bundle (`includeText: false` + app preferences) and automatic first-install restore before the shelf loads, with text-less books held and re-attached on re-import by source hash — `src/backup/` — depends: T8.7, T6.8

## Phase 9: Cast and relations

The first analysis feature. It indexes by chapter and scene, so it is only
meaningful once Phase 3's structure is trustworthy and Phase 7 can pay for the
passes.

- [x] T9.1 Character extraction: one pass per chapter, merge aliases across chapters, cached per content hash, partial results kept on failure — `src/cast/` — depends: T7.5, T3.4
- [x] T9.2 Character schema + profile page: appearance, voice, arc, first/last appearance, per-chapter mention timeline — `src/cast/`, `app/book/[id]/cast/` — depends: T9.1
- [x] T9.3 Relation graph: extraction, chapter-range filter, interactive canvas — `app/book/[id]/cast/graph/` — depends: T9.1
- [x] T9.4 Continuity checks across chapters, surfaced as reviewable flags rather than edits — `src/cast/` — depends: T9.1
- [x] T9.5 Character bible export (`.md` / `.docx`) — `src/export/formats/` — depends: T9.2, T6.1

## Phase 10: Translation

Comes after the cast because character names are exactly what the glossary
needs seeding with, and after the segmenter because sentences are its units.
It is also the most expensive feature in the app -- whole book in, whole book
out -- so the termbase and the per-chapter queue are built before the first
bulk run, not bolted on after one goes wrong.

- [x] T10.1 Translation schema: job, unit `(start,end)` with machine and edited text kept separately, term, memory — depends: T1.3, T3.1
- [x] T10.2 Termbase: per target language, CRUD, lock flag, seeded from cast where it exists — `src/translate/terms/` — depends: T10.1
- [x] T10.3 Candidate term extraction: proper nouns seen N+ times and absent from the glossary, surfaced before a run — `src/translate/terms/` — depends: T10.2, T3.1
- [x] T10.4 Context assembly: only the terms occurring in this chapter, nearest memory entries, adjacent paragraphs — `src/translate/` — depends: T10.2
- [x] T10.5 Chapter translation request with numbered sentences, and alignment validation that retries a mismatched chapter smaller — `src/translate/` — depends: T10.4, T7.5
- [x] T10.6 Translation queue: per-chapter jobs, resumable, cost stated before the run — `src/translate/` — depends: T10.5, T2.10 (partial: the run sheet is the queue — resumable and priced, but not a persisted job list)
- [x] T10.7 Bilingual reader mode: source/target/both, reusing the existing sentence tap — `app/reader/` — depends: T10.5, T5.2
- [x] T10.8 Unit editor with diff marks against the machine output, revert, and promote-to-term — `app/book/[id]/translation/` — depends: T10.7
- [x] T10.9 Post-edit memory: accepted diffs become examples quoted on nearby sentences — `src/translate/` — depends: T10.8, T10.4
- [x] T10.10 Invalidation: changing a term marks affected chapters stale and re-runs only those sentences — `src/translate/` — depends: T10.2, T10.5
- [x] T10.11 Translated export: target-only or bilingual, through the Phase 6 registry — `src/export/formats/` — depends: T10.5, T6.1

## Phase 11: Visual and script

Everything here consumes the cast and the scene structure; none of it can be
specified honestly before those exist in practice rather than on paper.

- [ ] T11.1 Portrait generation from extracted appearance, consistency across regenerations, one at a time — `src/cast/portraits/` — depends: T9.2, T7.3 (blocked on T7.3's per-capability routing: image models are a different endpoint per vendor, not a different model name)
- [x] T11.2 Script conversion: scenes → screenplay, `.fountain` / `.fdx` export — `src/script/` — depends: T9.2, T6.1
- [ ] T11.3 Storyboard (分镜): shot list per scene, generated panels — `src/storyboard/` — depends: T11.1, T11.2
- [ ] T11.4 Additional formats as demand appears: `.rtf`, `.odt`, `.fb2` import — `src/import/formats/` — depends: T2.1


## Phase 12: Public sources

A book you name rather than a file you find. Everything here is data over the
Phase 2 pipeline: a source supplies a URL and, where it has one, a structure
map — no new import path, no screen that knows what a bible is.

- [ ] T12.1 Source model + index format: `Source` (id, name, index URL, trust, fetched_at), `Work` (slug, title, author, language, kind, licence, options), `Edition` (format, URL, bytes, sha256, structure map?) — a JSON index spec written down once, with a fixture — `src/sources/` — depends: T1.3, T2.1
- [ ] T12.2 Index fetch + cache: refresh one source or all, keep the last good index, record its date, work offline off the cache — `src/sources/index.ts` — depends: T12.1
- [ ] T12.3 Search across cached indexes: title, author, alias, in both scripts, ranked, grouped by subject — `src/sources/search.ts` — depends: T12.2
- [ ] T12.4 Option schema + resolver: pick-one / toggle / text with defaults, "what you'll get" line, option values → a concrete `Edition` — `src/sources/options.ts` — depends: T12.1
- [x] T12.4b Project Gutenberg source: its own OPDS search, the smallest EPUB off the book's feed, terms and size quoted from it — `src/sources/gutenberg.ts`, `app/source/gutenberg.tsx` — depends: T12.1
- [x] T12.4c A GitHub page url is rewritten to its raw file, so a book written in a repository arrives through the link box rather than through a source of its own — `src/import/sources/links.ts` — depends: T2.10
- [x] T12.4d Sources are a row of data a kind lists, and each has one find page of the same shape — `src/sources/registry.ts`, `src/ui/FindPage.tsx`, `app/add.tsx` — depends: T12.4b, T12.4c
- [ ] T12.5 Download: fetch the edition through the import queue, verify size/sha256, record it (source, work, options) on the book — `src/sources/download.ts` — depends: T12.2, T12.4, T2.10
- [ ] T12.6 Structure map: an edition that publishes its own book/chapter map skips detection and writes those ranges directly — `src/sources/structure.ts` — depends: T12.5, T3.1
- [ ] T12.7 Find-a-book page and request page, generated from the schema, with the licence and source on every row — `app/source/` — depends: T12.3, T12.4
- [ ] T12.8 Public sources settings section: list, per-source refresh, add an index URL of your own (validated before it is added), remove — `app/index.tsx`, `app/settings/source/[id].tsx` — depends: T12.2
- [ ] T12.9 Bundled source adapters and their catalogs: Project Gutenberg, a bible source (translation / canon / verse layout / plates), Chinese public domain (简繁, punctuation, edition) — `src/sources/catalog/` — depends: T12.1, T12.4
- [ ] T12.10 Failure copy, all of it naming the source: unreachable, moved, stale index, already on the shelf, no licence stated — `src/i18n/` — depends: T12.5

## Phase 13: Scripture

A bible through the same pipeline as a novel. Nothing here is a second reader
or a second database — it is a part label, a verse table, a USFM importer and
a source that already publishes its catalog.

- [x] T13.1 `part_idx` / `part_title` on chapters + the grouped chapter list, usable by any book with 卷 or Part I — `src/db/migrations.ts`, `src/structure/` — depends: T3.1
- [x] T13.2 `verses` table `(book_id, chapter_id, number, start, end)` and the per-edition book-name table from `\toc1`/`\toc2`/`\toc3` — `src/db/migrations.ts`, `src/scripture/` — depends: T13.1 (partial: the `verses` table and per-edition names are written and counted; nothing reads the names back yet — that is T13.5)
- [x] T13.3 USFM importer: one file per book, `\c`/`\v` marks, `\w …|strong=…\w*` collapsed, `\s1`/`\q1`/`\q2`/`\wj`/`\f`/`\x` kept as switchable marks, never baked into the text — `src/import/formats/usfm.ts` — depends: T2.1, T13.2
- [x] T13.4 eBible.org source adapter: `translations.csv` as the index (licence from `Redistributable`, counts from OT/NT/DC columns), `<id>_usfm.zip` as the edition, canon as the one option — `src/sources/catalog/ebible.ts` — depends: T12.1, T12.4, T13.3
- [x] T13.16 Scripture is analyzed by citation, not by text: the pass is given edition, book, chapter and verse range, and the estimate falls with it — `src/analysis/context.ts`, `src/work/handlers.ts` — depends: T13.2
- [ ] T13.5 Reference parser and jump: `John 3:16`, `约 3:16`, `1 Cor 13`, resolved against the installed edition; wired into shelf search and the chapter sheet — `src/scripture/reference.ts` — depends: T13.2
- [ ] T13.6 Scripture reader: verse numbers as marks, the verse as the tap unit, reference as the chrome title, share attributed `John 3:16 (WEB)` — `app/reader/[id].tsx`, `src/reader/` — depends: T13.2
- [ ] T13.7 Scripture reading settings: numbers, one verse per line, headings, poetry, red letter, footnotes — render-only, never a re-download — `src/reader/settings.ts`, `src/ui/ReadingSettingsSheet.tsx` — depends: T13.6
- [ ] T13.8 Chapter sheet grouped by book, chapter numbers as a grid, OT/NT split — `src/ui/ChapterSheet.tsx` — depends: T13.1
- [x] T13.9 Book page for scripture: parts where chapters were, analysis scoped and priced per book — `app/book/[id].tsx`, `src/analysis/runs.ts` — depends: T13.1, T7.3 (partial: parts lead the book page and a bible counts books and verses; per-book analysis scoping is still T14.6)
- [x] T13.10 `scripture` kind gains `parts` and `verses` features and keeps losing scenes, screenplay and art — `src/books/kinds.ts` — depends: T13.1
- [x] T13.11 Only a chosen list of editions is offered — KJV, ASV, WEB, BSB, NET, YLT, 和合本 简/繁, 当代译本 简/繁, 世界中文 — in list order, with the catalog still supplying counts and licence; no search box, and RTL editions fall out for free — `src/scripture/ebible.ts`, `app/scripture/translations.tsx` — depends: T13.4

- [x] T13.12 A part gets its own page: title, picture and summary it can be given, its chapters, the notes that fall inside it, and analysis scoped and priced to it — `app/book/[id]/part/[idx].tsx`, `part_details` — depends: T13.1, T13.9
- [x] T13.13 The reader stops being a dead end: `⋯` folds the chapter sheet, select mode, this chapter's page, its part, its book and a per-chapter analysis into one button — `app/reader/[id].tsx` — depends: T13.12
- [x] T13.14 The reader draws its chrome before the manuscript arrives — book, chapters and progress first, text second, re-anchored annotations third — and seeds its theme from the appearance so there is no white frame — `app/reader/[id].tsx` — depends: T6.1
- [x] T13.15 Search on the lists long enough to need one: the chapter list and the parts list, sharing one field — `src/ui/primitives.tsx`, `app/book/[id]/structure.tsx`, `app/book/[id]/parts.tsx` — depends: T13.1

- [x] T15.1 `paper` kind: sections rather than chapters, no cast or scenes, and a pass that weighs an argument instead of following a story — `src/books/kinds.ts`, `src/work/handlers.ts` — depends: T14.1
- [x] T15.2 arXiv source: fielded search (everything, title, author) and a category picker that browses newest-first; the metadata it states is written onto the book after import — `src/sources/arxiv.ts`, `app/source/arxiv.tsx` — depends: T12.4d
- [x] T15.3 Pictures: a paragraph that links to a file, pulled out of an EPUB at import and drawn by the reader in place of the line — `src/reader/images.ts`, `src/ui/ReaderImage.tsx`, `src/import/formats/epub.ts` — depends: T6.1
- [x] T15.4 arXiv's own HTML rendering is preferred over the PDF: headings, figures and `alttext` TeX, with relative figure links made absolute while the base is known — `src/import/formats/html.ts`, `src/sources/arxiv.ts` — depends: T15.2
- [x] T15.5 Displayed formulas drawn through MathJax in the extractor WebView and kept as tinted PNGs; inline maths stays as its TeX — `src/import/extractor.tsx`, `src/import/formats/html.ts` — depends: T15.4
- [ ] T15.6 Figures out of a PDF: pdf.js renders them, the extractor bridge does not yet pass them back — `src/import/extractor.tsx` — depends: T15.3

## Phase 14: Kind first

The kind decides the sources, the questions and the page, so it is asked before
any of them. Mostly a move of things that exist: the add sheet becomes a page,
and the book page stops branching on kind and starts rendering what the kind
declares.

- [x] T14.1 Kinds carry `units`, `sources`, `options` and `sections` — the row grows, the screens stop knowing the list — `src/books/kinds.ts` — depends: none
- [x] T14.2 `app/add.tsx`: kind chips, sources filtered by kind, that kind's options, one commit button. Replaces the ⊕ picker sheet and the post-import kind sheet — `app/add.tsx`, `app/index.tsx` — depends: T14.1
- [ ] T14.3 A file already in hand (share sheet, "Open in…", a link fetched) lands on the page pre-chosen instead of importing behind it — `src/import/sources/incoming.ts` — depends: T14.2
- [ ] T14.4 Detected values shown as detected: language, chapter convention, volumes — proposed by the detector, overridable before the import runs — `src/structure/detect.ts`, `app/add.tsx` — depends: T14.2
- [x] T14.5 Book page renders `sections` from the kind rather than branching, with a fallback shape for a kind that declares none — `app/book/[id].tsx` — depends: T14.1 (partial: facts, Inside and the gated sections come from the kind; the rest of the page is still common to every kind)
- [ ] T14.6 Analysis scoped to the kind's part unit, and the button says which — `src/analysis/runs.ts`, `app/book/[id].tsx` — depends: T14.1, T13.1
- [ ] T14.7 Kind change after the fact re-renders the page and keeps everything that still applies; what it drops is named before it drops — `app/book/[id].tsx` — depends: T14.5
- [x] T14.8 Per-kind copy in both catalogs: chip labels, the one-line what-you-get, empty sources, section titles — `src/i18n/` — depends: T14.1

## Verified mechanically

`npm run check` is the whole suite: `typecheck`, `check:parse`, `check:i18n`.

- `check:parse` compiles the pure modules outside the app and runs them
  against fixtures: parsers, chapter and scene detection, sentence
  segmentation, annotation re-anchoring, docx/epub export round trips,
  translation alignment, glossary candidates, post-edit diffs, mention
  counting, graph layout, SHA-256 / HMAC / SigV4 against published vectors,
  bucket listing, credential paste parsing, link rewriting, screenplay output.
- `check:i18n` proves both catalogs carry the same keys and that no visible
  string is written inline in a screen.
