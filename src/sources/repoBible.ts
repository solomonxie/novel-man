import { yieldToUI } from '../async/yield';
import { decodeText } from '../import/decode';
import { readBible } from '../scripture/published';
import { hueOf, saveBible } from '../scripture/save';
import type { UsfmBook } from '../scripture/usfm';
import { storeSourceBytes } from '../storage/files';
import { extensionOf } from '../storage/paths';
import {
  bookFiles,
  bookIn,
  contentsUrl,
  parseRepoUrl,
  rawUrl,
  READABLE,
  titleFrom,
  type RepoRef,
} from './repo';

export class RepoError extends Error {
  constructor(
    public code: 'url' | 'missing' | 'limited' | 'offline' | 'nothing' | 'shape' | 'canon',
    public detail?: string
  ) {
    super(code);
  }
}

/** What the reader chose: which files make the edition, and how much that is. */
export type RepoEdition = {
  ref: RepoRef;
  title: string;
  files: string[];
  bytes: number;
};

export type RepoStage = 'fetching' | 'saving';

type Entry = { name: string; path: string; type: string; size: number };

/**
 * A link to a file, to a folder, or to the repository itself, answered with
 * what would actually be fetched. The listing is one request and no bytes of
 * text, so the size is known before anything is downloaded — which is the
 * whole point of asking first.
 */
export async function resolveRepoBible(url: string): Promise<RepoEdition> {
  const ref = parseRepoUrl(url);
  if (!ref) throw new RepoError('url');
  const found = await listing(ref, ref.path);

  if (Array.isArray(found)) return folder(ref, found);

  // A file named after a book of the canon is one of a set, and the set is
  // what makes a bible — so the folder it sits in is the real answer.
  if (bookIn(found.path)) {
    const siblings = await listing(ref, parentOf(found.path));
    if (Array.isArray(siblings)) {
      const files = bookFiles(paths(siblings), extensionOf(found.path));
      if (files.length > 1) return edition(ref, files, siblings);
    }
  }

  const extension = extensionOf(found.path);
  if (!READABLE.includes(extension)) throw new RepoError('shape', extension || found.name);
  return { ref, title: titleFrom(ref, [found.path]), files: [found.path], bytes: found.size };
}

function folder(ref: RepoRef, entries: Entry[]): RepoEdition {
  const files = bookFiles(paths(entries));
  // A folder of whole bibles is a shelf, not an edition: which one is being
  // asked for is the reader's to say, and a file link is how they say it.
  if (!files.length) throw new RepoError('nothing');
  return edition(ref, files, entries);
}

function edition(ref: RepoRef, files: string[], entries: Entry[]): RepoEdition {
  const sizeOf = new Map(entries.map((entry) => [entry.path, entry.size] as const));
  return {
    ref,
    title: titleFrom(ref, files),
    files,
    bytes: files.reduce((total, path) => total + (sizeOf.get(path) ?? 0), 0),
  };
}

function paths(entries: Entry[]): string[] {
  return entries.filter((entry) => entry.type === 'file').map((entry) => entry.path);
}

function parentOf(path: string): string {
  const cut = path.lastIndexOf('/');
  return cut < 0 ? '' : path.slice(0, cut);
}

async function listing(ref: RepoRef, path: string): Promise<Entry[] | Entry> {
  let response: Response;
  try {
    response = await fetch(contentsUrl(ref, path), {
      headers: { accept: 'application/vnd.github+json' },
    });
  } catch (problem) {
    throw new RepoError('offline', String(problem));
  }
  if (response.status === 404) throw new RepoError('missing', path);
  // Sixty requests an hour, per address, to anyone who hasn't signed in.
  if (response.status === 403 || response.status === 429) throw new RepoError('limited');
  if (!response.ok) throw new RepoError('offline', `${response.status}`);
  return (await response.json()) as Entry[] | Entry;
}

/**
 * The files, in order, read into books and saved as one. A bible published as
 * data states its chapters and verses the same way USFM does, so this lands on
 * the same save step every other edition does.
 */
export async function downloadRepoBible(
  chosen: RepoEdition,
  onProgress?: (stage: RepoStage, fraction: number) => void
): Promise<{ bookId: string; chapters: number }> {
  const books: UsfmBook[] = [];
  const seen = new Set<string>();
  let title = chosen.title;
  let stated = false;
  // One file is a file worth keeping; sixty-six are a folder, and a folder is
  // not something the shelf can hold. The manuscript is in the database either
  // way — what is lost is only the original, for a bible that has no single one.
  let only: Uint8Array | null = null;

  for (let at = 0; at < chosen.files.length; at++) {
    const path = chosen.files[at];
    const bytes = await fetchFile(rawUrl(chosen.ref, path));
    if (chosen.files.length === 1) only = bytes;
    const reading = readBible(decodeText(bytes), path);
    // The first file answers for the rest: if it is not a bible, the other
    // sixty-five are not worth fetching to find that out again.
    if (!reading.ok) {
      if (at === 0) throw new RepoError(reading.why, path);
      continue;
    }
    if (reading.title && !stated) {
      title = reading.title;
      stated = true;
    }
    for (const book of reading.books) {
      if (seen.has(book.name)) continue;
      seen.add(book.name);
      books.push(book);
    }
    onProgress?.('fetching', (at + 1) / chosen.files.length);
    await yieldToUI();
  }
  if (!books.length) throw new RepoError('canon', chosen.files[0]);

  onProgress?.('saving', 0);
  const name = chosen.files[0].split('/').pop() || chosen.ref.repo;
  const stored = only ? await storeSourceBytes(only, name) : null;
  const saved = await saveBible({
    title,
    books,
    source: {
      name: `${chosen.ref.owner}/${chosen.ref.repo}`,
      hash: stored?.hash ?? `${chosen.ref.owner}/${chosen.ref.repo}/${chosen.ref.path}`,
      path: stored?.path ?? '',
      ext: stored ? extensionOf(name) : '',
    },
    hue: hueOf(`${chosen.ref.owner}/${chosen.ref.repo}`),
  });
  onProgress?.('saving', 1);
  return saved;
}

/**
 * Sixty-six files is a burst, and a burst is what a CDN pushes back on. A 429
 * or a 5xx is "not now" rather than "no", so it is waited out — the alternative
 * is losing a whole bible to one refused request in the middle of it.
 */
const ATTEMPTS = 4;

async function fetchFile(url: string): Promise<Uint8Array> {
  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, { headers: { accept: '*/*' } });
    } catch (problem) {
      if (attempt >= ATTEMPTS - 1) throw new RepoError('offline', String(problem));
      await pause(attempt);
      continue;
    }
    if (response.ok) return new Uint8Array(await response.arrayBuffer());
    if (response.status === 404) throw new RepoError('missing', url);
    if (attempt < ATTEMPTS - 1 && (response.status === 429 || response.status >= 500)) {
      await pause(attempt);
      continue;
    }
    if (response.status === 429) throw new RepoError('limited');
    throw new RepoError('offline', `${response.status}`);
  }
}

function pause(attempt: number): Promise<void> {
  const base = Math.min(8000, 500 * 2 ** attempt);
  const wait = Math.round(base / 2 + Math.random() * (base / 2));
  return new Promise((resolve) => setTimeout(resolve, wait));
}
