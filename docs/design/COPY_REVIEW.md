# UI copy review — nothing applied yet

Every visible string in both catalogs — 1,016 keys, 1,019 strings with plurals. Measured against the tone rule in
[UIUX_DESIGN.md](UIUX_DESIGN.md): *state what happens and what it costs; no exclamation marks,
no encouragement, no "✨ AI-powered"; the Chinese is written, not translated.*

Tick the groups you want and I apply them. Groups are independent.

---

## 1 · Wrong English, or English that does not parse (11)

The ones a reader stops at.

| Key | Now | Proposed |
|---|---|---|
| `chapter.cast` | `Persons` | `People` |
| `scene.present` | `Persons` | `People` |
| `add.recordRow` | `Keep everything of a book but content` | `Everything about a book except its text` |
| `add.recordTitle` | `Empty book` | `A book with no text` |
| `settings.gradeHint_best` | `1024px at the slowest pass. Same obedience, more of everything else.` | `1024 px, slowest pass. Follows the prompt as closely as Normal, with more detail in it.` |
| `settings.gradeHint_fast` | `512px on the older model. Quick and cheap, and the loosest with what the prompt asked for.` | `512 px, on the older model. Quick and cheap, and the loosest with what you asked for.` |
| `job.title` | `Getting it` | `Getting the book` |
| `import.discarded` | `You discarded this extraction.` | `You discarded what was read out of this file.` |
| `notes.deleteSelectedConfirm` | `Delete {{count}} marks? The words stay in the book.` | `Delete {{count}} highlights and notes? The words stay in the book.` |
| `lists.deleteConfirm` | `{{name}} goes; the books in it stay on the shelf.` | `Deletes “{{name}}”. The books in it stay on the shelf.` |
| `shelf.unreadable` | `The library could not be opened. Nothing has been lost — the books are still on the device.` | `The library wouldn’t open. Nothing is lost — your books are still on this device.` |

`scenes.count` — `{{scenes}} scenes under {{names}} names` — reads as a riddle. It counts scenes
and how many distinct scene names they fall under. Proposed: `{{scenes}} scenes, {{names}} of them named`.
**Confirm that is the meaning** before I change it; if `names` is the count of *recurring* tags,
it should read `{{scenes}} scenes across {{names}} recurring places`.

## 2 · Breaks the tone rule the design states (4)

| Key | Now | Proposed | Why |
|---|---|---|---|
| `book.comingSoon` | `Coming soon` | delete the two rows | Illustrations and Animations aren't built. A promise is not a state. Rows are `app/chapter/[id].tsx:480–481`. |
| `draw.direct` | `✨  Write the prompt` | `✨ Write it from the book` | ✨ is a real control elsewhere in the app, so keep the glyph — but one space, and a label that says what it does. |
| `settings.notBuilt` | `Not built yet` | delete the key | Developer status leaking into the product. Already unreferenced. |
| `entity.polish` / `place.polish` | `Polish with AI` | `Write the profile with AI` | "Polish" implies your text is being edited. It writes a profile from chapter notes — which is what the queue already calls it (`Write a profile for …`). |

## 3 · One thing, several names (7)

| Where | The drift | Proposed |
|---|---|---|
| `settings.cloud` `Cloud` · `settings.privateCloud` `Private cloud` · `cloud.title` `Cloud backup` | three names, and `cloudHint` = `privateCloudHint` word for word | keep `Cloud backup`; delete the four dead `settings.*` twins |
| `settings.aiAdd` `Add AI Key` · `ai.addKey` `Add a key` · `settings.addKey` `+ Add AI Key` (dead) | title case in two of three | `Add a key` everywhere; delete the dead one |
| `work.engine_ai` `costs money` ↔ `work.engine_local` `on device` | not a pair — one names a price, the other a place | `spends AI requests` ↔ `on this device` (same fix for `structure.aiDetectValue`, `cast.costs`) |
| `book.impressions` `My impressions` | first person, next to `Your rating` and `Your notes` | `Your impressions` |
| `kind.scripture` `Bible` · `kind.scriptureHint` `A bible` · `repo.title` `A bible on GitHub` · `repo.err_nothing` `no bible` | the book, lowercased in four places | `Bible` capitalised throughout (7 strings) |
| `kind.paper` `Academic papers` | plural label, and its own hint says `One academic paper.` | `Academic paper` |
| `work.task_person-link` | `Find the articles for {{what}}` | `Find {{what}} on Wikipedia` |

## 4 · Typography — mechanical, no judgment needed

| What | Count | Proposed |
|---|---|---|
| Straight `'` vs curly `’` | 28 vs 10 | all `’` (the catalog already uses `…` and `“ ”`) |
| Straight `"` in `shelf.linkSignIn` | 1 | `“ ”` |
| `+` vs `＋` to open an add row | 2 vs 7 | all `＋` |
| Space after `＋` | `＋ Add a detail` vs `＋  Add a tag` | one space everywhere |
| 中文破折号 | 26 use ` — `, 17 use `——` | all `——`, no surrounding spaces |
| 中文引号 | 6 use `“”`, 5 use `「」` | all `“”` (mainland standard) |

## 5 · Facts that have gone stale (3)

| Key | Now | Proposed |
|---|---|---|
| `shelf.emptyHint` | `Import a .txt, .md, .docx or .epub to start.` | `Import a .txt, .md, .docx, .epub or .pdf to start.` — PDF import ships, and the design doc's own copy names it |
| `structure.deleteConfirm` | `…joins the neighbouring chapter` | `neighboring` — the rest of the catalog is US English (`Analyze`) |
| `source.openlibraryDetail` | `40 million books, catalogued` | `cataloged` — same reason |

`source.gutenbergDetail` says `79,000 books`; the README says 78,000. One of them should move — say which is right.

## 6 · Chinese-only (4)

| Key | Now | Proposed |
|---|---|---|
| `entity.polish` / `place.polish` | `用 AI 整理` / `用 AI 归纳` | one verb for one action: `用 AI 写档案` |
| `lists.count_one/other` | `{{count}} 本` | `{{count}} 本书`, matching `shelf.count` |
| `settings.removeAllWarning` | `…所有已连接的 S3 存储桶` | `…所有已连接的存储桶` — "S3" appears nowhere else in the UI |
| `kind.scriptureHint` etc. | `圣经 — 真实人物…` | `圣经——真实人物…` (covered by group 4) |

## 7 · Dead strings (not copy, but found on the way)

Verified unreferenced — `tie.*`, `kind.*`, `status.*`, `source.*` and `place.certainty.*` are built
dynamically and are fine; these are not:

`tabs.shelf` `tabs.settings` (there is no tab bar) · `draw.row` · `identify.hint` · `shelf.title`
`shelf.kindTitle` · the whole `import.*` progress set (`title` `reading` `parsing` `detecting`
`saving` `done` `cancel` `tryAnother`) · `book.stats` `book.count` `book.details` `book.arcs`
`book.addPerson` `book.addPlace` `book.notesRow` `book.aiSummarize` `book.aiResummarize`
`book.aiSummarizeWhat` `book.esvKey` `book.esvKeyHint` `book.correctHint` · `reader.chapterPage`
`reader.bookPage` `reader.chapterList` `reader.highlight` `reader.unhighlight` `reader.progress`
`reader.jumpTo` `reader.selectDone` `reader.openPart` `reader.openBook` `reader.more`
`reader.analyzeChapter` · `settings.languageSystem` `settings.addKey` `settings.cloud`
`settings.cloudHint` `settings.backup` `settings.backupHint` `settings.notBuilt` `settings.more`
`settings.privateCloud` `settings.privateCloudHint` `settings.connectBucket` `settings.exportBundle`
`settings.importBundle` `settings.restoreLatest` · `units.words` `units.characters`
`units.readTimeHours` `units.readTimeMinutes` · `lookup.busy` `lookup.no-key` `lookup.rejected`
`lookup.not-found` `lookup.offline` · `structure.aiOne*` · `backup.title` · `ai.run` `ai.done`
`ai.estimateLine` · `cast.extracted` · `translate.run` `translate.remaining` `translate.fromChapter`
`translate.edited` `translate.stale` `translate.editUnit` `translate.source` `translate.target`
`translate.changes` `translate.promote` `translate.promoteHint` `translate.addTerm`
`translate.chapters` `translate.chapterDone` `translate.backToChapters` · `cloud.openLibrary`
`work.finished` `work.alsoWaiting` · `chapter.sceneSummaryPlaceholder` `chapter.readScene`
`chapter.translateInto` `chapter.setUpTranslation` · `place.where` · `add.about` `add.commit`
`add.download` `add.free` `add.translation` `add.keep` `add.recordRow` `add.recordHint`
`add.catalogs` `add.pickOne` · `gallery.useCover`

Two of these are worth more than a deletion:

- **`reader.hint`** — `Tap any sentence to highlight, note or share it.` The design specifies this as
  the one-time hint on the first sentence tap ever. It is in both catalogs and rendered nowhere,
  so the hint does not ship. Build it, or drop the string.
- **`units.words` / `units.readTimeHours`** — the design promises `312,400 words` / `31.2万字`
  formatted per the *manuscript's* language. Both are dead, so something else is drawing that row.
  Worth a look before deleting.

I have not touched `structure.aiDetectValue`'s sibling copy, the glossary "must obey" phrasing, or
anything in the AI cost lines — those read as deliberate, and they match the design doc.
