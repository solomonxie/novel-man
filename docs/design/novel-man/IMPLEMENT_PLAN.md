# Implementation Plan — Novel Man

Reasoning in [DESIGN.md](DESIGN.md), interface in [UIUX_DESIGN.md](UIUX_DESIGN.md).

Stack: Expo SDK 57 · React Native 0.87 · TypeScript · expo-router ·
expo-sqlite + Drizzle · expo-secure-store · i18next.

**v1 = Phases 1-5.** Everything after is roadmap, built in order of how much
it depends on the structure model being right.


## Phase 1: Foundations

Nothing above this can be written twice cheaply. i18n and the DB schema in
particular are the two things that are nearly free now and a rewrite later:
every string and every query written before them has to be revisited.

- [ ] T1.1 Expo + TypeScript project scaffold, expo-router, strict tsconfig, lint/format, EAS config — `app/`, root config — depends: none
- [ ] T1.2 i18n layer: i18next + expo-localization, `en` and `zh-Hans` catalogues, device-locale detection, `en` fallback, a lint rule banning bare user-facing strings — `src/i18n/` — depends: none
- [ ] T1.3 SQLite + Drizzle setup, migration runner, schema for Book / SourceFile / Document / Chapter / Scene / Annotation / ReadingState — see `docs/design/novel-man/t1.3-schema.md` — depends: none
- [ ] T1.4 App-owned file storage: sha256-named copies, path healing when a container UUID changes, temp cleanup — `src/storage/` — depends: none
- [ ] T1.5 Theme + typography tokens, light/sepia/grey/night, per-script line-height and font stacks — `src/theme/` — depends: T1.2
- [ ] T1.6 Design-system primitives: section list, accent text control, cost-stating action, half/full sheet, anchored popover — `src/ui/` — depends: T1.5

## Phase 2: Import pipeline

The app can't do anything until text is in it. Built as a registry from the
start because Phase 2 ships four formats and the roadmap adds six more; the
pipeline's shape is fixed here and never revisited.

- [ ] T2.1 Format registry + `Importer` interface (`detect`, `extract`, capability flags), source-agnostic pipeline: fetch → store → parse → normalize — `src/import/` — depends: T1.3, T1.4
- [ ] T2.2 Text normalization: encoding sniff (UTF-8/16, GB18030, Big5), line-ending and whitespace normalization, offset-stable output — `src/import/normalize/` — depends: T2.1
- [ ] T2.3 `.txt` / `.md` importers — `src/import/formats/` — depends: T2.1, T2.2
- [ ] T2.4 `.docx` importer: unzip, `word/document.xml`, paragraphs + heading styles surfaced as structure hints — `src/import/formats/` — depends: T2.1, T2.2
- [ ] T2.5 `.epub` importer: unzip, OPF spine + nav, XHTML per item, embedded cover — `src/import/formats/` — depends: T2.1, T2.2
- [ ] T2.6 `.pdf` importer: pdf.js text extraction in a hidden WebView, with the extracted-text preview gate — see `docs/design/novel-man/t2.6-pdf.md` — depends: T2.1, T2.2
- [ ] T2.7 Sources: system document picker, share-sheet ingestion (both platforms), URL fetch with the Google Docs `export?format=docx` rewrite and sign-in-page detection — `src/import/sources/` — depends: T2.1
- [ ] T2.8 Import sheet UI: per-step progress, preview gate, inline errors that keep the file — `app/import/` — depends: T2.1, T1.6

## Phase 3: Structure detection

Chapters and scenes are the index every later feature reads from — a
character's "first appearance" is meaningless without them. Heuristics ship
before any AI so the app is fully useful with no key configured.

- [ ] T3.1 Sentence segmenter, language-keyed rules (Latin `.!?` + abbreviation guards, CJK `。！？…「」『』`), `Intl.Segmenter` where available — `src/text/segment/` — depends: T2.2
- [ ] T3.2 Heuristic chapter detector: heading styles, numbered patterns per language (`Chapter N`, `第N章`, `楔子`, `序章`, `番外`), confidence score per hit — see `docs/design/novel-man/t3.2-heuristics.md` — depends: T2.2
- [ ] T3.3 Scene detector: blank-line runs, separator glyphs (`* * *`, `---`, `※`) — `src/structure/` — depends: T3.2
- [ ] T3.4 Structure persistence as `(start, end)` offsets with a user-edited flag; re-detection merges without clobbering edited rows — `src/structure/` — depends: T1.3, T3.2
- [ ] T3.5 Language detection per manuscript + per-language word/character counting and reading-time estimates — `src/text/` — depends: T2.2
- [ ] T3.6 Structure editor UI: rename, merge, split at a tap point, reorder, confidence markers — `app/book/structure/` — depends: T3.4, T1.6

## Phase 4: Shelf and Book page

The navigation spine. It comes after structure because the Book page's whole
job is displaying what Phase 3 produces — building it earlier would mean
designing against placeholders.

- [ ] T4.1 Shelf: cover grid, Reading/Library sections, search, badges, long-press context menu, multi-select — `app/(tabs)/shelf/` — depends: T1.6, T1.3
- [ ] T4.2 Cover pipeline: embedded → user-set → generated (title on a hashed colour) → placeholder, with fallthrough on missing files — `src/covers/` — depends: T1.4
- [ ] T4.3 Book page: header, Continue action, chapter list, per-section entries, provenance/backup footer — `app/book/[id]/` — depends: T3.4, T4.1
- [ ] T4.4 Book lifecycle: rename, delete with asset cleanup, replace source file — `src/books/` — depends: T4.3
- [ ] T4.5 Settings page shell + language override — `app/(tabs)/settings/` — depends: T1.2, T1.6

## Phase 5: Reader

The screen the app is used in. Depends on structure for chapters and on the
segmenter for its tap targets, so it can't precede either — but everything
in it is v1.

- [ ] T5.1 Chapter renderer: paginated and continuous modes, offset-accurate position mapping both ways — see `docs/design/novel-man/t5.1-renderer.md` — depends: T3.4, T1.5
- [ ] T5.2 `<Sentence>` component: full line-box hit testing, four visual states, no interference with OS long-press selection — `src/reader/` — depends: T3.1, T5.1
- [ ] T5.3 Anchored action menu: above-the-sentence positioning, edge flipping, dismissal rules — `src/ui/` — depends: T5.2, T1.6
- [ ] T5.4 Annotations: highlight (4 colours), note, bookmark; offset anchors plus a text fingerprint for re-anchoring — `src/annotations/` — depends: T1.3, T5.2
- [ ] T5.5 Reader chrome: tap zones, auto-fade, chapter list sheet, progress scrubber — `app/reader/` — depends: T5.1
- [ ] T5.6 Reading settings sheet with live application; per-script spacing and font stacks — `app/reader/settings/` — depends: T5.5, T1.5
- [ ] T5.7 Reading state: per-book progress offset, resume, last-read chapter on the shelf — `src/reader/` — depends: T5.1, T1.3
- [ ] T5.8 Notes & highlights page: grouped by chapter, search, filters, jump-to with sentence flash — `app/book/[id]/notes/` — depends: T5.4
- [ ] T5.9 Share card renderer: themed quote image + text, into the OS share sheet — `src/share/` — depends: T5.4, T1.5

## Phase 6: Export and backup

Deliberately after the reader: export renders the normalized text *plus* the
current structure and annotations, so it needs all three to exist before it
can be written once rather than extended per feature.

- [ ] T6.1 Export registry + `Exporter` interface with round-trip and lossiness flags the UI reads — `src/export/` — depends: T3.4
- [ ] T6.2 `.txt` / `.md` / `.html` exporters — `src/export/formats/` — depends: T6.1
- [ ] T6.3 `.docx` exporter: chapters as Heading 1, scene breaks — `src/export/formats/` — depends: T6.1
- [ ] T6.4 `.epub` exporter: spine, generated nav, cover — `src/export/formats/` — depends: T6.1, T4.2
- [ ] T6.5 `.pdf` export via the platform print pipeline, typeset from the reader's themes — `src/export/formats/` — depends: T6.1, T5.1
- [ ] T6.6 Annotation export `.md` / `.csv` — `src/export/formats/` — depends: T6.1, T5.4
- [ ] T6.7 `.nmbak` bundle: versioned `snapshot.json` + `assets/`, per-book and whole-library, never any credential — see `docs/design/novel-man/t6.7-bundle.md` — depends: T6.1, T5.4
- [ ] T6.8 Restore: confirm, create-new-never-overwrite, natural-key matching, unplaceable-item reporting, refuse newer versions — `src/backup/` — depends: T6.7
- [ ] T6.9 Auto-snapshot on a schedule + "Restore Latest" with no file picker — `src/backup/` — depends: T6.7, T6.8
- [ ] T6.10 Export sheet UI: format list with lossiness labels, per-format options, destination choice — `app/book/[id]/export/` — depends: T6.1, T1.6

## Phase 7: AI layer

First feature that spends money, so it lands only once the app is already
useful without it — that ordering is what makes "degrade, never error"
enforceable rather than aspirational.

- [ ] T7.1 Vendor registry as data (display name, key hint, console URL, capabilities); one client for OpenAI-shaped APIs — `src/ai/vendors/` — depends: T1.3
- [ ] T7.2 Key storage in expo-secure-store, this-device-only, ordered list, per-key request counts, excluded from every bundle — `src/ai/keys/` — depends: T7.1
- [ ] T7.3 Fallback strategies (sequential / round-robin) + per-capability routing — `src/ai/` — depends: T7.2
- [ ] T7.4 Add-AI-key sheet where Save is the test; input hardening, error codes verbatim, failed-attempt drafts — `app/settings/keys/` — depends: T7.2, T1.6
- [ ] T7.5 Request layer: cost estimation, per-run opt-in, result caching keyed by content hash, cancellation, per-unit retry — `src/ai/` — depends: T7.3
- [ ] T7.6 AI chapter detection fallback: ToC-sized excerpt only, wired into the import flow's unsure branch — `src/structure/ai/` — depends: T7.5, T3.2

## Phase 8: Cloud

A backup destination for the bundle Phase 6 already produces — which is why it
comes after it, and why it needs no new payload format.

- [ ] T8.1 S3 / S3-compatible client, scoped to one bucket + prefix, presigned reads — `src/cloud/` — depends: T1.4
- [ ] T8.2 Connection form: per-type fields, paste-to-fill block parsing, region derivation, Save that proves access with a real list call, per-attempt drafts — `app/settings/cloud/` — depends: T8.1, T1.6
- [ ] T8.3 Persisted job queue: own table, claim-on-dequeue in a transaction, pause/resume, bounded concurrency, stale-running requeue at launch — see `docs/design/novel-man/t8.3-queue.md` — depends: T1.3
- [ ] T8.4 Backup upload: per-book bundles under `books/`, library bundle at the root, change detection by hash-at-last-upload — `src/cloud/` — depends: T8.3, T6.7
- [ ] T8.5 Cloud library screen: bundle list, per-book Get, restore through the Phase 6 path — `app/settings/cloud/[id]/` — depends: T8.4, T6.8
- [ ] T8.6 Sync frequency per connection (manual default), queue sheet, connection menu — `app/settings/cloud/` — depends: T8.3

## Phase 9: Cast and relations

The first analysis feature. It indexes by chapter and scene, so it is only
meaningful once Phase 3's structure is trustworthy and Phase 7 can pay for the
passes.

- [ ] T9.1 Character extraction: one pass per chapter, merge aliases across chapters, cached per content hash, partial results kept on failure — `src/cast/` — depends: T7.5, T3.4
- [ ] T9.2 Character schema + profile page: appearance, voice, arc, first/last appearance, per-chapter mention timeline — `src/cast/`, `app/book/[id]/cast/` — depends: T9.1
- [ ] T9.3 Relation graph: extraction, chapter-range filter, interactive canvas — `app/book/[id]/cast/graph/` — depends: T9.1
- [ ] T9.4 Continuity checks across chapters, surfaced as reviewable flags rather than edits — `src/cast/` — depends: T9.1
- [ ] T9.5 Character bible export (`.md` / `.docx`) — `src/export/formats/` — depends: T9.2, T6.1

## Phase 10: Visual and script

Everything here consumes the cast and the scene structure; none of it can be
specified honestly before those exist in practice rather than on paper.

- [ ] T10.1 Portrait generation from extracted appearance, consistency across regenerations, one at a time — `src/cast/portraits/` — depends: T9.2, T7.3
- [ ] T10.2 Script conversion: scenes → screenplay, `.fountain` / `.fdx` export — `src/script/` — depends: T9.2, T6.1
- [ ] T10.3 Storyboard (分镜): shot list per scene, generated panels — `src/storyboard/` — depends: T10.1, T10.2
- [ ] T10.4 Additional formats as demand appears: `.rtf`, `.odt`, `.fb2` import — `src/import/formats/` — depends: T2.1
