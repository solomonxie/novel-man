export const migrations: string[] = [
  `CREATE TABLE books (
     id TEXT PRIMARY KEY NOT NULL,
     title TEXT NOT NULL,
     author TEXT,
     language TEXT NOT NULL DEFAULT 'en',
     source_name TEXT NOT NULL,
     source_hash TEXT NOT NULL,
     source_path TEXT NOT NULL,
     source_ext TEXT NOT NULL,
     word_count INTEGER NOT NULL DEFAULT 0,
     char_count INTEGER NOT NULL DEFAULT 0,
     cover_hue INTEGER NOT NULL DEFAULT 0,
     created_at INTEGER NOT NULL
   );
   CREATE TABLE documents (
     book_id TEXT PRIMARY KEY NOT NULL REFERENCES books(id) ON DELETE CASCADE,
     text TEXT NOT NULL
   );
   CREATE TABLE chapters (
     id TEXT PRIMARY KEY NOT NULL,
     book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
     idx INTEGER NOT NULL,
     title TEXT NOT NULL,
     start INTEGER NOT NULL,
     end INTEGER NOT NULL,
     confident INTEGER NOT NULL DEFAULT 1,
     user_edited INTEGER NOT NULL DEFAULT 0
   );
   CREATE INDEX chapters_book ON chapters(book_id, idx);
   CREATE TABLE annotations (
     id TEXT PRIMARY KEY NOT NULL,
     book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
     kind TEXT NOT NULL,
     color TEXT,
     start INTEGER NOT NULL,
     end INTEGER NOT NULL,
     quote TEXT NOT NULL,
     note TEXT,
     created_at INTEGER NOT NULL
   );
   CREATE INDEX annotations_book ON annotations(book_id, start);
   CREATE TABLE reading_state (
     book_id TEXT PRIMARY KEY NOT NULL REFERENCES books(id) ON DELETE CASCADE,
     offset INTEGER NOT NULL DEFAULT 0,
     updated_at INTEGER NOT NULL
   );`,

  // Editable book metadata, plus the named things a story is made of.
  // Characters and places differ only in what they're called, so one table
  // with a kind beats two that would drift apart.
  `ALTER TABLE books ADD COLUMN year TEXT;
   ALTER TABLE books ADD COLUMN edition TEXT;
   ALTER TABLE books ADD COLUMN cover_path TEXT;
   CREATE TABLE entities (
     id TEXT PRIMARY KEY NOT NULL,
     book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
     kind TEXT NOT NULL,
     name TEXT NOT NULL,
     alias TEXT,
     summary TEXT,
     portrait_path TEXT,
     fields TEXT NOT NULL DEFAULT '[]',
     sort_index INTEGER NOT NULL DEFAULT 0,
     created_at INTEGER NOT NULL
   );
   CREATE INDEX entities_book ON entities(book_id, kind, sort_index);`,

  // Scenes are what every later analysis indexes by. Re-detection needs the
  // structure hints the parser found, so the document keeps them too — only
  // the hint-bearing blocks, since paragraph bounds are recoverable from text.
  `CREATE TABLE scenes (
     id TEXT PRIMARY KEY NOT NULL,
     book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
     chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
     idx INTEGER NOT NULL,
     start INTEGER NOT NULL,
     end INTEGER NOT NULL
   );
   CREATE INDEX scenes_chapter ON scenes(chapter_id, idx);
   ALTER TABLE documents ADD COLUMN hints TEXT NOT NULL DEFAULT '[]';`,

  // An annotation that only knows its offsets is lost the moment the text is
  // re-imported or re-split; its surrounding words are what find it again.
  `ALTER TABLE annotations ADD COLUMN prefix TEXT NOT NULL DEFAULT '';
   ALTER TABLE annotations ADD COLUMN suffix TEXT NOT NULL DEFAULT '';`,

  // An AI answer is bought once. Keyed by the hash of what was asked, so the
  // same chapter re-analyzed after an edit elsewhere costs nothing.
  `CREATE TABLE ai_cache (
     hash TEXT PRIMARY KEY NOT NULL,
     kind TEXT NOT NULL,
     response TEXT NOT NULL,
     created_at INTEGER NOT NULL
   );`,

  // The cast, as the analysis actually produces it: one row per character,
  // one observation per chapter it was seen in, and a mention count computed
  // locally. Keeping observations separate is what makes a continuity check
  // possible — a merged profile has already thrown away the disagreement.
  `ALTER TABLE entities ADD COLUMN role TEXT;
   ALTER TABLE entities ADD COLUMN appearance TEXT;
   ALTER TABLE entities ADD COLUMN voice TEXT;
   ALTER TABLE entities ADD COLUMN arc TEXT;
   ALTER TABLE entities ADD COLUMN source TEXT NOT NULL DEFAULT 'manual';
   CREATE TABLE observations (
     id TEXT PRIMARY KEY NOT NULL,
     book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
     entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
     chapter_idx INTEGER NOT NULL,
     appearance TEXT,
     voice TEXT,
     note TEXT
   );
   CREATE INDEX observations_entity ON observations(entity_id, chapter_idx);
   CREATE TABLE mentions (
     entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
     book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
     chapter_idx INTEGER NOT NULL,
     count INTEGER NOT NULL,
     PRIMARY KEY (entity_id, chapter_idx)
   );
   CREATE TABLE relations (
     id TEXT PRIMARY KEY NOT NULL,
     book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
     from_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
     to_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
     label TEXT NOT NULL,
     first_chapter INTEGER NOT NULL,
     last_chapter INTEGER NOT NULL
   );
   CREATE INDEX relations_book ON relations(book_id);
   CREATE TABLE continuity_flags (
     id TEXT PRIMARY KEY NOT NULL,
     book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
     entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
     kind TEXT NOT NULL,
     detail TEXT NOT NULL,
     status TEXT NOT NULL DEFAULT 'open',
     created_at INTEGER NOT NULL
   );
   CREATE INDEX flags_book ON continuity_flags(book_id, status);`,

  // Translation keeps machine output and the human edit in separate columns so
  // a re-run never destroys an edit, and a diff between them is always
  // available — which is what makes the post-edit memory possible. Units are
  // (start, end) into the same document text everything else addresses.
  `CREATE TABLE translation_units (
     id TEXT PRIMARY KEY NOT NULL,
     book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
     target TEXT NOT NULL,
     chapter_idx INTEGER NOT NULL,
     start INTEGER NOT NULL,
     end INTEGER NOT NULL,
     source TEXT NOT NULL,
     machine TEXT,
     edited TEXT,
     stale INTEGER NOT NULL DEFAULT 0,
     updated_at INTEGER NOT NULL
   );
   CREATE UNIQUE INDEX translation_units_span
     ON translation_units(book_id, target, start, end);
   CREATE INDEX translation_units_chapter
     ON translation_units(book_id, target, chapter_idx);
   CREATE TABLE terms (
     id TEXT PRIMARY KEY NOT NULL,
     book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
     target TEXT NOT NULL,
     source TEXT NOT NULL,
     translation TEXT NOT NULL,
     locked INTEGER NOT NULL DEFAULT 0,
     note TEXT,
     entity_id TEXT,
     created_at INTEGER NOT NULL
   );
   CREATE UNIQUE INDEX terms_unique ON terms(book_id, target, source);
   CREATE TABLE translation_memory (
     id TEXT PRIMARY KEY NOT NULL,
     book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
     target TEXT NOT NULL,
     source TEXT NOT NULL,
     machine TEXT NOT NULL,
     edited TEXT NOT NULL,
     created_at INTEGER NOT NULL
   );
   CREATE INDEX memory_book ON translation_memory(book_id, target);`,

  // Cloud work outlives the screen that started it, so the queue is a table
  // rather than an array. A job is claimed inside a transaction, which is what
  // stops two drains doing the same upload, and anything left 'running' at
  // launch was killed mid-flight and is requeued.
  `CREATE TABLE cloud_jobs (
     id TEXT PRIMARY KEY NOT NULL,
     connection_id TEXT NOT NULL,
     kind TEXT NOT NULL,
     book_id TEXT,
     payload TEXT NOT NULL DEFAULT '{}',
     status TEXT NOT NULL DEFAULT 'pending',
     attempts INTEGER NOT NULL DEFAULT 0,
     error TEXT,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL
   );
   CREATE INDEX cloud_jobs_status ON cloud_jobs(status, created_at);
   CREATE TABLE cloud_uploads (
     connection_id TEXT NOT NULL,
     key TEXT NOT NULL,
     hash TEXT NOT NULL,
     uploaded_at INTEGER NOT NULL,
     PRIMARY KEY (connection_id, key)
   );`,

  // A screenplay is a different shape from a novel — headings, action, cues,
  // dialogue — so it is stored as typed elements per scene rather than as text
  // that would have to be re-parsed to export it twice.
  `CREATE TABLE script_elements (
     id TEXT PRIMARY KEY NOT NULL,
     book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
     chapter_idx INTEGER NOT NULL,
     scene_idx INTEGER NOT NULL,
     position INTEGER NOT NULL,
     type TEXT NOT NULL,
     text TEXT NOT NULL
   );
   CREATE INDEX script_book ON script_elements(book_id, chapter_idx, scene_idx, position);`,

  // Long work is a table, not a promise chain. A 500-chapter analysis outlives
  // the screen that started it, so each chapter is its own row with its own
  // status — which is what makes progress visible, failure survivable, and a
  // resume free. `engine` records whether a unit cost money or not.
  // 
  // Summaries live beside what they summarize: a book has one, a chapter has a
  // brief, and both are what a later pass is given as context.
  `ALTER TABLE books ADD COLUMN summary TEXT;
   ALTER TABLE chapters ADD COLUMN brief TEXT;
   CREATE TABLE work_jobs (
     id TEXT PRIMARY KEY NOT NULL,
     run_id TEXT NOT NULL,
     book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
     kind TEXT NOT NULL,
     engine TEXT NOT NULL DEFAULT 'ai',
     label TEXT NOT NULL,
     chapter_idx INTEGER,
     payload TEXT NOT NULL DEFAULT '{}',
     status TEXT NOT NULL DEFAULT 'pending',
     attempts INTEGER NOT NULL DEFAULT 0,
     error TEXT,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL
   );
   CREATE INDEX work_jobs_run ON work_jobs(run_id, chapter_idx);
   CREATE INDEX work_jobs_status ON work_jobs(status, created_at);`,

  // Scene detection used to call a chapter with no separator "one scene",
  // which made the scene count equal the chapter count and told nobody
  // anything. Those rows are artefacts, not data: a scene break always
  // produces two or more, so a scene spanning its whole chapter can only have
  // come from the old fallback.
  `DELETE FROM scenes WHERE id IN (
     SELECT s.id FROM scenes s JOIN chapters c ON c.id = s.chapter_id
     WHERE s.start = c.start AND s.end = c.end
   );`,

  // Indexes for the lookups that had none. Every one of these filters by book,
  // and without them SQLite reads the whole table — which on a 500-chapter book
  // with a cast of eighty is the difference between instant and noticeable.
  `CREATE INDEX IF NOT EXISTS scenes_book ON scenes(book_id);
   CREATE INDEX IF NOT EXISTS mentions_book ON mentions(book_id, chapter_idx);
   CREATE INDEX IF NOT EXISTS observations_book ON observations(book_id);
   CREATE INDEX IF NOT EXISTS flags_entity ON continuity_flags(entity_id);
   CREATE INDEX IF NOT EXISTS ai_cache_created ON ai_cache(created_at);`,

  // Re-reading a chapter used to append a second observation beside the first
  // instead of correcting it, so a profile built by joining them read as its
  // own text stuttered back twice. Keep the newest row per chapter.
  `DELETE FROM observations WHERE rowid NOT IN (
     SELECT MAX(rowid) FROM observations GROUP BY entity_id, chapter_idx
   );
   CREATE UNIQUE INDEX IF NOT EXISTS observations_once ON observations(entity_id, chapter_idx);`,

  // Age and gender are near-universal and worth sorting and filtering by, so
  // they are columns. Everything else a genre cares about — cultivation level,
  // house, ship, rank — stays in the free-form `fields` list.
  `ALTER TABLE entities ADD COLUMN age TEXT;
   ALTER TABLE entities ADD COLUMN gender TEXT;`,

  // Relations used to be wholly AI-owned, so re-extracting them wiped the
  // table. A relation the reader wrote is not the model's to delete.
  `ALTER TABLE relations ADD COLUMN source TEXT NOT NULL DEFAULT 'ai';
   ALTER TABLE relations ADD COLUMN note TEXT;`,

  // Scenes are no longer guessed at import. A separator run is a real mark, but
  // a chapter without one is not sceneless — it just wasn't typeset that way —
  // so the honest default is empty until someone or something reads it. What a
  // scene is *about* is the point of having it, hence title and summary.
  `ALTER TABLE scenes ADD COLUMN title TEXT;
   ALTER TABLE scenes ADD COLUMN summary TEXT;
   ALTER TABLE scenes ADD COLUMN source TEXT NOT NULL DEFAULT 'manual';`,

  // The job status is a stored string, and the codebase moved to American
  // spelling — rows written before that would otherwise stop matching.
  `UPDATE work_jobs SET status = 'canceled' WHERE status = 'cancelled';`,

  // What was actually sent, so a bill can be traced back to a prompt. The key
  // itself is never here — only which stored key was used.
  `CREATE TABLE ai_requests (
     id TEXT PRIMARY KEY NOT NULL,
     key_id TEXT NOT NULL,
     vendor_id TEXT NOT NULL,
     model TEXT NOT NULL,
     prompt TEXT NOT NULL,
     response TEXT,
     error TEXT,
     input_tokens INTEGER NOT NULL DEFAULT 0,
     output_tokens INTEGER NOT NULL DEFAULT 0,
     usd REAL NOT NULL DEFAULT 0,
     created_at INTEGER NOT NULL
   );
   CREATE INDEX ai_requests_key ON ai_requests(key_id, created_at);`,

  // What a book *is* decides what the app offers for it. Existing books were
  // all imported as novels, which is also the only honest default for one that
  // arrives through the share sheet with nobody to ask.
  `ALTER TABLE books ADD COLUMN kind TEXT NOT NULL DEFAULT 'novel';`,

  // A level above the chapter, for books that have one: a bible's book, a
  // novel's 卷. It is a label and an order carried by the chapters under it
  // rather than a second tree — nothing else in the app has to learn about it.
  `ALTER TABLE chapters ADD COLUMN part_idx INTEGER;
   ALTER TABLE chapters ADD COLUMN part_title TEXT;`,

  // The citable unit. Same shape as everything else that addresses the text:
  // a range of offsets, so a verse, a highlight and a chapter are one idea.
  `CREATE TABLE verses (
     book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
     chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
     number INTEGER NOT NULL,
     start INTEGER NOT NULL,
     end INTEGER NOT NULL,
     PRIMARY KEY (chapter_id, number)
   );
   CREATE INDEX verses_book ON verses(book_id, start);`,

  // What the edition calls its own books, so a reference parses in the
  // language the edition is written in: \toc1 long, \toc2 short, \toc3 abbr.
  `CREATE TABLE part_names (
     book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
     part_idx INTEGER NOT NULL,
     name TEXT NOT NULL,
     PRIMARY KEY (book_id, part_idx, name)
   );`,

  // A part is still a label carried by its chapters, but it is now a page you
  // can open — and a summary and a picture have nowhere on a chapter to live.
  // Only what the reader writes is here; the title stays on the chapters.
  `CREATE TABLE part_details (
     book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
     idx INTEGER NOT NULL,
     summary TEXT,
     image_path TEXT,
     PRIMARY KEY (book_id, idx)
   );`,

  // One kind for both: a tutorial and a textbook are the same book to this app.
  `UPDATE books SET kind = 'textbook' WHERE kind = 'tutorial';`,

  // The index a source publishes, kept here — `apt update`, for books. One
  // table for every source, so one search covers all of them, and `needle` is
  // the row flattened and lowercased because that is what a LIKE reads.
  `CREATE TABLE catalog (
     source TEXT NOT NULL,
     ext_id TEXT NOT NULL,
     title TEXT NOT NULL,
     author TEXT NOT NULL DEFAULT '',
     language TEXT NOT NULL DEFAULT '',
     needle TEXT NOT NULL DEFAULT '',
     PRIMARY KEY (source, ext_id)
   );
   CREATE TABLE catalog_state (
     source TEXT PRIMARY KEY NOT NULL,
     fetched_at INTEGER NOT NULL,
     count INTEGER NOT NULL
   );`,

  // Passages fetched from a licensed source, kept so a second read of the same
  // verse is instant and works offline. Bounded on purpose: this is a record of
  // what someone read, not a copy of the book, and it never leaves the device —
  // no backup carries it, because a backup is a file that can be handed on.
  `CREATE TABLE passage_cache (
     source TEXT NOT NULL,
     query TEXT NOT NULL,
     reference TEXT NOT NULL,
     text TEXT NOT NULL,
     fetched_at INTEGER NOT NULL,
     PRIMARY KEY (source, query)
   );`,

  // A book whose words are not here. Everything else about it is — its
  // chapters, its parts, what was read of it, what a pass concluded — but the
  // text of each chapter arrives when that chapter is opened and is kept only
  // as a cache. Null for every book that carries its own manuscript.
  `ALTER TABLE books ADD COLUMN text_source TEXT;`,

  // Which chapter a mark is in. Null for every book that has a manuscript,
  // where the offsets say it already; set for a book whose text is fetched a
  // chapter at a time, where every chapter starts at zero and the offsets
  // alone would put all of them on top of each other.
  `ALTER TABLE annotations ADD COLUMN chapter_id TEXT;`,
];
