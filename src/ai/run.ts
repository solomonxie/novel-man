import { contentHash, readCache, writeCache } from './cache';
import { runChat } from './keys';
import type { ChatMessage } from './client';

export type Unit<T> = { id: string; input: T };

export type RunOptions<T, R> = {
  kind: string;
  units: Unit<T>[];
  prompt: (input: T) => ChatMessage[];
  parse: (answer: string, input: T) => R;
  maxTokens: number;
  /** Retries are per unit: one bad chapter must not cost the other 499. */
  retries?: number;
  onProgress?: (done: number, total: number) => void;
};

export type UnitResult<R> = {
  id: string;
  value?: R;
  error?: unknown;
  cached: boolean;
};

export class Canceled extends Error {
  constructor() {
    super('canceled');
  }
}

/**
 * The one place an AI feature spends money. Every run is a list of units, and
 * every unit is cached, retried and cancellable on its own — so a run that
 * stops halfway keeps what it already paid for, and resuming costs nothing for
 * the units that finished.
 */
export async function runUnits<T, R>(
  options: RunOptions<T, R>,
  signal?: AbortSignal
): Promise<UnitResult<R>[]> {
  const results: UnitResult<R>[] = [];
  const retries = options.retries ?? 1;

  for (const [index, unit] of options.units.entries()) {
    if (signal?.aborted) throw new Canceled();
    const messages = options.prompt(unit.input);
    const hash = contentHash(options.kind, ...messages.map((message) => message.content));

    const cached = await readCache(hash);
    if (cached !== null) {
      results.push(safeParse(unit.id, cached, unit.input, options, true));
      options.onProgress?.(index + 1, options.units.length);
      continue;
    }

    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (signal?.aborted) throw new Canceled();
      try {
        const answer = await runChat(messages, { maxTokens: options.maxTokens, signal });
        await writeCache(hash, options.kind, answer);
        results.push(safeParse(unit.id, answer, unit.input, options, false));
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (lastError !== undefined) results.push({ id: unit.id, error: lastError, cached: false });
    options.onProgress?.(index + 1, options.units.length);
  }
  return results;
}

/** A malformed answer is this unit's failure, not the run's. */
function safeParse<T, R>(
  id: string,
  answer: string,
  input: T,
  options: RunOptions<T, R>,
  cached: boolean
): UnitResult<R> {
  try {
    return { id, value: options.parse(answer, input), cached };
  } catch (error) {
    return { id, error, cached };
  }
}

/** Models wrap JSON in prose and fences however they feel; this unwraps it. */
export function parseJson<T>(answer: string): T {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(answer);
  const body = (fenced ? fenced[1] : answer).trim();
  const start = body.search(/[[{]/);
  const end = Math.max(body.lastIndexOf(']'), body.lastIndexOf('}'));
  if (start < 0 || end < start) throw new Error(`no JSON in answer: ${answer.slice(0, 120)}`);
  return JSON.parse(body.slice(start, end + 1)) as T;
}
