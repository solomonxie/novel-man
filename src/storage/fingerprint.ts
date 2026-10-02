/**
 * Enough of a file to recognise it again, cheaply.
 *
 * Every byte of a 35 MB PDF through a hash is seconds of a frozen phone, and
 * the question is never "prove this is the file" — it is "is this the file I
 * was made from, or has somebody picked a different printing". A byte count
 * and four thousand samples spread through the file answer that: two PDFs of
 * the same book from different sources differ in length almost always, and in
 * their bytes everywhere.
 *
 * This is written in two places on purpose — here, and in
 * `tools/pdf/fingerprint.mjs` where the converter stamps a book with the PDF
 * it came out of. They have to agree exactly or a correctly linked file is
 * refused, so both are pinned to the same vectors: the fixture tests check
 * this one, and the converter checks itself against the same numbers before it
 * writes anything.
 */
export function fingerprintOf(bytes: Uint8Array): string {
  const stride = Math.max(1, Math.floor(bytes.length / 4096));
  let out = `${bytes.length}:`;
  for (let i = 0; i < bytes.length; i += stride) out += bytes[i].toString(36);
  return out;
}
