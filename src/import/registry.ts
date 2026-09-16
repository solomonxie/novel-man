import type { Importer } from './types';
import { txtImporter, markdownImporter } from './formats/plain';
import { docxImporter } from './formats/docx';
import { epubImporter } from './formats/epub';

export const importers: Importer[] = [txtImporter, markdownImporter, docxImporter, epubImporter];

/** Formats the picker offers — and the ones the empty state promises. */
export const supportedExtensions = importers.flatMap((importer) => importer.extensions);

export const supportedMimeTypes = importers.flatMap((importer) => importer.mimeTypes);

export function importerFor(extension: string): Importer | undefined {
  return importers.find((importer) => importer.extensions.includes(extension.toLowerCase()));
}
