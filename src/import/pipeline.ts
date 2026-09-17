import { yieldToUI } from '../async/yield';
import { adoptSourceFile, extensionOf } from '../storage/files';
import { saveImportedBook } from '../db/repo';
import { applyToImport } from '../backup/pending';
import { detectChapters } from '../structure/detect';
import { hintsOf } from '../structure/document';
import { countUnits } from '../text/counts';
import { detectLanguage } from '../text/language';
import { DEFAULT_KIND } from '../books/kinds';
import { normalize } from './normalize';
import { importerFor } from './registry';

export type ImportStage = 'reading' | 'parsing' | 'detecting' | 'saving';
export type ImportProgress = { stage: ImportStage; fraction: number; detail?: string };

export class ImportError extends Error {
  constructor(
    public code: 'unsupported' | 'no-text' | 'unreadable' | 'rejected',
    public detail?: string
  ) {
    super(code);
  }
}

/** What the reader is shown before an uncertain extraction becomes a book. */
export type ImportPreview = {
  sample: string;
  characters: number;
  chapters: number;
  language: string;
  format: string;
};

export type ImportResult = { bookId: string; chapters: number; confident: boolean };

/** Rough share of total time per stage, measured on a 3.4MB / 509-chapter docx. */
const WEIGHTS: Record<ImportStage, [number, number]> = {
  reading: [0, 0.12],
  parsing: [0.12, 0.92],
  detecting: [0.92, 0.96],
  saving: [0.96, 1],
};

export async function importFile(
  input: { uri: string; name: string; kind?: string },
  onProgress?: (progress: ImportProgress) => void,
  confirm?: (preview: ImportPreview) => Promise<boolean>
): Promise<ImportResult> {
  const extension = extensionOf(input.name);
  const importer = importerFor(extension);
  if (!importer) throw new ImportError('unsupported', extension || input.name);

  const report = (stage: ImportStage, within = 0, detail?: string) => {
    const [from, to] = WEIGHTS[stage];
    onProgress?.({ stage, fraction: from + (to - from) * within, detail });
  };

  report('reading');
  const stored = await adoptSourceFile(input.uri, input.name);
  await yieldToUI();

  report('parsing', 0, importer.label);
  let parsed;
  try {
    parsed = await importer.parse(stored.bytes, input.name, {
      onProgress: async (done, total) => {
        report('parsing', total ? done / total : 0, importer.label);
        // The scan holds the JS thread until it lets go here.
        await yieldToUI();
      },
    });
  } catch (error) {
    throw new ImportError('unreadable', String(error));
  }

  const doc = normalize(parsed.blocks);
  if (!doc.text.trim()) throw new ImportError('no-text');
  await yieldToUI();

  report('detecting');
  const { language } = detectLanguage(doc.text);
  const detection = detectChapters(doc, language);
  // Import no longer guesses at scenes. A chapter arrives sceneless and stays
  // that way until a reader marks one or an analysis reads for them.
  const scenes: { chapterIndex: number; start: number; end: number }[] = [];
  const counts = countUnits(doc.text, language);
  await yieldToUI();

  if (importer.needsPreview && confirm) {
    const accepted = await confirm({
      sample: doc.text.slice(0, 1200),
      characters: doc.text.length,
      chapters: detection.chapters.length,
      language,
      format: importer.label,
    });
    // The stored source file stays either way: rejecting is a judgement about
    // this extraction, not a reason to make the user find the file again.
    if (!accepted) throw new ImportError('rejected', input.name);
  }

  report('saving');
  const bookId = await saveImportedBook({
    book: {
      title: parsed.title?.trim() || input.name.replace(/\.[^.]+$/, ''),
      author: parsed.author?.trim() || null,
      language,
      kind: input.kind ?? DEFAULT_KIND,
      source_name: input.name,
      source_hash: stored.hash,
      source_path: stored.path,
      source_ext: extension,
      word_count: counts.words,
      char_count: doc.text.length,
      cover_hue: hueFromTitle(input.name),
    },
    text: doc.text,
    hints: hintsOf(doc),
    chapters: detection.chapters,
    scenes,
  });
  // A backup without manuscripts left this book's own work waiting for the
  // file; the file has just arrived, so it goes back on now.
  await applyToImport(bookId, stored.hash);
  report('saving', 1);

  return { bookId, chapters: detection.chapters.length, confident: detection.method !== 'none' };
}

function hueFromTitle(title: string): number {
  let hash = 0;
  for (let i = 0; i < title.length; i++) hash = (hash * 31 + title.charCodeAt(i)) % 360;
  return hash;
}
