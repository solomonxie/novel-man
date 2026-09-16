import { yieldToUI } from '../async/yield';
import { adoptSourceFile, extensionOf } from '../storage/files';
import { saveImportedBook } from '../db/repo';
import { detectChapters } from '../structure/detect';
import { countUnits } from '../text/counts';
import { detectLanguage } from '../text/language';
import { normalize } from './normalize';
import { importerFor } from './registry';

export type ImportStage = 'reading' | 'parsing' | 'detecting' | 'saving';
export type ImportProgress = { stage: ImportStage; fraction: number; detail?: string };

export class ImportError extends Error {
  constructor(public code: 'unsupported' | 'no-text' | 'unreadable', public detail?: string) {
    super(code);
  }
}

export type ImportResult = { bookId: string; chapters: number; confident: boolean };

/** Rough share of total time per stage, measured on a 3.4MB / 509-chapter docx. */
const WEIGHTS: Record<ImportStage, [number, number]> = {
  reading: [0, 0.12],
  parsing: [0.12, 0.92],
  detecting: [0.92, 0.96],
  saving: [0.96, 1],
};

export async function importFile(
  input: { uri: string; name: string },
  onProgress?: (progress: ImportProgress) => void
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
  const counts = countUnits(doc.text, language);
  await yieldToUI();

  report('saving');
  const bookId = await saveImportedBook({
    book: {
      title: parsed.title?.trim() || input.name.replace(/\.[^.]+$/, ''),
      author: parsed.author?.trim() || null,
      language,
      source_name: input.name,
      source_hash: stored.hash,
      source_path: stored.path,
      source_ext: extension,
      word_count: counts.words,
      char_count: doc.text.length,
      cover_hue: hueFromTitle(input.name),
    },
    text: doc.text,
    chapters: detection.chapters,
  });
  report('saving', 1);

  return { bookId, chapters: detection.chapters.length, confident: detection.method !== 'none' };
}

function hueFromTitle(title: string): number {
  let hash = 0;
  for (let i = 0; i < title.length; i++) hash = (hash * 31 + title.charCodeAt(i)) % 360;
  return hash;
}
