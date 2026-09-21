import { errorCodes, isErrorWithCode, pick as pickDocument, types } from '@react-native-documents/picker';
import { supportedMimeTypes } from '../registry';

export type PickedFile = { uri: string; name: string };

// iOS allows one document picker at a time, and a rejected present() leaves the
// native side believing one is still open. Callers share the in-flight promise
// so a second tap can never wedge it.
let inFlight: Promise<PickedFile | null> | null = null;

function pick(type: string[]) {
  inFlight ??= pickDocument({ type, mode: 'import', allowMultiSelection: false })
    .then(([picked]) => (picked ? { uri: picked.uri, name: picked.name ?? '' } : null))
    // Backing out is an answer, not a failure.
    .catch((problem) => {
      if (isErrorWithCode(problem) && problem.code === errorCodes.OPERATION_CANCELED) return null;
      throw problem;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/**
 * The system picker is also the Drive / iCloud / Dropbox door — every Files
 * provider shows up here, with no OAuth and nowhere to keep a token.
 */
export function pickManuscript(): Promise<PickedFile | null> {
  return pick([...supportedMimeTypes, 'text/*', 'application/octet-stream']);
}

export function pickBackupBundle(): Promise<PickedFile | null> {
  return pick([types.allFiles]);
}

/** A library export, which is a table rather than a book: Goodreads' CSV. */
export function pickSpreadsheet(): Promise<PickedFile | null> {
  return pick(['text/csv', 'text/comma-separated-values', 'public.comma-separated-values-text',
    'text/plain', 'application/octet-stream']);
}
