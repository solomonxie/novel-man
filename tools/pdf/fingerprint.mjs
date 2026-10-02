/**
 * The app's `src/storage/fingerprint.ts`, repeated here because a Node script
 * cannot import the app's TypeScript — and checked against the same vectors,
 * because the two drifting apart means a correctly linked PDF gets refused.
 */
export function fingerprintOf(bytes) {
  const stride = Math.max(1, Math.floor(bytes.length / 4096));
  let out = `${bytes.length}:`;
  for (let i = 0; i < bytes.length; i += stride) out += bytes[i].toString(36);
  return out;
}

/** Run once, when this module loads, so a drift is loud and immediate. */
const VECTORS = [
  [[], '0:'],
  [[0], '1:0'],
  [[1, 2, 3], '3:123'],
  [[255, 0, 128], '3:7303k'],
];
for (const [input, want] of VECTORS) {
  const got = fingerprintOf(new Uint8Array(input));
  if (got !== want) {
    throw new Error(
      `fingerprintOf has drifted from the app: [${input}] gave ${got}, not ${want}`
    );
  }
}
