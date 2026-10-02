const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Hermes has no `btoa`, and bytes still have to cross string bridges. */
export function base64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += CHARS[a >> 2];
    out += CHARS[((a & 3) << 4) | ((b ?? 0) >> 4)];
    out += b === undefined ? '=' : CHARS[((b & 15) << 2) | ((c ?? 0) >> 6)];
    out += c === undefined ? '=' : CHARS[c & 63];
  }
  return out;
}

/**
 * Where each character sits in the alphabet, and `-1` for everything that is
 * not in it — padding, newlines, whatever a transport added. Signed, so "not
 * base64" and "the letter A" are different answers.
 */
const CODES = (() => {
  const table = new Int8Array(128).fill(-1);
  for (let i = 0; i < CHARS.length; i++) table[CHARS.charCodeAt(i)] = i;
  return table;
})();

/**
 * The way back, for bytes that crossed a string bridge.
 *
 * One pass, and that is the whole of the design. It used to begin
 * `text.replace(/[^A-Za-z0-9+\/]/g, '')` to get a clean string to walk — which
 * for an 18 MB EPUB means scanning 24.7 million characters and building a
 * second 24.7 million character copy of them before decoding a single byte.
 * Two strings of that size are about a hundred megabytes of UTF-16 on a phone,
 * and the scan is dead work: anything the filter would have removed can simply
 * be skipped where it is found.
 *
 * Bits are accumulated rather than taken four characters at a time, because
 * without the pre-filter the characters no longer arrive in groups of four.
 */
export function fromBase64(text: string): Uint8Array {
  const out = new Uint8Array(((text.length * 3) >> 2) + 2);
  let at = 0;
  let bits = 0;
  let held = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code > 127) continue;
    const value = CODES[code];
    if (value < 0) continue;
    held = (held << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[at++] = (held >> bits) & 0xff;
    }
  }
  return at === out.length ? out : out.subarray(0, at);
}
