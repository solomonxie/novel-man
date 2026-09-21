import { openDatabase, type Scalar } from './driver';
import { noticeChange } from '../backup/changes';
import { migrations } from './migrations';

/**
 * The four calls the app makes of a database, over whichever driver is
 * underneath. Every write goes through `runAsync`, which is why the change
 * signal can live in one place rather than at each new call site.
 */
export type Database = {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, ...params: unknown[]): Promise<{ changes: number }>;
  getFirstAsync<T>(sql: string, ...params: unknown[]): Promise<T | null>;
  getAllAsync<T>(sql: string, ...params: unknown[]): Promise<T[]>;
};

/** Callers pass bindings loose or as one array; the driver wants an array. */
function bind(params: unknown[]): Scalar[] {
  const loose = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
  return loose as Scalar[];
}

let handle: Promise<Database> | null = null;

/**
 * Handed in by the backup layer rather than imported: a migration rewrites
 * rows nobody asked it to, and is the one failure no row-level undo reaches —
 * but the database must not depend on the thing that copies it.
 */
let beforeMigrations: ((database: Database) => Promise<unknown>) | null = null;

export function setBeforeMigrations(hook: typeof beforeMigrations) {
  beforeMigrations = hook;
}

export function db(): Promise<Database> {
  if (!handle) {
    handle = open();
    // A failure must not be cached as the answer forever. One bad open used
    // to reject every query for the rest of the session, which reads on the
    // shelf as a library that has been emptied.
    handle.catch(() => {
      handle = null;
    });
  }
  return handle;
}

async function open() {
  // The same file, in the same place expo-sqlite kept it. Opening anywhere
  // else would silently start an empty library.
  const driver = openDatabase('novelman.db');
  const database: Database = {
    async execAsync(sql) {
      // Migrations arrive as several statements at once; the driver takes one.
      for (const statement of sql.split(';')) {
        if (statement.trim()) await driver.execute(statement);
      }
    },
    async runAsync(sql, ...params) {
      const { rowsAffected } = await driver.execute(sql, bind(params));
      noticeChange();
      return { changes: rowsAffected ?? 0 };
    },
    async getFirstAsync<T>(sql: string, ...params: unknown[]) {
      const { rows } = await driver.execute(sql, bind(params));
      return (rows?.[0] as T) ?? null;
    },
    async getAllAsync<T>(sql: string, ...params: unknown[]) {
      const { rows } = await driver.execute(sql, bind(params));
      return (rows ?? []) as T[];
    },
  };
  await database.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  // The copy that survives a schema problem, taken before the schema changes.
  if (version < migrations.length) await beforeMigrations?.(database).catch(() => undefined);
  while (version < migrations.length) {
    await apply(database, migrations[version]);
    version += 1;
    await database.execAsync(`PRAGMA user_version = ${version}`);
  }
  return database;
}

/**
 * One migration, and a change that is already there is not a failure.
 *
 * The version is an index into the list, so the list is append-only — and a
 * list that is edited in the middle instead renumbers every migration after
 * the edit, which hands an installed app a statement it ran weeks ago. That
 * is a `duplicate column name` at launch, and because nothing else can open
 * the database afterwards, it looks from the shelf exactly like every book
 * being gone. Nothing is: the rows were never touched.
 *
 * So each statement is allowed to find its own work done. Anything else still
 * throws — a schema that half-applied is worth stopping for.
 */
async function apply(database: Database, sql: string) {
  for (const statement of sql.split(';')) {
    if (!statement.trim()) continue;
    try {
      await database.execAsync(statement);
    } catch (error) {
      if (!alreadyDone(String(error))) throw error;
    }
  }
}

function alreadyDone(message: string): boolean {
  return /duplicate column name|already exists/i.test(message);
}

let tail: Promise<unknown> = Promise.resolve();

/**
 * A driver's own transaction helper runs BEGIN/COMMIT on the one shared
 * connection, so two overlapping calls — a drain claiming a job while the
 * caller queues the next run — make the second BEGIN throw. Transactions queue
 * here instead. Never call this from inside another one.
 */
export function transaction<T>(work: () => Promise<T>): Promise<T> {
  const run = tail.then(async () => {
    const database = await db();
    await database.execAsync('BEGIN');
    try {
      const value = await work();
      await database.execAsync('COMMIT');
      return value;
    } catch (error) {
      await database.execAsync('ROLLBACK');
      throw error;
    }
  });
  tail = run.catch(() => undefined);
  return run;
}

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
