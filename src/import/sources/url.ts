import { Directory, File, Paths } from 'expo-file-system';
import { extensionOf } from '../../storage/paths';
import { supportedExtensions } from '../registry';
import { FetchError, looksLikeSignIn, nameFor, rewrite } from './links';

export { FetchError, looksLikeSignIn, nameFor, rewrite } from './links';

function downloadsDir(): Directory {
  const dir = new Directory(Paths.cache, 'downloads');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/** Fetches to a cache file and hands the pipeline the same shape the picker does. */
export async function fetchManuscript(input: string): Promise<{ uri: string; name: string }> {
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

  const name = target.name ?? nameFor(target.url, contentType, response.headers.get('content-disposition'));
  const extension = extensionOf(name);
  if (!supportedExtensions.includes(extension)) throw new FetchError('unsupported', extension || name);

  const file = new File(downloadsDir(), name);
  if (file.exists) file.delete();
  file.create();
  file.write(bytes);
  return { uri: file.uri, name };
}
