import * as DocumentPicker from 'expo-document-picker';
import { supportedMimeTypes } from '../registry';

/**
 * The system picker is also the Drive / iCloud / Dropbox door — every Files
 * provider shows up here, with no OAuth and nowhere to keep a token.
 */
export async function pickManuscript(): Promise<{ uri: string; name: string } | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: [...supportedMimeTypes, 'text/*', 'application/octet-stream'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  const asset = result.canceled ? null : result.assets[0];
  return asset ? { uri: asset.uri, name: asset.name } : null;
}
