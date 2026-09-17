import { useCallback, useRef, useState } from 'react';
import { getDocument } from '../db/repo';
import type { StructureHint } from '../structure/document';

export type LoadedDocument = { text: string; hints: StructureHint[] };

const EMPTY: LoadedDocument = { text: '', hints: [] };

/**
 * A manuscript is megabytes. Pulling it across the bridge on every focus made
 * opening a chapter list take seconds for something that only needed a table
 * of 500 short rows — so nothing loads it until something actually asks, and
 * once asked it is kept for as long as the screen is.
 */
export function useDocument(bookId?: string) {
  const cached = useRef<LoadedDocument | null>(null);
  const inFlight = useRef<Promise<LoadedDocument> | null>(null);
  const [loading, setLoading] = useState(false);

  const read = useCallback(async (): Promise<LoadedDocument> => {
    if (!bookId) return EMPTY;
    if (cached.current) return cached.current;
    if (!inFlight.current) {
      setLoading(true);
      inFlight.current = getDocument(bookId)
        .then((document) => {
          cached.current = document;
          return document;
        })
        .finally(() => {
          inFlight.current = null;
          setLoading(false);
        });
    }
    return inFlight.current;
  }, [bookId]);

  const forget = useCallback(() => {
    cached.current = null;
  }, []);

  return { read, forget, loading };
}
