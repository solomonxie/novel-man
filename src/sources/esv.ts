/**
 * The ESV, looked up rather than owned. Crossway licenses it and does not
 * permit anyone to redistribute the text, so it cannot be a book on the shelf
 * the way the public-domain editions are — there is no file to fetch and
 * nothing this app is allowed to keep.
 *
 * What they do offer is an API, free for personal use with a key of your own.
 * So this is a different kind of thing from every other source here: you ask
 * it for a passage, it answers, and the answer is not stored. The attribution
 * travels with the words, because their terms require it and because a quote
 * without its edition is a quote nobody can check.
 */
const API = 'https://api.esv.org/v3/passage/text/';

/**
 * The page that issues a key shows it as `Authorization: Token 59e3…`, so the
 * whole line is what gets copied — and a key with the header still attached is
 * a key the source refuses, with no clue as to why. Whatever was pasted, what
 * is kept is the token.
 */
export function cleanToken(pasted: string): string {
  return pasted
    .trim()
    .replace(/^authorization\s*:\s*/i, '')
    .replace(/^token\s+/i, '')
    .trim();
}

export type Passage = {
  /** How the source itself spells what you asked for: "John 3:16–17". */
  reference: string;
  text: string;
};

export class EsvError extends Error {
  constructor(public code: 'no-key' | 'rejected' | 'not-found' | 'busy' | 'offline') {
    super(code);
  }
}

/** Their own wording, kept with the words it belongs to. */
export const ESV_NOTICE =
  'Scripture quotations are from the ESV® Bible, copyright © 2001 by Crossway. Used by permission. All rights reserved.';

/**
 * Doubling, capped, with jitter — the cap so a wait never becomes a hang, and
 * the jitter because every phone that hit the limit at the same moment would
 * otherwise come back at the same moment too.
 */
export function retryDelay(attempt: number, random = Math.random): number {
  const base = Math.min(8000, 500 * 2 ** attempt);
  return Math.round(base / 2 + random() * (base / 2));
}

/** Their limit is theirs to state; this only agrees to wait when told to. */
const ATTEMPTS = 4;

export async function lookUpEsv(
  reference: string,
  token: string | null,
  options: { onWait?: (ms: number) => void } = {}
): Promise<Passage> {
  if (!token) throw new EsvError('no-key');

  const query = new URLSearchParams({
    q: reference.trim(),
    'include-passage-references': 'false',
    'include-verse-numbers': 'true',
    'include-first-verse-numbers': 'true',
    'include-footnotes': 'false',
    'include-headings': 'false',
    'include-short-copyright': 'false',
    'indent-poetry': 'false',
  });

  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try {
      response = await fetch(`${API}?${query}`, { headers: { Authorization: `Token ${token}` } });
    } catch {
      throw new EsvError('offline');
    }

    // Asked to slow down, or their end faltered: wait and ask again, rather
    // than turning a busy minute into a failure the reader has to understand.
    if ((response.status === 429 || response.status >= 500) && attempt < ATTEMPTS - 1) {
      const wait = retryDelay(attempt);
      options.onWait?.(wait);
      await new Promise((resolve) => setTimeout(resolve, wait));
      continue;
    }
    if (response.status === 429) throw new EsvError('busy');
    if (response.status === 401 || response.status === 403) throw new EsvError('rejected');
    if (!response.ok) throw new EsvError('not-found');

    const passage = passageFrom(await response.json());
    if (!passage) throw new EsvError('not-found');
    return passage;
  }
}

/**
 * The API answers with the passages it found and the reference it understood
 * you to mean, which is worth showing: asking for `Jn 3` and being told
 * "John 3" is how you know it read you right.
 */
export function passageFrom(payload: unknown): Passage | null {
  const body = payload as { canonical?: string; passages?: string[] };
  const text = (body?.passages ?? []).join('\n\n').trim();
  if (!text) return null;
  return { reference: body.canonical?.trim() || '', text };
}
