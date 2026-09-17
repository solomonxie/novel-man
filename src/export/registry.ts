import type { Exporter } from './types';
import { markdownExporter, txtExporter } from './formats/text';
import { htmlExporter } from './formats/html';
import { docxExporter } from './formats/docx';
import { epubExporter } from './formats/epub';
import { pdfExporter } from './formats/pdf';
import { annotationsCsvExporter, annotationsMarkdownExporter } from './formats/annotations';
import { bibleDocxExporter, bibleMarkdownExporter } from './formats/bible';
import { bilingualExporter, translatedExporter } from './formats/translated';
import { finalDraftExporter, fountainExporter } from './formats/screenplay';
import { metadataMarkdownExporter, metadataPdfExporter } from './formats/metadata';
import { profileMarkdownExporter, profilePdfExporter } from './formats/profile';

/** Manuscript formats first, then the two that export only what you marked. */
export const manuscriptExporters: Exporter[] = [
  txtExporter,
  markdownExporter,
  htmlExporter,
  docxExporter,
  epubExporter,
  pdfExporter,
];

export const annotationExporters: Exporter[] = [
  annotationsMarkdownExporter,
  annotationsCsvExporter,
];

/** Offered only once there is a cast to export — an empty bible is not a file. */
export const castExporters: Exporter[] = [bibleMarkdownExporter, bibleDocxExporter];

/** What the book turned out to be, without the manuscript itself. */
export const metadataExporters: Exporter[] = [metadataMarkdownExporter, metadataPdfExporter];

/** Offered from one character's page, where the subject is that character. */
export const profileExporters: Exporter[] = [profileMarkdownExporter, profilePdfExporter];

/** Offered only from a target language, which is where the choice makes sense. */
export const translationExporters: Exporter[] = [translatedExporter, bilingualExporter];

/** Offered only once a screenplay exists to write out. */
export const scriptExporters: Exporter[] = [fountainExporter, finalDraftExporter];

export const exporters = [
  ...manuscriptExporters,
  ...annotationExporters,
  ...castExporters,
  ...metadataExporters,
  ...profileExporters,
  ...translationExporters,
  ...scriptExporters,
];

export function exporterById(id: string): Exporter | undefined {
  return exporters.find((exporter) => exporter.id === id);
}
