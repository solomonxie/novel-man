import { extensionOf } from '../../storage/paths';

export class FetchError extends Error {
  constructor(
    public code: 'sign-in' | 'not-a-document' | 'http' | 'unsupported',
    public detail?: string
  ) {
    super(code);
  }
}

/**
 * A Google Doc link is a web page, not a document — but Google will hand back
 * a real `.docx` from the same document id. Rewriting the URL means the
 * importer sees a format it already reads, with no Google-specific code
 * anywhere downstream and no OAuth to hold.
 */
export function rewrite(url: string): { url: string; name?: string } {
  const doc = /docs\.google\.com\/document\/d\/([A-Za-z0-9_-]+)/.exec(url);
  if (doc) {
    return { url: `https://docs.google.com/document/d/${doc[1]}/export?format=docx`, name: `${doc[1]}.docx` };
  }
  const drive = /drive\.google\.com\/file\/d\/([A-Za-z0-9_-]+)/.exec(url);
  if (drive) {
    return { url: `https://drive.google.com/uc?export=download&id=${drive[1]}`, name: drive[1] };
  }
  return { url };
}

/** A document request that comes back as a login page is the commonest failure. */
export function looksLikeSignIn(contentType: string, bytes: Uint8Array): boolean {
  if (!/text\/html/i.test(contentType)) return false;
  const head = String.fromCharCode(...bytes.slice(0, 2000)).toLowerCase();
  return /sign in|accounts\.google\.com|<form[^>]+login|session expired/.test(head);
}

const FROM_MIME: Record<string, string> = {
  'text/plain': 'txt',
  'text/markdown': 'md',
  'text/html': 'html',
  'application/pdf': 'pdf',
  'application/epub+zip': 'epub',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};

export function nameFor(url: string, contentType: string, disposition: string | null): string {
  const fromHeader = disposition && /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(disposition)?.[1];
  if (fromHeader) return decodeURIComponent(fromHeader.replace(/"$/, ''));

  const fromPath = decodeURIComponent(url.split(/[?#]/)[0].split('/').pop() ?? '');
  if (extensionOf(fromPath)) return fromPath;

  const extension = FROM_MIME[contentType.split(';')[0].trim().toLowerCase()];
  const base = fromPath || 'download';
  return extension ? `${base}.${extension}` : base;
}
