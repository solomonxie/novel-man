/**
 * A picture is a paragraph whose text is a link to it — `![alt](uri)`, the
 * Markdown everyone already writes. Keeping it as text rather than as a second
 * kind of block is what makes it free: offsets, highlights, notes, search and
 * export all go on working, and a reader that does not know about images shows
 * the caption instead of losing it.
 */
const IMAGE = /^!\[([^\]]*)\]\(\s*(\S+?)\s*\)$/;

export type ReaderImage = { uri: string; alt: string };

/** A picture this app stored: a bare file name, resolved against its own directory. */
const STORED = /^[\w.-]+\.[a-z0-9]{2,5}$/i;

export function imageIn(paragraph: string): ReaderImage | null {
  const found = IMAGE.exec(paragraph.trim());
  if (!found) return null;
  const uri = found[2];
  // An address the app can open, or a name it wrote itself. Anything else is
  // a relative path with nothing to resolve against once the book is text.
  if (!/^(https?:|file:|data:|content:)/i.test(uri) && !STORED.test(uri)) return null;
  return { uri, alt: found[1].trim() };
}

/** What the importer writes so the reader can find it again. */
export function imageMarker(uri: string, alt = ''): string {
  return `![${alt}](${uri})`;
}
