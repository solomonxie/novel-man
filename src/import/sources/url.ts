import { extensionOf } from '../../storage/paths';
import { supportedExtensions } from '../registry';
import { saveDownload } from './downloads';
import { FetchError, looksLikeSignIn, nameFor, rewrite } from './links';

export { FetchError, looksLikeSignIn, nameFor, rewrite } from './links';

/**
 * Fetches to a cache file and hands the pipeline the same shape the picker
 * does. `named` is for a source that knows what the book is called better than
 * its url does — Gutenberg serves an epub from `/ebooks/1342.epub.noimages`,
 * which is a title nobody wrote and an extension nothing downstream reads.
 */
export async function fetchManuscript(input: string, named?: string): Promise<{ uri: string; name: string }> {
  const target = rewrite(input.trim());
  let response: Response;
  try {
    response = await fetch(target.url, { headers: { accept: '*/*' } });
  } catch (error) {
    throw new FetchError('http', String(error));
  }
  if (!response.ok) throw new FetchError('http', `${response.status}`);

  const contentType = response.headers.get('content-type') ?? '';
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (looksLikeSignIn(contentType, bytes)) throw new FetchError('sign-in', target.url);

  const name =
    named ?? target.name ?? nameFor(target.url, contentType, response.headers.get('content-disposition'));
  const extension = extensionOf(name);
  if (!supportedExtensions.includes(extension)) throw new FetchError('unsupported', extension || name);

  return saveDownload(name, bytes);
}
