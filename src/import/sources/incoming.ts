import * as Linking from 'expo-linking';
import { extensionOf } from '../../storage/files';
import { supportedExtensions } from '../registry';
import { enqueueImport } from '../queue';
import { fetchManuscript } from './url';

/**
 * "Open in Novel Man" from any other app arrives as a URL, not as an event of
 * its own: iOS hands over a `file://` path and Android a `content://` one.
 * Both are just something to import, so both take the same door — and a
 * `novelman://import?url=` link takes it too.
 */
export function handleIncoming(url: string): boolean {
  if (/^(file|content):/i.test(url)) {
    const name = decodeURIComponent(url.split(/[?#]/)[0].split('/').pop() ?? '');
    if (!supportedExtensions.includes(extensionOf(name))) return false;
    enqueueImport({ uri: url, name });
    return true;
  }

  const parsed = Linking.parse(url);
  const remote = parsed.queryParams?.url;
  if (parsed.path?.replace(/^\//, '') === 'import' && typeof remote === 'string') {
    void fetchManuscript(remote).then(enqueueImport).catch(() => undefined);
    return true;
  }
  return false;
}

/** Both doors: the link that launched the app, and any that arrive after. */
export function listenForIncoming(): () => void {
  Linking.getInitialURL().then((url) => url && handleIncoming(url));
  const subscription = Linking.addEventListener('url', (event) => handleIncoming(event.url));
  return () => subscription.remove();
}
