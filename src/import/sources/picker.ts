import { errorCodes, isErrorWithCode, pick as pickDocument, types } from '@react-native-documents/picker';
import { supportedUtis } from '../registry';

export type PickedFile = { uri: string; name: string };

// iOS allows one document picker at a time, and a rejected present() leaves the
// native side believing one is still open. Callers share the in-flight promise
// so a second tap can never wedge it.
let inFlight: Promise<PickedFile[]> | null = null;

function pickAll(type: string[], several = false): Promise<PickedFile[]> {
  inFlight ??= pickDocument({ type, mode: 'import', allowMultiSelection: several })
    .then((picked) => picked.map((file) => ({ uri: file.uri, name: file.name ?? '' })))
    // Backing out is an answer, not a failure.
    .catch((problem) => {
      if (isErrorWithCode(problem) && problem.code === errorCodes.OPERATION_CANCELED) return [];
      throw problem;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

const pick = async (type: string[]) => (await pickAll(type))[0] ?? null;

/**
 * The system picker is also the Drive / iCloud / Dropbox door — every Files
 * provider shows up here, with no OAuth and nowhere to keep a token.
 */
export function pickManuscript(): Promise<PickedFile | null> {
  return pick([...supportedUtis, 'public.text']);
}

/** Several books at once: each becomes its own job, run one after another. */
export function pickManuscripts(): Promise<PickedFile[]> {
  return pickAll([...supportedUtis, 'public.text'], true);
}

export function pickBackupBundle(): Promise<PickedFile | null> {
  return pick([types.allFiles]);
}

/**
 * The PDF a converted book came out of. Offered on its own rather than through
 * `pickManuscript`, because the app does not read PDFs — this one is never
 * imported, only kept beside the book so a page of it can be looked at.
 */
export function pickOriginalPdf(): Promise<PickedFile | null> {
  return pick(['com.adobe.pdf']);
}

/** A library export, which is a table rather than a book: Goodreads' CSV. */
export function pickSpreadsheet(): Promise<PickedFile | null> {
  return pick(['public.comma-separated-values-text', 'public.plain-text']);
}

/** Notes kept elsewhere, as a JSON file. */
export function pickNotesFile(): Promise<PickedFile | null> {
  return pick(['public.json', 'public.plain-text']);
}

/** Flashcards kept elsewhere: a CSV, or tab-separated text as Anki and Quizlet export. */
export function pickCardsFile(): Promise<PickedFile | null> {
  return pick([
    'public.comma-separated-values-text',
    'public.tab-separated-values-text',
    'public.plain-text',
  ]);
}
