import { Share } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { readingThemes, type ReadingTheme } from '../theme';
import { escapeHtml } from '../text/escape';

export type Quote = {
  text: string;
  title: string;
  author?: string | null;
  chapter?: string | null;
  note?: string | null;
};

export function quoteAsText(quote: Quote): string {
  const attribution = [quote.title, quote.author, quote.chapter].filter(Boolean).join(' · ');
  return quote.note
    ? `“${quote.text}”\n\n${quote.note}\n\n— ${attribution}`
    : `“${quote.text}”\n\n— ${attribution}`;
}

export async function shareQuoteText(quote: Quote) {
  await Share.share({ message: quoteAsText(quote) });
}

/**
 * A card is a picture of a quote, and the only renderer available without a
 * native build is the print pipeline — so the card is laid out in the reading
 * theme the quote was read in and comes out as a shareable page.
 */
export async function shareQuoteCard(quote: Quote, theme: ReadingTheme, serif: boolean) {
  const { uri } = await Print.printToFileAsync({ html: cardHtml(quote, theme, serif), base64: false });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
  } else {
    await Share.share({ url: uri, message: quoteAsText(quote) });
  }
  return uri;
}

function cardHtml(quote: Quote, theme: ReadingTheme, serif: boolean): string {
  const palette = readingThemes[theme];
  const attribution = [quote.title, quote.author, quote.chapter].filter(Boolean).join(' · ');
  const family = serif ? 'Georgia, "Songti SC", serif' : '-apple-system, "PingFang SC", sans-serif';
  return `<!doctype html><html><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  @page { margin: 0; size: 1080px 1350px; }
  body { margin: 0; background: ${palette.bg}; color: ${palette.text};
         font-family: ${family}; display: flex; align-items: center; }
  .card { padding: 120px 110px; }
  blockquote { margin: 0; font-size: 54px; line-height: 1.6; }
  .note { margin-top: 48px; font-size: 34px; line-height: 1.6; color: ${palette.dim}; }
  .by { margin-top: 72px; font-size: 30px; letter-spacing: 0.04em; color: ${palette.dim}; }
  .rule { width: 96px; height: 4px; background: ${palette.dim}; opacity: 0.5; margin-bottom: 56px; }
</style></head><body><div class="card">
  <div class="rule"></div>
  <blockquote>${escapeHtml(quote.text)}</blockquote>
  ${quote.note ? `<div class="note">${escapeHtml(quote.note)}</div>` : ''}
  <div class="by">${escapeHtml(attribution)}</div>
</div></body></html>`;
}
