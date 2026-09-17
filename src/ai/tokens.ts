/**
 * Self-contained on purpose: the request log needs a token estimate and lives
 * under the key layer, which `cost.ts` already depends on. Importing it back
 * would close a cycle for the sake of one ratio.
 */
const CJK = /[㐀-鿿぀-ヿ가-힯]/g;

export function estimateTokensOf(text: string): number {
  const cjk = (text.match(CJK) ?? []).length;
  return Math.ceil(text.length / (cjk > text.length * 0.2 ? 1.6 : 4));
}
