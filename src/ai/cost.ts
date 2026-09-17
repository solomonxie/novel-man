import { scriptOf } from '../text/language';
import { listKeys } from './keys';
import { modelFor, vendorById, type Model, type Vendor } from './vendors';

/**
 * Token counts differ per tokenizer and vendors don't publish theirs, so this
 * is deliberately a rough ratio per script rather than a real count. Every
 * number it produces is shown as an estimate and never as a charge.
 */
const CHARS_PER_TOKEN = { latin: 4, cjk: 1.6 };

export function estimateTokens(text: string, language: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN[scriptOf(language)]);
}

export type Estimate = { inputTokens: number; outputTokens: number; usd: number; vendor: string };

export type EstimateInput = {
  units: string[];
  language: string;
  /** How much output each unit is expected to produce, as a share of its input. */
  outputRatio: number;
  overheadTokens?: number;
};

/** The estimate is for the key that would actually run it: the first one. */
export async function estimate(input: EstimateInput): Promise<Estimate | null> {
  const [first] = await listKeys();
  const vendor = first ? vendorById(first.vendorId) : undefined;
  return vendor ? estimateFor(vendor, modelFor(vendor, first.model), input) : null;
}

export function estimateFor(vendor: Vendor, model: Model, input: EstimateInput): Estimate {
  const overhead = (input.overheadTokens ?? 200) * input.units.length;
  const inputTokens =
    overhead + input.units.reduce((total, unit) => total + estimateTokens(unit, input.language), 0);
  const outputTokens = Math.ceil(inputTokens * input.outputRatio);
  const usd = (inputTokens * model.price.in + outputTokens * model.price.out) / 1_000_000;
  return { inputTokens, outputTokens, usd, vendor: `${vendor.name} · ${model.name}` };
}

/**
 * A single chapter costs a fraction of a cent, and "<$0.01" hides whether that
 * is a tenth of one or a hundredth — which is the whole question when the run
 * is about to be repeated five hundred times. Small numbers keep their digits.
 */
export function formatUsd(usd: number): string {
  if (usd >= 0.01) return `$${usd.toFixed(2)}`;
  if (usd >= 0.0001) return `$${usd.toFixed(4)}`;
  return '<$0.0001';
}
