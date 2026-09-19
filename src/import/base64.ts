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

const CODES = (() => {
  const table = new Uint8Array(128);
  for (let i = 0; i < CHARS.length; i++) table[CHARS.charCodeAt(i)] = i;
  return table;
})();

/** The way back, for bytes that crossed a string bridge. */
export function fromBase64(text: string): Uint8Array {
  const clean = text.replace(/[^A-Za-z0-9+/]/g, '');
  const bytes = new Uint8Array((clean.length * 3) >> 2);
  let at = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = CODES[clean.charCodeAt(i)];
    const b = CODES[clean.charCodeAt(i + 1)];
    const c = CODES[clean.charCodeAt(i + 2)];
    const d = CODES[clean.charCodeAt(i + 3)];
    bytes[at++] = (a << 2) | (b >> 4);
    if (i + 2 < clean.length) bytes[at++] = ((b & 15) << 4) | (c >> 2);
    if (i + 3 < clean.length) bytes[at++] = ((c & 3) << 6) | d;
  }
  return at === bytes.length ? bytes : bytes.subarray(0, at);
}
