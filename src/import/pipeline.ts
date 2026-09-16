import { adoptSourceFile, extensionOf } from '../storage/files';
import { saveImportedBook } from '../db/repo';
import { detectChapters } from '../structure/detect';
import { countUnits } from '../text/counts';
import { detectLanguage } from '../text/language';
import { normalize } from './normalize';
import { importerFor } from './registry';

export type ImportStep = 'reading' | 'parsing' | 'detecting' | 'saving';

export class ImportError extends Error {
  constructor(public code: 'unsupported' | 'no-text' | 'unreadable', public detail?: string) {
    super(code);
  }
}

export type ImportResult = { bookId: string; chapters: number; confident: boolean };

export async function importFile(
  input: { uri: string; name: string },
  onStep: (step: ImportStep, detail?: string) => void
): Promise<ImportResult> {
  const extension = extensionOf(input.name);
  const importer = importerFor(extension);
  if (!importer) throw new ImportError('unsupported', extension || input.name);

  onStep('reading');
  const stored = await adoptSourceFile(input.uri, input.name);

  onStep('parsing', importer.label);
  let parsed;
  try {
    parsed = await importer.parse(stored.bytes, input.name);
  } catch (error) {
    throw new ImportError('unreadable', String(error));
  }

  const doc = normalize(parsed.blocks);
  if (!doc.text.trim()) throw new ImportError('no-text');

  onStep('detecting');
  const { language } = detectLanguage(doc.text);
  const detection = detectChapters(doc, language);
  const counts = countUnits(doc.text, language);

  onStep('saving');
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

  return {
    bookId,
    chapters: detection.chapters.length,
    confident: detection.method !== 'none',
  };
}

function hueFromTitle(title: string): number {
  let hash = 0;
  for (let i = 0; i < title.length; i++) hash = (hash * 31 + title.charCodeAt(i)) % 360;
  return hash;
}
