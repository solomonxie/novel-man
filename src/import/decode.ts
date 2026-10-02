/**
 * Manuscripts arrive in whatever encoding the author's word processor used;
 * a wrong guess here corrupts every downstream offset.
 *
 * Decoded by hand, because Hermes has no `TextDecoder`. React Native ships no
 * polyfill for it either, so `new TextDecoder('utf-8')` is a `ReferenceError`
 * on the device and was one in both branches of this function — the `catch`
 * fell back to another `TextDecoder`, which threw the same thing with nothing
 * left to catch it. Every text file this app could be given failed on that
 * line: `.txt`, `.md`, `.html`, and a bible out of a repository. It looked
 * like a parser that could not read Markdown, which is what it was reported as.
 *
 * `base64` next door is hand-written for the same reason, and this is the same
 * trade: a page of arithmetic against an API that is not there.
 */

/**
 * Built in batches. `String.fromCharCode(...units)` with a megabyte of
 * arguments is a stack overflow, not a string, so the units are flushed every
 * few thousand and the pieces joined once at the end — which is also what
 * keeps this from being a million rope concatenations.
 */
const BATCH = 4096;

function assemble(units: number[], pieces: string[]) {
  pieces.push(String.fromCharCode.apply(null, units));
  units.length = 0;
}

/** The replacement character, for bytes that are not what the sniff promised. */
const BAD = 0xfffd;

export function decodeUtf8(bytes: Uint8Array): string {
  const pieces: string[] = [];
  const units: number[] = [];
  for (let at = 0; at < bytes.length; ) {
    const byte = bytes[at];
    let point: number;
    if (byte < 0x80) {
      point = byte;
      at += 1;
    } else if (byte >= 0xc0 && byte < 0xe0 && at + 1 < bytes.length) {
      point = ((byte & 0x1f) << 6) | (bytes[at + 1] & 0x3f);
      at += 2;
    } else if (byte >= 0xe0 && byte < 0xf0 && at + 2 < bytes.length) {
      point = ((byte & 0x0f) << 12) | ((bytes[at + 1] & 0x3f) << 6) | (bytes[at + 2] & 0x3f);
      at += 3;
    } else if (byte >= 0xf0 && at + 3 < bytes.length) {
      point =
        ((byte & 0x07) << 18) |
        ((bytes[at + 1] & 0x3f) << 12) |
        ((bytes[at + 2] & 0x3f) << 6) |
        (bytes[at + 3] & 0x3f);
      at += 4;
    } else {
      point = BAD;
      at += 1;
    }
    if (point > 0xffff) {
      // Above the basic plane there are no single units: an emoji, or one of
      // the rarer Han characters, is a surrogate pair.
      const above = point - 0x10000;
      units.push(0xd800 + (above >> 10), 0xdc00 + (above & 0x3ff));
    } else {
      units.push(point);
    }
    if (units.length >= BATCH) assemble(units, pieces);
  }
  if (units.length) assemble(units, pieces);
  return pieces.join('');
}

function decodeUtf16(bytes: Uint8Array, little: boolean): string {
  const pieces: string[] = [];
  const units: number[] = [];
  // The byte order mark is the mark, not the text.
  for (let at = bytes.length % 2 === 0 ? 2 : 3; at + 1 < bytes.length; at += 2) {
    units.push(little ? bytes[at] | (bytes[at + 1] << 8) : (bytes[at] << 8) | bytes[at + 1]);
    if (units.length >= BATCH) assemble(units, pieces);
  }
  if (units.length) assemble(units, pieces);
  return pieces.join('');
}

/**
 * 简体中文 written before UTF-8 won, which is most Chinese text files older
 * than about 2010. The table that maps its 23,940 two-byte codes is a hundred
 * kilobytes, and shipping it in the bundle to serve the occasional legacy
 * `.txt` is the wrong trade — iOS already carries the mapping, so it is asked
 * instead, through the hook below.
 *
 * Absent, the text is read as UTF-8 and comes out wrong rather than missing.
 * That is the right failure: a reader can see it is mojibake and convert the
 * file, where an exception loses the import with nothing to look at.
 */
let legacy: ((bytes: Uint8Array) => string) | null = null;

/**
 * Registered once at launch by `src/import/legacyText.ts`, which is the only
 * file here allowed to know about native modules — this one is compiled on its
 * own by the parse check, with no React Native to import.
 */
export function useLegacyDecoder(decode: (bytes: Uint8Array) => string) {
  legacy = decode;
}

export function decodeText(bytes: Uint8Array): string {
  const encoding = sniffEncoding(bytes);
  if (encoding === 'utf-16le' || encoding === 'utf-16be') {
    return decodeUtf16(bytes, encoding === 'utf-16le').replace(/\r\n?/g, '\n');
  }
  if (encoding === 'gb18030' && legacy) {
    try {
      return legacy(bytes).replace(/\r\n?/g, '\n');
    } catch {
      // Fall through and read it as UTF-8 — see above.
    }
  }
  const body = hasBom(bytes) ? bytes.subarray(3) : bytes;
  return decodeUtf8(body).replace(/\r\n?/g, '\n');
}

function hasBom(bytes: Uint8Array) {
  return bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
}

function sniffEncoding(bytes: Uint8Array): string {
  if (hasBom(bytes)) return 'utf-8';
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le';
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be';
  return looksLikeUtf8(bytes) ? 'utf-8' : 'gb18030';
}

function looksLikeUtf8(bytes: Uint8Array): boolean {
  const limit = Math.min(bytes.length, 4096);
  for (let i = 0; i < limit; ) {
    const byte = bytes[i];
    if (byte < 0x80) { i += 1; continue; }
    const width = byte >= 0xf0 ? 4 : byte >= 0xe0 ? 3 : byte >= 0xc0 ? 2 : 0;
    if (width === 0 || i + width > limit) return false;
    for (let k = 1; k < width; k++) {
      if ((bytes[i + k] & 0xc0) !== 0x80) return false;
    }
    i += width;
  }
  return true;
}
