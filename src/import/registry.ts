import type { Importer } from './types';
import { txtImporter, markdownImporter } from './formats/plain';
import { docxImporter } from './formats/docx';
import { epubImporter } from './formats/epub';
import { pdfImporter } from './formats/pdf';
import { htmlImporter } from './formats/html';

export const importers: Importer[] = [
  txtImporter,
  markdownImporter,
  docxImporter,
  epubImporter,
  pdfImporter,
  htmlImporter,
];

/** Formats the picker offers — and the ones the empty state promises. */
export const supportedExtensions = importers.flatMap((importer) => importer.extensions);

export const supportedUtis = importers.flatMap((importer) => importer.utis);

export function importerFor(extension: string): Importer | undefined {
  return importers.find((importer) => importer.extensions.includes(extension.toLowerCase()));
}
