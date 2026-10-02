import type { Importer } from './types';

/**
 * What the app itself reads: formats that are already text, and a zip of it.
 *
 * PDF is deliberately absent. It needed pdf.js inside a hidden WebView, fetched
 * from a CDN, with the whole file crossing the bridge as base64 — a 35 MB book
 * became a 47 MB JavaScript string in one call — and what came back was a
 * reconstruction either way, because a PDF describes a page rather than a text.
 * `tools/convert-pdf.mjs` does that job on a Mac, where there is memory and
 * time to do it properly, and hands back an EPUB this list already reads.
 */
import { txtImporter, markdownImporter } from './formats/plain';
import { docxImporter } from './formats/docx';
import { epubImporter } from './formats/epub';
import { htmlImporter } from './formats/html';

export const importers: Importer[] = [
  txtImporter,
  markdownImporter,
  docxImporter,
  epubImporter,
  htmlImporter,
];

/** Formats the picker offers — and the ones the empty state promises. */
export const supportedExtensions = importers.flatMap((importer) => importer.extensions);

export const supportedUtis = importers.flatMap((importer) => importer.utis);

export function importerFor(extension: string): Importer | undefined {
  return importers.find((importer) => importer.extensions.includes(extension.toLowerCase()));
}
