import { File, Paths } from '../storage/fs';
import { unzipSync, strFromU8 } from 'fflate';

import { hueOf, saveBible } from '../scripture/save';
import { storeSourceBytes } from '../storage/files';
import { yieldToUI } from '../async/yield';
import { inCanonOrder, parseUsfm, type UsfmBook } from '../scripture/usfm';
import { parseCsv } from './csv';
import { replaceIndex } from './catalog';

/**
 * eBible.org publishes a catalog that is already an index: every translation
 * with the flag saying whether it may be redistributed, its copyright line,
 * and its own book, chapter and verse counts. That is the licence gate and the
 * "what you'll get" line, so neither is ours to guess.
 */
const CATALOG_URL = 'https://ebible.org/Scriptures/translations.csv';
const editionUrl = (id: string) => `https://ebible.org/Scriptures/${id}_usfm.zip`;
const CACHE = 'ebible-catalog.json';

export type Translation = {
  id: string;
  title: string;
  /** What people call it — the name they'd type, not the catalog's id. */
  abbr: string;
  language: string;
  languageCode: string;
  copyright: string;
  books: number;
  chapters: number;
  verses: number;
  /** Deuterocanonical books this edition carries, 0 for most. */
  extraBooks: number;
};

export type Catalog = { fetchedAt: number; translations: Translation[] };

/**
 * Every edition the source says may be redistributed. A chosen shortlist came
 * first, when the only way through the list was to scroll it — but the list is
 * now kept on the device and searched, loosely, so 1,400 editions is a search
 * problem rather than a wall, and choosing for somebody which bible they are
 * allowed to want was never ours to do.
 *
 * NIV, NKJV, NASB and 吕振中 are still not here, and that is not a choice: the
 * catalog's `Redistributable` column says no source may serve them.
 */

/**
 * The reader has no right-to-left mode, and Hebrew and Arabic editions are in
 * this catalog. Listing them would be offering a book this app lays out
 * backwards, so they are filtered here rather than discovered by a reader.
 */
const RTL = new Set([
  'heb', 'hbo', 'arb', 'arz', 'apc', 'acm', 'aeb', 'ary', 'ars', 'arq', 'acx',
  'pes', 'prs', 'urd', 'ckb', 'div', 'syr', 'yid', 'snd', 'uig', 'pbu',
]);

/** Books beyond the 66 — the canon question, and the only download option. */
const DEUTEROCANON = new Set([
  'TOB', 'JDT', 'ESG', 'WIS', 'SIR', 'BAR', 'LJE', 'S3Y', 'SUS', 'BEL', '1MA',
  '2MA', '3MA', '4MA', 'MAN', '1ES', '2ES', 'PS2', 'ODA', 'PSS', 'EZA', '5EZ',
  '6EZ', 'DAG', 'LAO',
]);

export function isExtraBook(code: string): boolean {
  return DEUTEROCANON.has(code.toUpperCase());
}

function cacheFile(): File {
  return new File(Paths.document, CACHE);
}

export function readCatalog(): Catalog | null {
  const file = cacheFile();
  if (!file.exists) return null;
  try {
    return JSON.parse(file.textSync()) as Catalog;
  } catch {
    return null;
  }
}

/** `apt update`, for one source: the list, dated, kept for when there's no signal. */
export async function refreshCatalog(): Promise<Catalog> {
  const response = await fetch(CATALOG_URL, { headers: { accept: 'text/csv' } });
  if (!response.ok) throw new Error(`${response.status}`);
  const catalog: Catalog = {
    fetchedAt: Date.now(),
    translations: translationsFrom(await response.text()),
  };
  const file = cacheFile();
  if (file.exists) file.delete();
  file.create();
  file.write(JSON.stringify(catalog));
  // The same rows go into the shared index, so one search covers every source
  // rather than each one being searched in its own corner of the app.
  await replaceIndex(
    'ebible',
    catalog.translations.map((translation) => ({
      extId: translation.id,
      title: translation.title,
      author: translation.abbr,
      language: translation.language,
      extra: `${translation.abbr} ${translation.languageCode} ${translation.language}`,
    }))
  );
  return catalog;
}

export function translationsFrom(csv: string): Translation[] {
  const rows = parseCsv(csv);
  const found: Translation[] = [];
  for (const row of rows) {
    const id = row.translationId?.trim();
    if (!id) continue;
    if ((row.Redistributable ?? '').toLowerCase() !== 'true') continue;
    if (RTL.has((row.languageCode ?? '').toLowerCase())) continue;
    const books = number(row.OTbooks) + number(row.NTbooks) + number(row.DCbooks);
    if (!books) continue;
    const title = row.title?.trim() || id;
    found.push({
      id,
      title,
      // What people call it, when the catalog says: its own short title, and
      // its id when it does not.
      abbr: row.shortTitle?.trim() || id,
      language: row.languageNameInEnglish?.trim() || row.languageName?.trim() || '',
      languageCode: row.languageCode ?? '',
      copyright: row.Copyright?.trim() || '',
      books,
      chapters: number(row.OTchapters) + number(row.NTchapters) + number(row.DCchapters),
      verses: number(row.OTverses) + number(row.NTverses) + number(row.DCverses),
      extraBooks: number(row.DCbooks),
    });
  }
  return found.sort((a, b) => a.title.localeCompare(b.title));
}

function number(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export type DownloadStage = 'fetching' | 'reading' | 'saving';

/**
 * The edition arrives as USFM, which states its books, chapters and verses —
 * so this never detects anything. What it does is the ordinary import with the
 * detection step removed: fetch, read, normalize to one text with offsets, save.
 */
export async function downloadTranslation(
  translation: Translation,
  options: { apocrypha: boolean },
  onProgress?: (stage: DownloadStage, fraction: number) => void
): Promise<{ bookId: string; chapters: number }> {
  onProgress?.('fetching', 0);
  const response = await fetch(editionUrl(translation.id), { headers: { accept: '*/*' } });
  if (!response.ok) throw new Error(`${translation.id}: ${response.status}`);
  const zip = new Uint8Array(await response.arrayBuffer());
  onProgress?.('fetching', 1);
  await yieldToUI();

  onProgress?.('reading', 0);
  const files = unzipSync(zip, { filter: (file) => file.name.toLowerCase().endsWith('.usfm') });
  const names = inCanonOrder(Object.keys(files));
  const books: UsfmBook[] = [];
  for (let at = 0; at < names.length; at++) {
    const book = parseUsfm(strFromU8(files[names[at]]));
    if (book && (options.apocrypha || !isExtraBook(book.code))) books.push(book);
    onProgress?.('reading', (at + 1) / names.length);
    await yieldToUI();
  }
  if (!books.length) throw new Error('no books in this edition');

  onProgress?.('saving', 0);
  const name = `${translation.id}_usfm.zip`;
  const stored = await storeSourceBytes(zip, name);
  const saved = await saveBible({
    title: translation.title,
    books,
    source: { name, hash: stored.hash, path: stored.path, ext: 'zip' },
    hue: hueOf(translation.id),
  });
  onProgress?.('saving', 1);
  return saved;
}
