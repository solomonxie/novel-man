import { Directory, File, Paths } from 'expo-file-system';

/**
 * Where a book waits between arriving and being imported. It is the cache, not
 * the library: the importer keeps its own copy of whatever it accepts, so
 * anything left here is free for the system to reclaim.
 */
function downloadsDir(): Directory {
  const dir = new Directory(Paths.cache, 'downloads');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/** Hands back the same shape the file picker does, whatever produced the bytes. */
export function saveDownload(name: string, data: Uint8Array | string): { uri: string; name: string } {
  const file = new File(downloadsDir(), name);
  if (file.exists) file.delete();
  file.create();
  file.write(data);
  return { uri: file.uri, name };
}
