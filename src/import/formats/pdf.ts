import { extractPdf } from '../extractor';
import type { Importer } from '../types';

/**
 * A PDF is a description of a page, not of a text, so what comes out is always
 * a reconstruction — which is exactly why this format goes through the preview
 * gate before it becomes a book.
 */
export const pdfImporter: Importer = {
  id: 'pdf',
  label: 'PDF',
  extensions: ['pdf'],
  mimeTypes: ['application/pdf'],
  needsPreview: true,
  async parse(bytes, _fileName, context) {
    const blocks = await extractPdf(bytes, context);
    return { blocks };
  },
};
