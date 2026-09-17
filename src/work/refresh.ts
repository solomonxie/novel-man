import { useEffect, useRef } from 'react';
import { subscribeToWork } from './queue';

/**
 * `useFocusEffect` only fires on navigation, so a page being *watched* while a
 * run works sits on whatever it loaded before the run started — the analysis
 * lands in the database and the screen showing it never says so. Pages that
 * display what a pass writes re-read when a unit settles.
 *
 * Coalesced, because a page's `load` can be expensive (the book page reads the
 * whole manuscript) and a 500-chapter run settles 500 times. A run served from
 * cache lands its units back to back; waiting for a gap turns that into one
 * reload instead of hundreds.
 */
export function useWorkRefresh(reload: () => void, quietMs = 1200) {
  const settled = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToWork((runs) => {
      const done = runs.reduce((total, run) => total + run.done, 0);
      // The first publish is the baseline, not a change: subscribing would
      // otherwise reload every page the moment it mounts.
      const changed = settled.current !== null && done !== settled.current;
      settled.current = done;
      if (!changed) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(reload, quietMs);
    });
    return () => {
      unsubscribe();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [reload, quietMs]);
}
