import { NativeModules } from 'react-native';

import { listUnits, saveMachine, type TranslationUnit } from '../db/translation';

/**
 * 简体中文 and 繁體中文 are not two languages. They are one language in two
 * scripts, and going between them is a character lookup — not a reading, not a
 * judgement, nothing a model is needed for. iOS carries the table (ICU) and
 * `ios/NovelMan/ChineseVariant.m` is the door to it, so this costs no key, no
 * network and no waiting: a whole book converts in a handful of calls.
 *
 * Which script the source is in does not have to be known. A Simplified→
 * Traditional pass over text that is already Traditional has nothing to match
 * and leaves it alone, so the direction is decided by the target alone.
 */
const TRANSFORM: Record<string, string> = {
  'zh-Hans': 'Hant-Hans',
  'zh-Hant': 'Hans-Hant',
};

const native = NativeModules.ChineseVariant as
  | { convert(text: string, transform: string): Promise<string> }
  | undefined;

/** One sentence per line, joined for the crossing: the transform is linear in
 *  characters and the bridge crossing is not, so 900 of them are one hop. The
 *  separator is a character no manuscript holds and no transform rewrites. */
const SPLIT = '';

/** Characters per call. A whole book at once is megabytes in one string. */
const BATCH = 200_000;

/** Chinese written in the other script — the one target with no translating in it. */
export function isScriptChange(language: string, target: string): boolean {
  return language.startsWith('zh') && target in TRANSFORM;
}

/** Whether the phone can do it, which is what decides key, price and waiting. */
export function canConvertScript(language: string, target: string): boolean {
  return !!native && isScriptChange(language, target);
}

/**
 * Every sentence still waiting, written by the phone. Returns how many, so a
 * caller can tell "done" from "not this kind of target" and fall back to the
 * model for the second — a converter that is missing or that ICU has no table
 * for must not leave a copy of the source standing in for a translation.
 */
export async function convertScript(
  bookId: string,
  target: string,
  language: string,
  chapterIdx?: number
): Promise<number> {
  if (!canConvertScript(language, target)) return 0;
  const units = await listUnits(bookId, target, chapterIdx);
  const waiting = units.filter((unit) => !unit.machine || unit.stale);

  let written = 0;
  for (const batch of batches(waiting)) {
    let lines: string[];
    try {
      lines = (await native!.convert(batch.map((unit) => unit.source).join(SPLIT), TRANSFORM[target]))
        .split(SPLIT);
    } catch {
      return written;
    }
    if (lines.length !== batch.length) return written;
    await saveMachine(
      bookId,
      target,
      batch.map((unit, at) => ({ start: unit.start, end: unit.end, text: lines[at] }))
    );
    written += batch.length;
  }
  return written;
}

function* batches(units: TranslationUnit[]): Generator<TranslationUnit[]> {
  let batch: TranslationUnit[] = [];
  let size = 0;
  for (const unit of units) {
    if (batch.length && size + unit.source.length > BATCH) {
      yield batch;
      batch = [];
      size = 0;
    }
    batch.push(unit);
    size += unit.source.length;
  }
  if (batch.length) yield batch;
}
