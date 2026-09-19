import { Linking } from 'react-native';
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

  const { path, query } = splitLink(url);
  const remote = queryValue(query, 'url');
  if (path === 'import' && remote) {
    void fetchManuscript(remote).then(enqueueImport).catch(() => undefined);
    return true;
  }
  return false;
}

/**
 * `novelman://import?url=…` pulled apart by hand. The platform URL parser is
 * built for http, and a custom scheme puts the word that matters in whichever
 * of host or path it feels like.
 */
function splitLink(url: string): { path: string; query: string } {
  const [rest, query = ''] = url.replace(/^[a-zA-Z][\w+.-]*:\/\//, '').split('?');
  return { path: rest.replace(/^\/+|\/+$/g, ''), query };
}

function queryValue(query: string, key: string): string | null {
  for (const pair of query.split('&')) {
    const at = pair.indexOf('=');
    if (at > 0 && decodeURIComponent(pair.slice(0, at)) === key) {
      return decodeURIComponent(pair.slice(at + 1));
    }
  }
  return null;
}

/** Both doors: the link that launched the app, and any that arrive after. */
export function listenForIncoming(): () => void {
  Linking.getInitialURL().then((url) => url && handleIncoming(url));
  const subscription = Linking.addEventListener('url', (event) => handleIncoming(event.url));
  return () => subscription.remove();
}
