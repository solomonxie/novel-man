/**
 * Manuscripts arrive in whatever encoding the author's word processor used;
 * a wrong guess here corrupts every downstream offset.
 */
export function decodeText(bytes: Uint8Array): string {
  const encoding = sniffEncoding(bytes);
  const body = encoding === 'utf-8' && hasBom(bytes) ? bytes.subarray(3) : bytes;
  try {
    return new TextDecoder(encoding as string).decode(body).replace(/\r\n?/g, '\n');
  } catch {
    return new TextDecoder('utf-8').decode(body).replace(/\r\n?/g, '\n');
  }
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
