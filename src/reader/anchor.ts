import type { Annotation } from '../db/repo';

/** Enough neighbouring text to tell two identical sentences apart. */
export const CONTEXT = 40;

export function fingerprint(text: string, start: number, end: number) {
  return {
    prefix: text.slice(Math.max(0, start - CONTEXT), start),
    suffix: text.slice(end, end + CONTEXT),
  };
}

/**
 * Offsets move when a document is re-imported or a chapter is re-split, so an
 * annotation is found by its words first and its offsets only as a hint. An
 * annotation that can't be found is reported rather than silently relocated.
 */
export function reanchor(text: string, annotation: Annotation): { start: number; end: number } | null {
  if (text.slice(annotation.start, annotation.end) === annotation.quote) {
    return { start: annotation.start, end: annotation.end };
  }
  const withContext = `${annotation.prefix}${annotation.quote}${annotation.suffix}`;
  const contextual = nearest(text, withContext, annotation.start - annotation.prefix.length);
  if (contextual >= 0) {
    const start = contextual + annotation.prefix.length;
    return { start, end: start + annotation.quote.length };
  }
  const bare = nearest(text, annotation.quote, annotation.start);
  return bare >= 0 ? { start: bare, end: bare + annotation.quote.length } : null;
}

/** The same sentence can occur twice; the one nearest where it was wins. */
function nearest(text: string, needle: string, hint: number): number {
  if (!needle) return -1;
  let best = -1;
  let from = 0;
  while (true) {
    const at = text.indexOf(needle, from);
    if (at < 0) break;
    if (best < 0 || Math.abs(at - hint) < Math.abs(best - hint)) best = at;
    from = at + 1;
  }
  return best;
}

export function repairAll(text: string, annotations: Annotation[]) {
  const placed: Annotation[] = [];
  const lost: Annotation[] = [];
  for (const annotation of annotations) {
    const found = reanchor(text, annotation);
    if (found) placed.push({ ...annotation, ...found });
    else lost.push(annotation);
  }
  return { placed, lost };
}
