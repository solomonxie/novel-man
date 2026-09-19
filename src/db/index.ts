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
  if (!handle) handle = open();
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
    await database.execAsync(migrations[version]);
    version += 1;
    await database.execAsync(`PRAGMA user_version = ${version}`);
  }
  return database;
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
