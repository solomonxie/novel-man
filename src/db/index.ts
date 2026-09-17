import * as SQLite from 'expo-sqlite';
import { noticeChange } from '../backup/changes';
import { migrations } from './migrations';

let handle: Promise<SQLite.SQLiteDatabase> | null = null;

export function db(): Promise<SQLite.SQLiteDatabase> {
  if (!handle) handle = open();
  return handle;
}

async function open() {
  const database = await SQLite.openDatabaseAsync('novelman.db');
  await database.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  while (version < migrations.length) {
    await database.execAsync(migrations[version]);
    version += 1;
    await database.execAsync(`PRAGMA user_version = ${version}`);
  }
  return announceWrites(database);
}

/**
 * Everything the app stores goes through this one connection, so raising the
 * change signal here is what keeps it from being forgotten at the next new
 * call site. Patched after the migrations, which nobody backs up.
 */
function announceWrites(database: SQLite.SQLiteDatabase): SQLite.SQLiteDatabase {
  // Cast past the overloads: every one of them is a write, which is all this
  // wrapper cares about.
  const runAsync = database.runAsync.bind(database) as (...args: never[]) => Promise<unknown>;
  database.runAsync = ((...args: never[]) => {
    const result = runAsync(...args);
    noticeChange();
    return result;
  }) as typeof database.runAsync;
  return database;
}

let tail: Promise<unknown> = Promise.resolve();

/**
 * expo-sqlite's `withTransactionAsync` runs BEGIN/COMMIT on the one shared
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
