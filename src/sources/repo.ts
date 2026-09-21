import { bookNamed, CHAPTERS } from '../scripture/canon';
import { extensionOf } from '../storage/paths';

/**
 * A bible kept in a code repository. Most editions anyone actually asks for
 * are not redistributable as USFM and so are not in any catalog this app can
 * index — but they are all on GitHub, as JSON or as XML, in repositories that
 * are nobody's source to publish. So the reader searches where those live,
 * paste the link to the file they found, and this reads it.
 *
 * Everything here is arithmetic on a url. What it points at is fetched in
 * `repoBible.ts`, and the file itself is read in `scripture/published.ts`.
 */
export type RepoRef = { owner: string; repo: string; ref: string; path: string };

/** The formats `scripture/published.ts` can read. */
export const READABLE = ['json', 'xml'];

/**
 * What a keyword opens in the browser: repositories, most-starred first —
 * which for "niv" is the handful of people who have already done the work.
 */
export function searchUrl(query: string): string {
  const terms = `bible ${query}`.trim().replace(/\s+/g, ' ');
  return `https://github.com/search?q=${encodeURIComponent(terms)}&type=repositories&s=stars&o=desc`;
}

const BLOB = /^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/]+)\/(?:blob|raw|tree)\/([^/]+)\/?(.*)$/i;
const RAW = /^https?:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/?(.*)$/i;
const ROOT = /^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/]+)\/?$/i;

/** The page someone was reading, the raw file, or the repository itself. */
export function parseRepoUrl(input: string): RepoRef | null {
  const url = input.trim().split(/[?#]/)[0];
  const found = BLOB.exec(url) ?? RAW.exec(url);
  if (found) {
    const { ref, path } = splitRef(found[3], decodeURIComponent(found[4]));
    return { owner: found[1], repo: trimRepo(found[2]), ref, path: path.replace(/\/+$/, '') };
  }
  const root = ROOT.exec(url);
  if (root) return { owner: root[1], repo: trimRepo(root[2]), ref: 'HEAD', path: '' };
  return null;
}

/** `…/refs/heads/main/Genesis.json` — the branch is three segments, not one. */
function splitRef(ref: string, path: string): { ref: string; path: string } {
  if (ref !== 'refs') return { ref, path };
  const parts = path.split('/');
  if (parts.length < 3) return { ref, path };
  return { ref: `refs/${parts[0]}/${parts[1]}`, path: parts.slice(2).join('/') };
}

function trimRepo(name: string): string {
  return name.replace(/\.git$/i, '');
}

export function rawUrl(ref: RepoRef, path: string): string {
  const escaped = path.split('/').map(encodeURIComponent).join('/');
  return `https://raw.githubusercontent.com/${ref.owner}/${ref.repo}/${ref.ref}/${escaped}`;
}

/** What is in a folder, and how big — the one question asked before fetching. */
export function contentsUrl(ref: RepoRef, path: string): string {
  const escaped = path.split('/').filter(Boolean).map(encodeURIComponent).join('/');
  return `https://api.github.com/repos/${ref.owner}/${ref.repo}/contents/${escaped}?ref=${ref.ref}`;
}

export function stemOf(path: string): string {
  return (path.split('/').pop() ?? '').replace(/\.[a-z0-9]+$/i, '');
}

/** A file named after a book of the canon is one of a set, not a whole bible. */
export function bookIn(path: string): string | null {
  return READABLE.includes(extensionOf(path)) ? bookNamed(stemOf(path)) : null;
}

const ORDER = new Map(Object.keys(CHAPTERS).map((book, at) => [book, at] as const));

/**
 * The files of a listing that together make a bible, in the canon's order —
 * `1 Chronicles.json` and its sixty-five siblings, read as one book rather
 * than as sixty-six. One file per book, so where a folder carries both a JSON
 * and an XML of the same book the one the reader pasted decides.
 */
export function bookFiles(paths: string[], prefer?: string): string[] {
  const best = new Map<string, string>();
  for (const path of paths) {
    const book = bookIn(path);
    if (!book) continue;
    const held = best.get(book);
    if (!held || (prefer && extensionOf(path) === prefer && extensionOf(held) !== prefer)) {
      best.set(book, path);
    }
  }
  return [...best]
    .sort((a, b) => (ORDER.get(a[0]) ?? ORDER.size) - (ORDER.get(b[0]) ?? ORDER.size))
    .map(([, path]) => path);
}

/** A name for the shelf, for the editions whose files never say what they are. */
export function titleFrom(ref: RepoRef, files: string[]): string {
  const base = files.length === 1 ? stemOf(files[0]) : ref.repo;
  return base.replace(/[-_.]+/g, ' ').replace(/\s+/g, ' ').trim() || ref.repo;
}
