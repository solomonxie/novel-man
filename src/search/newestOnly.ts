/**
 * One search at a time, and only the newest waiting: a term typed while one
 * runs replaces whatever was queued, so the last keystroke's answer never sits
 * behind every earlier keystroke's. `show` hears only the newest term asked.
 */
export function newestOnly<T>(run: (term: string) => Promise<T>, show: (term: string, value: T) => void) {
  let running = false;
  let next: string | null = null;
  let latest: string | null = null;

  async function drain() {
    running = true;
    while (next !== null) {
      const term = next;
      next = null;
      const value = await run(term);
      if (term === latest && next === null) show(term, value);
    }
    running = false;
  }

  return {
    ask(term: string) {
      latest = term;
      next = term;
      if (!running) void drain();
    },
    /** What is queued is dropped and what is running is not shown. */
    stop() {
      latest = null;
      next = null;
    },
  };
}
