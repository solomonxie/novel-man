import { zipSync } from 'fflate';
import { bodyWithoutTitle, chapterBodies, safeFileName, type Exporter } from '../types';
import { pack, paragraph } from './ooxml';

/**
 * Chapters are Heading 1 because that is exactly what the importer reads back
 * as a chapter boundary — the round trip is the reason for the style, not
 * decoration.
 */
export const docxExporter: Exporter = {
  id: 'docx',
  extension: 'docx',
  mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  keeps: { chapters: true, annotations: false, styling: true },
  roundTrip: true,
  async build(input) {
    const body: string[] = [paragraph(input.book.title, 'Title')];
    if (input.book.author) body.push(paragraph(input.book.author, 'Subtitle'));
    for (const chapter of chapterBodies(input)) {
      body.push(paragraph(chapter.title, 'Heading1'));
      for (const text of bodyWithoutTitle(chapter)) body.push(paragraph(text));
    }

    return {
      fileName: `${safeFileName(input.book.title)}.docx`,
      mimeType: docxExporter.mimeType,
      body: zipSync(pack(body.join(''))),
    };
  },
};
