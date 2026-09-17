import * as Print from 'expo-print';
import { safeFileName, type Exporter } from '../types';
import { renderHtml } from './html';

/**
 * Typeset by the platform's own print pipeline from the same HTML the web
 * export produces — one renderer, so the page you get matches the page you saw.
 */
export const pdfExporter: Exporter = {
  id: 'pdf',
  extension: 'pdf',
  mimeType: 'application/pdf',
  keeps: { chapters: true, annotations: true, styling: true },
  roundTrip: false,
  async build(input) {
    const { uri } = await Print.printToFileAsync({ html: renderHtml(input), base64: false });
    return { fileName: `${safeFileName(input.book.title)}.pdf`, mimeType: 'application/pdf', uri };
  },
};
