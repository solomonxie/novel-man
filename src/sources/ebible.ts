import { File, Paths } from 'expo-file-system';
import { unzipSync, strFromU8 } from 'fflate';

import { saveImportedBook } from '../db/repo';
import { applyToImport } from '../backup/pending';
import { hintsOf } from '../structure/document';
import { normalize } from '../import/normalize';
import { countUnits } from '../text/counts';
import { detectLanguage } from '../text/language';
import { storeSourceBytes } from '../storage/files';
import { yieldToUI } from '../async/yield';
import { inCanonOrder, layoutBible, parseUsfm, type UsfmBook } from '../scripture/usfm';
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
 * The editions offered, in the order they are offered. The catalog carries
 * 1,550; a list that long is a search problem nobody wanted, and it is mostly
 * languages this app has no reader for — right-to-left among them. So the
 * shelf is a chosen list.
 *
 * The ones asked for by name and missing here are missing for one reason: NIV,
 * NKJV, NASB and 吕振中 are licensed so that no one may redistribute them, and
 * the catalog's `Redistributable` flag says so. They cannot be downloaded from
 * here at any price, and offering a row that always fails would be worse than
 * the absence.
 */
const EDITIONS: { id: string; abbr: string }[] = [
  { id: 'eng-kjv', abbr: 'KJV' },
  { id: 'eng-asv', abbr: 'ASV' },
  { id: 'engwebp', abbr: 'WEB' },
  { id: 'engbsb', abbr: 'BSB' },
  { id: 'engnet', abbr: 'NET' },
  { id: 'engylt', abbr: 'YLT' },
  { id: 'cmn-cu89s', abbr: '和合本 简' },
  { id: 'cmn-cu89t', abbr: '和合本 繁' },
  { id: 'cmncbs', abbr: '当代译本' },
  { id: 'cmncbt', abbr: '當代譯本' },
  { id: 'cmnswcb', abbr: '世界中文' },
];

const offered = new Map(EDITIONS.map((edition, order) => [edition.id, { ...edition, order }]));

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
      extra: `${translation.abbr} ${translation.languageCode}`,
    }))
  );
  return catalog;
}

export function translationsFrom(csv: string): Translation[] {
  const rows = parseCsv(csv);
  const found: { order: number; translation: Translation }[] = [];
  for (const row of rows) {
    const edition = offered.get(row.translationId ?? '');
    if (!edition) continue;
    if ((row.Redistributable ?? '').toLowerCase() !== 'true') continue;
    const books = number(row.OTbooks) + number(row.NTbooks) + number(row.DCbooks);
    if (!books) continue;
    found.push({
      order: edition.order,
      translation: {
        id: edition.id,
        title: row.title?.trim() || edition.abbr,
        abbr: edition.abbr,
        language: row.languageNameInEnglish?.trim() || row.languageName?.trim() || '',
        languageCode: row.languageCode ?? '',
        copyright: row.Copyright?.trim() || '',
        books,
        chapters: number(row.OTchapters) + number(row.NTchapters) + number(row.DCchapters),
        verses: number(row.OTverses) + number(row.NTverses) + number(row.DCverses),
        extraBooks: number(row.DCbooks),
      },
    });
  }
  return found.sort((a, b) => a.order - b.order).map((entry) => entry.translation);
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

  const structure = layoutBible(books);
  const doc = normalize(structure.blocks);
  const offsetOf = new Map(doc.blocks.map((block) => [block.source, block] as const));
  await yieldToUI();

  onProgress?.('saving', 0);
  const chapters = structure.chapters.map((chapter, index) => {
    const start = offsetOf.get(chapter.block)?.start ?? 0;
    const next = structure.chapters[index + 1];
    const end = next ? offsetOf.get(next.block)?.start ?? doc.text.length : doc.text.length;
    return {
      // The reference is the title: "John 3" is what the reader is looking at.
      title: `${chapter.partName} ${chapter.number}`,
      start,
      end,
      confident: true,
      part_idx: chapter.part,
      part_title: chapter.partName,
    };
  });

  const chapterAt = new Map(
    structure.chapters.map((chapter, index) => [`${chapter.part}:${chapter.number}`, index] as const)
  );
  const verses = structure.verses.flatMap((verse) => {
    const placed = offsetOf.get(verse.block);
    const chapterIndex = chapterAt.get(`${verse.part}:${verse.chapter}`);
    if (!placed || chapterIndex === undefined) return [];
    return [{ chapterIndex, number: verse.number, start: placed.start, end: placed.end }];
  });

  const { language } = detectLanguage(doc.text);
  const name = `${translation.id}_usfm.zip`;
  const stored = await storeSourceBytes(zip, name);
  const counts = countUnits(doc.text, language);

  const bookId = await saveImportedBook({
    book: {
      title: translation.title,
      author: null,
      language,
      kind: 'scripture',
      source_name: name,
      source_hash: stored.hash,
      source_path: stored.path,
      source_ext: 'zip',
      word_count: counts.words,
      char_count: doc.text.length,
      cover_hue: hueOf(translation.id),
    },
    text: doc.text,
    hints: hintsOf(doc),
    chapters,
    scenes: [],
    verses,
    partNames: structure.parts.map((part) => ({ part_idx: part.idx, names: part.names })),
  });
  await applyToImport(bookId, stored.hash);
  onProgress?.('saving', 1);
  return { bookId, chapters: chapters.length };
}

function hueOf(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) % 360;
  return hash;
}
