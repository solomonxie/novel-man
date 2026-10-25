import type { Book } from '../db/repo';
import { listVersions } from '../db/versions';
import { importerFor } from '../import/registry';
import { enqueueImport } from '../import/queue';
import { openStored } from '../storage/files';

/**
 * A book read again from the file it came from, by the importer as it is now.
 * Notes come back by their words, as after any re-import. Not offered once a
 * second copy has been merged in: one file would put back only one wording.
 */
export async function canRebuild(book: Book): Promise<boolean> {
  if (book.text_source || !book.source_path || !importerFor(book.source_ext ?? '')) return false;
  if (!openStored(book.source_path, book.source_hash, book.source_ext).exists) return false;
  return (await listVersions(book.id)).length === 0;
}

export function rebuild(book: Book): string {
  const file = openStored(book.source_path, book.source_hash, book.source_ext);
  const named = book.source_name?.toLowerCase().endsWith(`.${book.source_ext}`);
  const name = named ? book.source_name : `${book.title}.${book.source_ext}`;
  return `/job/${enqueueImport({ uri: file.uri, name, into: book.id, rebuild: true })}`;
}
