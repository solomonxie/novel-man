import { AppState } from 'react-native';
import { Directory, File, Paths } from '../storage/fs';

import type { Database } from '../db';

import { db, setBeforeMigrations } from '../db';
import { lastUploadedAnywhere, recordUpload } from '../db/jobs';
import { hasBooks } from '../db/repo';
import { buildBundle } from './bundle';
import { dateOf, dayStamp, secondStamp } from './format';

/**
 * The copies that never leave the device, and the only ones that are instant,
 * offline and fine-grained. They do not survive the app being deleted — which
 * is not a weakness but a different job: most real data loss is not a lost
 * phone, it is an operation that did exactly what you asked to data you did
 * not mean. iCloud and a bucket answer the lost phone. These answer the bad
 * re-detect, five seconds after it happened.
 *
 * They are never offered as a backup *destination*, because they share the
 * app's sandbox and would be a promise the app cannot keep. The folder is
 * visible in Files, and that door is the whole of its outward value.
 */
const FOLDER = 'Backups';
/** When it was taken, what it is for, whose it is — in that order, so the
 *  folder sorts chronologically and reads as a sentence. */
const rollingName = () => `${dayStamp()}-daily-novel-man.zip`;
const databaseName = () => `${dayStamp()}-database-novel-man.db`;
const OURS = /^\d{4}-\d{2}-\d{2}-(daily|database|before-)/;
/** A week, not a count: once an operation can add a file, a count silently
 *  caps how many imports you get before yesterday is gone. */
const KEEP_DAYS = 7;

function folder(): Directory {
  const dir = new Directory(Paths.document, FOLDER);
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/**
 * The live database, copied whole. It is the only copy that survives a schema
 * problem, which no row-level undo can fix — and the checkpoint is what makes
 * it a copy of the present: without it the newest writes are still sitting in
 * the write-ahead log beside the file, and the copy is silently behind.
 */
export async function snapshotDatabase(open?: Database): Promise<boolean> {
  try {
    const database = open ?? (await db());
    await database.execAsync('PRAGMA wal_checkpoint(FULL)');
    const live = new File(Paths.document, 'SQLite/novelman.db');
    if (!live.exists) return false;
    const target = new File(folder(), databaseName());
    if (target.exists) target.delete();
    live.copy(target);
    return true;
  } catch {
    return false;
  }
}

/** The same bytes every other tier gets, so one can be dragged out anywhere. */
async function writeBundle(name: string): Promise<boolean> {
  try {
    const bundle = await buildBundle();
    const file = new File(folder(), name);
    if (file.exists) file.delete();
    file.create();
    file.write(bundle.body as Uint8Array);
    return true;
  } catch {
    return false;
  }
}

/**
 * Before an import, a re-detect, a restore — anything that rewrites many rows
 * at once. It earns its own file under its own name, because the rolling daily
 * copy captured the good state hours ago or, just as likely, minutes ago and
 * is about to be overwritten by the very state being guarded against.
 */
export async function backUpBefore(what: string): Promise<boolean> {
  if (!(await hasBooks())) return false;
  return writeBundle(`${secondStamp()}-before-${what}-novel-man.zip`);
}

/**
 * The rolling copy, at most once a day: copying megabytes per keystroke to
 * guard against a once-a-year event is the wrong trade. The day is read from
 * the same ledger every other destination is gated by, and written only after
 * the copy is on disk — recorded first, a failed write is remembered as done.
 */
const LEDGER = 'local';

export async function backUpLocally(): Promise<boolean> {
  // Minutes after a wipe this runs on the way to the background, and without
  // this line it writes the emptied shelf over the rolling copy and the
  // database snapshot — the two files someone comes looking for afterwards.
  if (!(await hasBooks())) return false;
  const last = await lastUploadedAnywhere(LEDGER);
  if (last && sameDay(last, Date.now())) return false;
  await snapshotDatabase();
  const rolling = rollingName();
  const wrote = await writeBundle(rolling);
  if (!wrote) return false;
  await recordUpload(LEDGER, rolling, dayStamp());
  prune();
  return true;
}

/**
 * Ours to tidy, and only ours: a file someone else put here is not this app's,
 * and a pre-deletion copy is never swept — it is the only thing standing
 * between a wipe and the work it wiped. The age is the day in the name rather
 * than the file's timestamp — the name is what the promise is made in
 * ("anything from the last week"), and it does not move when a file is copied.
 */
function prune(): void {
  const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;
  try {
    for (const entry of folder().list()) {
      if (!(entry instanceof File)) continue;
      if (!OURS.test(entry.name)) continue;
      const day = dateOf(entry.name);
      if (day && day.getTime() < cutoff) entry.delete();
    }
  } catch {
    // Tidying is never worth failing a backup for.
  }
}

function sameDay(at: number, now: number): boolean {
  const then = new Date(at);
  const today = new Date(now);
  return (
    then.getFullYear() === today.getFullYear() &&
    then.getMonth() === today.getMonth() &&
    then.getDate() === today.getDate()
  );
}

// Registered on import, which is before anything can open the database: the
// hook has to be in place for the very first migration of a fresh install.
setBeforeMigrations(snapshotDatabase);

/** Backgrounding is the one moment the app reliably gets before it is gone. */
export function watchForLocalBackup(): () => void {
  const subscription = AppState.addEventListener('change', (next) => {
    if (next !== 'background') return;
    backUpLocally().catch(() => undefined);
  });
  return () => subscription.remove();
}
