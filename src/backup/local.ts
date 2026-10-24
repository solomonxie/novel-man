import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { Directory, File, Paths } from '../storage/fs';
import { ownPath } from '../storage/own';
import { zipInto } from '../storage/compress';

import type { Database } from '../db';

import { db, setBeforeMigrations } from '../db';
import { lastUploadedAnywhere, recordUpload } from '../db/jobs';
import {
  booksChangedSince,
  hasBooks,
  libraryCounts,
  listBookIds,
  readingOffsets,
} from '../db/repo';
import { buildBundle, openBundle, type OpenedBundle } from './bundle';
import { withBase } from './chain';
import { BundleError, dateOf, dayStamp, secondStamp, type BundleAbout } from './format';
import { recordAttempt } from './attempts';

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
const weeklyName = () => `${dayStamp()}-weekly-novel-man.zip`;
const databaseName = () => `${dayStamp()}-database-novel-man.zip`;
/**
 * Ours to sweep, which the daily and the database copy are and a pre-deletion
 * copy never is. The guard copies were meant to be in here and were not: they
 * are named to the second — `20260924T…-before-restore` — and this pattern
 * asked for the dashed day, so every copy taken before an import or a restore
 * since has been kept forever.
 */
const OURS = /^(\d{4}-\d{2}-\d{2}-(daily|weekly|database)|\d{14}-before-)/;
/** A week, not a count: once an operation can add a file, a count silently
 *  caps how many imports you get before yesterday is gone. */
const KEEP_DAYS = 7;
/** The database copy guards against a bad migration, which shows within a
 *  day; the portable daily zip holds the same library for the full week. */
const KEEP_DATABASE_DAYS = 2;
/** A daily copy is only as old as a week and needs the weekly copy it was
 *  taken against, which is at most a week older again. */
const KEEP_WEEKLY_DAYS = 15;
const WEEK = 7 * 24 * 60 * 60 * 1000;
/** The weekly copy dailies are taken against, and the moment it was begun. */
const BASE = 'backup.weeklyBase';

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
 *
 * Zipped: 60 MB raw is 20 MB deflated, and a week of them was most of what the
 * app took up. Copied first and zipped from the copy, so the zip reads a file
 * nothing is writing to.
 */
export async function snapshotDatabase(open?: Database): Promise<boolean> {
  try {
    const database = open ?? (await db());
    await database.execAsync('PRAGMA wal_checkpoint(FULL)');
    const live = new File(ownPath('SQLite'), 'novelman.db');
    if (!live.exists) return false;
    const copy = new File(Paths.cache, 'database-snapshot.db');
    if (copy.exists) copy.delete();
    live.copy(copy);
    try {
      const target = new File(folder(), databaseName());
      if (target.exists) target.delete();
      await zipInto(copy, target, 'novelman.db');
    } catch {
      // Unzipped beats none.
      const raw = new File(folder(), databaseName().replace(/\.zip$/, '.db'));
      if (raw.exists) raw.delete();
      copy.copy(raw);
    } finally {
      copy.delete();
    }
    return true;
  } catch {
    return false;
  }
}

/** Database copies written raw before they were zipped, zipped now. */
export async function zipDatabaseCopies(): Promise<void> {
  for (const entry of folder().list()) {
    if (!(entry instanceof File) || !/-database-novel-man\.db$/.test(entry.name)) continue;
    const target = new File(folder(), entry.name.replace(/\.db$/, '.zip'));
    try {
      if (!target.exists) await zipInto(entry, target, 'novelman.db');
      entry.delete();
    } catch {
      // Kept raw; tried again next launch.
    }
  }
}

/**
 * The same bytes every other tier gets, so one can be dragged out anywhere.
 * Answers with what it measured rather than whether it worked: the log wants
 * the library this copy was of, and null already means it did not happen.
 */
async function writeBundle(
  name: string,
  daily?: { ids: string[] } & NonNullable<Parameters<typeof buildBundle>[1]>
): Promise<BundleAbout | null> {
  try {
    const bundle = daily ? await buildBundle(daily.ids, daily) : await buildBundle();
    const file = new File(folder(), name);
    if (file.exists) file.delete();
    file.create();
    file.write(bundle.body as Uint8Array);
    return bundle.about;
  } catch {
    return null;
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
  return (await writeBundle(`${secondStamp()}-before-${what}-novel-man.zip`)) !== null;
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
  const snapshot = await snapshotDatabase();
  const { name: rolling, about } = await writeWeeklyOrDaily();
  if (!about) {
    await recordAttempt('local', {
      ok: false,
      error: snapshot ? 'the daily copy could not be written' : 'no copy could be written',
      name: rolling,
    });
    return false;
  }
  await recordUpload(LEDGER, rolling, dayStamp());
  await recordAttempt('local', {
    ok: true,
    bytes: new File(folder(), rolling).size,
    name: rolling,
    books: about.books,
    words: about.words,
  });
  prune();
  return true;
}

/**
 * Once a week the whole library; every other day only the books that changed
 * since, and of those only their light parts unless their text moved too. A
 * day of reading and annotating is kilobytes, not the 35 MB a whole copy is.
 *
 * The weekly copy's time is taken before it is built, so a write made while it
 * was being read is in the next daily rather than in neither.
 */
async function writeWeeklyOrDaily(): Promise<{ name: string; about: BundleAbout | null }> {
  const base = await currentBase();
  if (!base) {
    const name = weeklyName();
    const begun = Date.now();
    const about = await writeBundle(name);
    if (about) await AsyncStorage.setItem(BASE, JSON.stringify({ name, createdAt: begun }));
    return { name, about };
  }
  const name = rollingName();
  const changed = await booksChangedSince(base.createdAt);
  const about = await writeBundle(name, {
    ids: changed.map((book) => book.id),
    light: new Set(changed.filter((book) => !book.heavy).map((book) => book.id)),
    changes: {
      base: base.name,
      baseCreatedAt: base.createdAt,
      present: await listBookIds(),
      offsets: await readingOffsets(),
    },
    about: { createdAt: 0, ...(await libraryCounts()) },
  });
  return { name, about };
}

async function currentBase(): Promise<{ name: string; createdAt: number } | null> {
  try {
    const base = JSON.parse((await AsyncStorage.getItem(BASE)) ?? 'null') as {
      name: string;
      createdAt: number;
    } | null;
    if (!base || Date.now() - base.createdAt >= WEEK) return null;
    return new File(folder(), base.name).exists ? base : null;
  } catch {
    return null;
  }
}

/**
 * A backup as the library it describes: a daily copy is opened together with
 * the weekly one beside it, which it cannot be restored without.
 */
export function openWithBase(opened: OpenedBundle): OpenedBundle {
  const changes = opened.snapshot.changes;
  if (!changes) return opened;
  const weekly = new File(folder(), changes.base);
  if (!weekly.exists) throw new BundleError('missing-base', changes.base);
  return withBase(opened, openBundle(weekly.bytesSync()));
}

/**
 * Ours to tidy, and only ours: a file someone else put here is not this app's,
 * and a pre-deletion copy is never swept — it is the only thing standing
 * between a wipe and the work it wiped. The age is the day in the name rather
 * than the file's timestamp — the name is what the promise is made in
 * ("anything from the last week"), and it does not move when a file is copied.
 */
function prune(): void {
  const daysAgo = (days: number) => Date.now() - days * 24 * 60 * 60 * 1000;
  try {
    for (const entry of folder().list()) {
      if (!(entry instanceof File)) continue;
      if (!OURS.test(entry.name)) continue;
      const day = dateOf(entry.name);
      const keep = entry.name.includes('-database-')
        ? KEEP_DATABASE_DAYS
        : entry.name.includes('-weekly-')
          ? KEEP_WEEKLY_DAYS
          : KEEP_DAYS;
      if (day && day.getTime() < daysAgo(keep)) entry.delete();
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
