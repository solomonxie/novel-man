import * as SQLite from 'expo-sqlite';
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
  return database;
}

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
