/**
 * One question out on the network at a time, and the one asked next is the
 * newest thing typed.
 *
 * A search box that fires on a pause still fires on every pause, and typing a
 * title has several in it. Three requests for three prefixes of the same
 * sentence race each other over one radio, and the answer anybody wants —
 * the last one — queues behind two that are already stale. So while a lookup
 * is out, a new term is not sent; it is held, and goes the moment the one in
 * flight comes back. At most one is ever waiting, and it is always the latest,
 * so nothing typed is lost and nothing typed is asked for twice.
 *
 * Answers are kept, because the shape of typing is a word and then a
 * correction to it: backspacing onto a term already asked paints from memory
 * and sends nothing at all.
 *
 * Nothing here knows what a catalog is. It holds terms and promises, which is
 * why it can be tested outside the app.
 */

export type Run<T> = (
  term: string,
  hand: {
    /** Aborted when the screen gives up on this search. */
    signal: AbortSignal;
    /** Everything known so far, for a run that answers in pieces. */
    partial: (value: T) => void;
  }
) => Promise<T>;

export type Heard<T> = {
  /** `settled` is false for a piece of an answer, true for the whole of one. */
  answer: (term: string, value: T, settled: boolean) => void;
  failed: (term: string, problem: unknown) => void;
  /** Whether anything is out or waiting to go. */
  waiting?: (busy: boolean) => void;
};

export type Asking = {
  ask: (term: string) => void;
  /** Abandon what is out and what is held, and say nothing more about either. */
  stop: () => void;
  /** The term on the wire now, if any. */
  outstanding: () => string | null;
  /** The term held back until that one answers, if any. */
  held: () => string | null;
};

/** Answers kept for a backspace. A few screens of typing, and each is small. */
const REMEMBER = 24;

export function oneAtATime<T>(run: Run<T>, heard: Heard<T>, remember = REMEMBER): Asking {
  const known = new Map<string, T>();
  let out: { term: string; slot: { at: number }; stop: AbortController; era: number } | null = null;
  let queued: { term: string; at: number } | null = null;
  /** Every ask gets a number; only a newer one may overwrite what is on screen. */
  let asked = 0;
  let shown = 0;
  /** Bumped by `stop`, which is how a run already in the air is disowned. */
  let era = 0;

  function deliver(at: number, term: string, value: T, settled: boolean) {
    if (at < shown) return;
    shown = at;
    heard.answer(term, value, settled);
  }

  function keep(term: string, value: T) {
    known.set(term, value);
    for (const oldest of known.keys()) {
      if (known.size <= remember) break;
      known.delete(oldest);
    }
  }

  function begin(term: string, at: number) {
    const slot = { at };
    const stop = new AbortController();
    const mine = era;
    out = { term, slot, stop, era: mine };
    heard.waiting?.(true);
    run(term, {
      signal: stop.signal,
      partial: (value) => {
        if (mine === era) deliver(slot.at, term, value, false);
      },
    })
      .then((value) => {
        if (mine !== era) return;
        keep(term, value);
        deliver(slot.at, term, value, true);
      })
      .catch((problem) => {
        if (mine === era) heard.failed(term, problem);
      })
      .finally(() => {
        if (mine !== era) return;
        out = null;
        const next = queued;
        queued = null;
        if (next) begin(next.term, next.at);
        else heard.waiting?.(false);
      });
  }

  return {
    ask(term) {
      if (!term) return;
      const at = ++asked;
      const remembered = known.get(term);
      if (remembered !== undefined) {
        // The newest intent is answered, so whatever was held for later is not
        // wanted any more.
        queued = null;
        deliver(at, term, remembered, true);
        if (!out) heard.waiting?.(false);
        return;
      }
      if (!out) return begin(term, at);
      // Already asking this. Restamping it keeps its answer newer than
      // anything painted from memory since it went out.
      if (out.term === term) {
        out.slot.at = at;
        queued = null;
        return;
      }
      queued = { term, at };
    },
    stop() {
      era += 1;
      out?.stop.abort();
      out = null;
      queued = null;
      heard.waiting?.(false);
    },
    outstanding: () => out?.term ?? null,
    held: () => queued?.term ?? null,
  };
}
