# Revisions — a book whose file changed underneath it

Not built. This is the reasoning, written down so it isn't derived twice:
what happens when a manuscript imported from a local file is edited and has
to come in again, and what the storage model would look like if it were
designed for that from the start.

Product reasoning in [DESIGN.md](DESIGN.md), build order in
[IMPLEMENT_PLAN.md](IMPLEMENT_PLAN.md).


## What breaks today

`importFile` (`src/import/pipeline.ts`) always inserts a new book. Re-picking
an edited file gives a second shelf row with the same title: the old one has
the highlights, the fixed chapter breaks, the translations and the cast; the
new one has the new words. Nothing links them.

Overwriting `documents.text` in place is worse, because two addressing
schemes hang off it and both move when the text does.

**Character offsets into `documents.text`:**

| table | columns |
|---|---|
| `annotations` | `start, end` (+ `prefix`/`quote`/`suffix`) |
| `translation_units` | `start, end` — unique on `(book_id, target, start, end)` |
| `chapters`, `scenes`, `verses`, `images` | `start, end` |
| `reading_state` | `offset` |

**Ordinals:** `chapters.idx`, `scenes.idx`, `part_details.idx`,
`part_names.part_idx`, `chapter_idx` on `observations`, `mentions`,
`translation_units`, `work_jobs`, `script_elements`, `images`, plus
`relations.first_chapter/last_chapter`, `verses.number`,
`script_elements.scene_idx/position`.

Roughly: 7 tables carry offsets, 9 carry ordinals, ~35 SQL sites reference
them, 41 files touch `start`/`end`, 21 touch `chapter_idx`. One function
exists only to repair the scheme after a restructure (`reindexByOffset`).

An offset is both the join key *and* the render coordinate — `annotationAt`
and `placeTranslation` both match by overlap — so nothing can replace it
outright; a second key can only sit beside it.

One more trap: `source_hash` is `bytesFingerprint` — length plus every
*stride*-th byte. Fine for naming a file on disk, unsound as a "did it
change?" test: a same-length `.txt` edit can fingerprint identically.


## What a revision has to do

A *revision of a book*, not a second import.

**Identity.** Explicit is the reliable path — **Update from file…** on the
book page, so the user names the target. Opportunistic on a normal import:
`source_name` match, or `findBookNamed`, offering *Update «Title»* / *Add as
new*. Optionally a link: the installed picker already exports
`pick({ mode: 'open', requestLongTermAccess: true })`, which returns a
security-scoped bookmark, so the app can re-read the original and notice it
changed without the user hunting for it. Lineage wants its own table —
`book_sources(book_id, source_hash, source_path, text_hash, imported_at)`,
one row per version, `books.source_hash` meaning "current".

**Change detection.** Decide on the extracted *text*, not the bytes: a
`text_hash` over the whole normalized `doc.text`, one pass, no base64. A
docx re-exported with identical words then costs nothing — the commonest
false alarm. A per-chapter hash too, so "which chapters changed" is a join.

**The remap.** Full-text LCS is O(n·m) and not an option on 3 MB.
Paragraph-level, patience-style: split both texts on paragraph bounds, trim
common prefix and suffix, hash paragraphs, take those unique in both, LIS
over them for anchors, recurse between them, and call a span *dirty* where
nothing is unique. Yields `(oldStart,oldEnd) → (newStart,newEnd)` runs plus
gaps, so `mapOffset(old)` is exact inside a run and clamp-and-flag inside a
gap. Must `yieldToUI` like the parsers do.

**Migration, one rule per table:**

| rows | rule |
|---|---|
| `annotations` | not the map — `repairAll` is better (quote + 40 chars of context, nearest occurrence), given a hint already passed through `mapOffset`. Unplaced ones are kept and reported, never deleted; wants an `orphan` flag |
| `reading_state` | `mapOffset`, clamped to a paragraph start |
| `chapters` | re-detect, then preserve identity: match by anchor text and `user_edited` title, keep matched chapters' **ids** so `scenes.chapter_id` and `verses.chapter_id` survive by FK, and emit `oldIdx → newIdx`. `replaceChapters` can't be reused — it deletes all scenes |
| `scenes`, `verses` | offsets through the map; anything crossing a dirty gap is dropped — scenes are marked or analyzed, never inferred |
| `translation_units` | match by `source` **text**. Unchanged → new offsets and `chapter_idx`, machine and edited intact. Changed → update `source`, `stale = 1`, leave `edited` alone. Gone → write to `translation_memory`, then delete. Mind the unique index on `(start,end)`: apply moves in a non-colliding order inside the transaction |
| `observations`, `mentions`, briefs, `script_elements`, `part_details` | renumber via the chapter map; chapters whose hash changed are flagged for re-analysis. `ai_cache` is content-keyed, so unchanged chapters re-run free |
| `images` | `chapter_idx` deliberately does not follow renumbering; `(start,end)` go through the map |
| entities, terms, relations | book-scoped, untouched |

**Safety.** One transaction — a remap that throws leaves the book as it was.
`buildBundle` for that one book into `revisions/` first: existing machinery,
one zip, and the only real undo for lost highlights. The previous source
file is already content-addressed on disk, so reverting is a revision
against the older version. Show the summary before committing ("+3 chapters,
12 changed, 4 highlights can't be placed, 310 sentences stale") — a revision
nobody can inspect is one nobody trusts. Fast path: no annotations, no
translations, no AI output, no user-edited chapters → replace and re-detect.
Afterwards `queueBackup(connection, [bookId])`; the bundle fingerprint
changes and the cloud copy follows.


## Why hashing sentences is not the fix

Tempting: key attachments by a hash of the sentence, so unchanged sentences
keep what is attached. It solves one case and fails the one that matters.

- **An edited sentence loses identity completely.** One typo and the hash
  changes, so its translation and highlight detach — and "the content
  changed" is the whole scenario. A diff gives a *correspondence* and lets
  the edit survive as `stale`; a hash is all-or-nothing.
- **Sentences repeat.** "He nodded." appears 200 times in a novel; a bible
  has verbatim repeated verses. The key becomes `(hash, nth occurrence)`,
  and the occurrence ordinal shifts when an earlier duplicate is added.
- **Boundaries move without the text moving.** The segmenter is heuristic —
  the abbreviations regex, CJK terminators, a *guessed* language. Touch any
  of them and every hash changes though no word did. It has happened once
  already: `units_resplit` exists because of a re-split.
- **Not everything is a sentence.** Highlights span three or half of one;
  scenes, chapters and verses are ranges.
- **It means storing sentences.** Today they are derived and free. A table
  is 30–50k rows per novel, plus keeping it in sync — weight, against a
  stated constraint.

The right shape is the one `annotations` already has and
`translation_units` doesn't: **ids are born, hashes match, offsets are a
cache.** `placeTranslation.anchor()` re-finds a unit by its own words at
render time and throws the answer away; persist that instead.

Three tiers on a revision: exact normalized-hash match (wholesale movement,
one join) → context anchor for edited text → diff correspondence for the
rest. Normalize before hashing: smart quotes and whitespace flip on every
docx re-export, and an unnormalized hash calls everything changed.

The `chapter_idx` family is a separate problem that sentence hashes do
nothing for. That one is fixed by matching chapters and remapping.


## If it were built again

Three rules produce most of it:

1. Nothing durable is addressed by a number that can shift — not a character
   offset into a 3 MB string, not `chapter_idx`.
2. Ids are born, hashes match.
3. Derived data records what it was derived from.

The book becomes an ordered list of identified blocks, and everything points
at *(block id, offset within block)*.

```sql
revisions(id, book_id, source_hash, note, created_at)

blocks(
  id          TEXT PRIMARY KEY,   -- born once, never derived from content
  book_id     TEXT,
  rank        TEXT,               -- fractional key: 'a0' < 'a0V' < 'a1'
  kind        TEXT,               -- para | heading | verse | figure | break
  text        TEXT,
  hash        TEXT,               -- of normalized text: the matching key
  rev_added   INTEGER,
  rev_removed INTEGER             -- tombstone, so history is free
)
CREATE INDEX blocks_order ON blocks(book_id, rank);
CREATE INDEX blocks_hash  ON blocks(book_id, hash);
CREATE VIRTUAL TABLE blocks_fts USING fts5(text, content=blocks);

-- part, chapter, scene, verse: one shape at different depths
sections(id, book_id, kind, parent_id, rank, title,
         first_block, last_block, source)

-- the only place "where in the book" is ever written down
anchors(id, book_id, start_block, start_off, end_block, end_off,
        quote, prefix, suffix, state)

annotations(id, anchor_id, kind, color, note, created_at)
translations(id, anchor_id, target, machine, edited, input_hash, updated_at)
images(id, book_id, anchor_id?, section_id?, prompt, path, ...)
derived(id, book_id, scope_id, kind, payload, input_hash, created_at)
reading_state(book_id, block_id, offset, updated_at)
```

What each choice removes:

- **Block-relative offsets** — an edit's blast radius is one block. Insert a
  paragraph in chapter 1 and nothing in chapter 40 moves.
- **Fractional `rank`, no stored ordinal** — inserting or splitting costs one
  row, never a renumber. Display numbers are `row_number() over (order by
  rank)`, computed at read.
- **`sections` referenced by id** — the whole `chapter_idx` family follows a
  chapter that moved. `reindexByOffset` and `mergeUserEdits` stop existing.
- **One `anchors` table** — one repair routine, one orphan report. A new
  feature that attaches to text writes one row and inherits all of it.
- **`input_hash` on derived rows** — staleness is provable, not heuristic.
  `translation_units.stale` and the content-keyed `ai_cache` are this idea
  half-built.
- **Blocks instead of a blob** — `getDocumentText` leaves the reading path;
  search stops being `instr(lower(d.text), needle)` over megabytes per book
  and becomes FTS5 with positions; `FlatList` rows come from a range query.
- **Tombstones + revisions** — "what changed since I last read", revert and
  a diff view become possible. A typo fix in a 3 MB book costs one row.

A re-import is then: hash the new blocks, join on `blocks_hash`, patience-
diff the unmatched runs. Unchanged blocks are not touched at all — anchors,
translations and cast intact by construction rather than by repair. Changed
keeps its id and bumps its rev; anchors inside are repaired by context, and
derived rows whose `input_hash` no longer matches flip stale by themselves.
Inserted gets new ids between ranks. Deleted is tombstoned and its anchors
are reported orphaned.

Sentences stay derived. `segmentSentences` is heuristic and has already
changed once; a unit anchors to a block range so a later disagreement about
sentence bounds still points at real words.

Costs, honestly: 30–50k block rows per novel and ~31k verses for a bible,
written in one transaction on import; `blocks_fts` roughly doubles the text
on disk; whole-text operations (export, print, AI context) become a range
scan and a concatenation, cached per revision if it turns out hot; and
normalization has to be decided once, early, because the hash is only as
good as it. Side benefit for cloud sync: stable ids plus fractional ranks
make multi-device merge last-write-wins per row, with no conflicting offsets.


## Order, if this is ever picked up

1. Match `translation_units` by their existing `source` column during a
   revision. No schema change, and most of the benefit of hashing.
2. `source_hash` + `prefix`/`suffix` on units, indexed — matching becomes a
   join, and edited sentences get a second chance via context.
3. An `anchors` table that new features use, and annotations migrate into.
4. `section_id` replacing `chapter_idx` on the derived tables.
5. Blocks, last. The blob can stay a long time after the rest.
