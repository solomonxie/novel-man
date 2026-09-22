/**
 * Temporary: timings written where a Release build can be read from.
 *
 * `console.log` goes nowhere on a device build, so the open path writes its
 * own clock to Documents/trace.txt, which is pulled off the phone afterwards.
 * Delete this file and its call sites once the question it was added for is
 * answered.
 */
import { File, Paths } from '../storage/fs';

const lines: string[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

export function trace(what: string) {
  lines.push(`${Math.round(performance.now())} ${what}`);
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    try {
      new File(Paths.document, 'trace.txt').write(lines.join('\n'));
    } catch {
      // A trace that cannot be written is not worth a crash.
    }
  }, 800);
}

/** How long one promise took, under a name. */
export function timed<T>(name: string, work: Promise<T>): Promise<T> {
  const at = performance.now();
  trace(`${name} start`);
  return work.then(
    (value) => {
      trace(`${name} done ${Math.round(performance.now() - at)}ms`);
      return value;
    },
    (error) => {
      trace(`${name} failed ${Math.round(performance.now() - at)}ms`);
      throw error;
    }
  );
}
