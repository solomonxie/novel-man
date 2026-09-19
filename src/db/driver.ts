/**
 * The SQLite driver, kept behind its own door.
 *
 * Its package re-exports without file extensions, which the standalone parse
 * check resolves under `nodenext` and cannot follow — and that check exists to
 * prove the pure-logic modules stand alone, several of which reach a database
 * type by import. So the two things the app uses are named here instead, and
 * the package is reached at runtime only.
 */

export type Scalar = string | number | boolean | null | Uint8Array;
export type QueryResult = { rows?: Record<string, Scalar>[]; rowsAffected?: number };
export type Driver = { execute(sql: string, params?: Scalar[]): Promise<QueryResult> };

declare const require: (name: string) => {
  open(options: { name: string; location?: string }): Driver;
  IOS_DOCUMENT_PATH: string;
};

const driver = require('@op-engineering/op-sqlite');

/** Where expo-sqlite kept it, and so where it still is. */
export const SQLITE_FOLDER = `${driver.IOS_DOCUMENT_PATH}/SQLite`;

export function openDatabase(name: string): Driver {
  return driver.open({ name, location: SQLITE_FOLDER });
}
