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
];
