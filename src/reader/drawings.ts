import { useEffect, useState } from 'react';

import { Directory, File } from '../storage/fs';
import { ownPath } from '../storage/own';
import { fromBase64 } from '../import/base64';
import { draw, type Drawing } from '../import/extractor';

/**
 * Formulas and diagrams, drawn the first time they are read and kept. The
 * text holds what the author wrote — TeX, Mermaid — so search, copying and
 * translation see the source, and the picture is only ever a cache of it:
 * deleting the folder costs a redraw, never a book.
 */
const FOLDER = 'drawings';

function folder(): Directory {
  const dir = new Directory(ownPath(FOLDER));
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/** cyrb53: enough to tell two formulas apart, and cheap on a page of them. */
function hash(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let at = 0; at < text.length; at++) {
    const code = text.charCodeAt(at);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

const nameOf = (kind: Drawing, source: string, dark: boolean) =>
  `${kind}-${kind === 'diagram' && dark ? 'dark-' : ''}${hash(source)}.png`;

const pending = new Map<string, Promise<string | null>>();
/** Tried and failed this session — offline, or TeX that does not parse. Tried again next launch. */
const failed = new Set<string>();

/** A library that never arrives must not hold up every drawing behind it. */
const timeout = () => new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 20000));

/** One at a time: the drawing page is a single web view, and a chapter can ask for hundreds. */
let queue: Promise<unknown> = Promise.resolve();

function drawn(kind: Drawing, source: string, dark: boolean): Promise<string | null> {
  const name = nameOf(kind, source, dark);
  const file = new File(folder(), name);
  if (file.exists) return Promise.resolve(file.uri);
  if (failed.has(name)) return Promise.resolve(null);
  const already = pending.get(name);
  if (already) return already;
  const job = queue
    .then(() => Promise.race([draw(kind, source, dark), timeout()]))
    .then((encoded) => {
      const bytes = fromBase64(encoded);
      if (!bytes.length) throw new Error('empty');
      file.create();
      file.write(bytes);
      return file.uri;
    })
    .catch(() => {
      failed.add(name);
      return null;
    })
    .finally(() => pending.delete(name));
  queue = job;
  pending.set(name, job);
  return job;
}

/** Already on the device, without waiting: what a page draws on its first frame. */
function kept(kind: Drawing, source: string, dark: boolean): string | null {
  const file = new File(folder(), nameOf(kind, source, dark));
  return file.exists ? file.uri : null;
}

/** The picture of `source`, once there is one; null while drawing and if it cannot be drawn. */
export function useDrawing(kind: Drawing, source: string, dark = false): { uri: string | null; done: boolean } {
  const [state, setState] = useState(() => {
    const uri = kept(kind, source, dark);
    return { uri, done: uri !== null };
  });
  useEffect(() => {
    let live = true;
    const uri = kept(kind, source, dark);
    if (uri) {
      setState({ uri, done: true });
      return;
    }
    setState({ uri: null, done: false });
    void drawn(kind, source, dark).then((made) => live && setState({ uri: made, done: true }));
    return () => {
      live = false;
    };
  }, [kind, source, dark]);
  return state;
}
