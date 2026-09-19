import { generatePDF } from 'react-native-html-to-pdf';

/**
 * HTML to a PDF file on disk — the one renderer the app has, and what every
 * export that isn't plain text is built on.
 *
 * Backgrounds are printed because they carry meaning here: a quote card is the
 * reading theme it was read in, and without them a night card comes out white.
 */
export async function printToFileAsync({ html }: { html: string; base64?: boolean }) {
  const { filePath } = await generatePDF({ html, shouldPrintBackgrounds: true });
  return { uri: filePath.startsWith('file://') ? filePath : `file://${filePath}` };
}
