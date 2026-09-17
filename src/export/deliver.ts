import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { ExportFile } from './types';

const EXPORTS = 'exports';

export function exportsDir(): Directory {
  const dir = new Directory(Paths.document, EXPORTS);
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/** iOS wants a UTI, not a MIME type, or the sheet offers the wrong apps. */
const UTIS: Record<string, string> = {
  'text/plain': 'public.plain-text',
  'text/markdown': 'net.daringfireball.markdown',
  'text/html': 'public.html',
  'text/csv': 'public.comma-separated-values-text',
  'application/pdf': 'com.adobe.pdf',
  'application/epub+zip': 'org.idpf.epub-container',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'org.openxmlformats.wordprocessingml.document',
};

export function writeExport(file: ExportFile): File {
  const target = new File(exportsDir(), file.fileName);
  if (target.exists) target.delete();
  target.create();
  target.write(file.body ?? '');
  return target;
}

export type Destination = 'share' | 'keep';

/**
 * Two destinations, because they answer different questions: "send this
 * somewhere" and "leave it where I can find it later".
 */
export async function deliver(file: ExportFile, destination: Destination): Promise<string> {
  const uri = file.uri ?? writeExport(file).uri;
  if (destination === 'keep') {
    if (!file.uri) return uri;
    const kept = new File(exportsDir(), file.fileName);
    if (kept.exists) kept.delete();
    new File(uri).copy(kept);
    return kept.uri;
  }
  if (!(await Sharing.isAvailableAsync())) return uri;
  await Sharing.shareAsync(uri, { mimeType: file.mimeType, UTI: UTIS[file.mimeType] });
  return uri;
}
