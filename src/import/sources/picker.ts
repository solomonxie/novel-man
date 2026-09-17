import * as DocumentPicker from 'expo-document-picker';
import { supportedMimeTypes } from '../registry';

export type PickedFile = { uri: string; name: string };

// iOS allows one document picker at a time, and a rejected present() leaves the
// native side believing one is still open. Callers share the in-flight promise
// so a second tap can never wedge it.
let inFlight: Promise<PickedFile | null> | null = null;

function pick(options: Parameters<typeof DocumentPicker.getDocumentAsync>[0]) {
  inFlight ??= DocumentPicker.getDocumentAsync(options)
    .then((result) => {
      const asset = result.canceled ? null : result.assets[0];
      return asset ? { uri: asset.uri, name: asset.name } : null;
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
  return pick({
    type: [...supportedMimeTypes, 'text/*', 'application/octet-stream'],
    copyToCacheDirectory: true,
    multiple: false,
  });
}

export function pickBackupBundle(): Promise<PickedFile | null> {
  return pick({ type: '*/*', copyToCacheDirectory: true });
}
