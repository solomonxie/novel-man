import { escapeHtml } from '../../text/escape';
import { bodyWithoutTitle, chapterBodies, safeFileName, type ExportInput, type Exporter } from '../types';

/** Highlights survive as marked spans, so a browser shows what you marked. */
export function renderHtml(input: ExportInput): string {
  const chapters = chapterBodies(input);
  const sections = chapters
    .map(
      (chapter) =>
        `<section><h2>${escapeHtml(chapter.title)}</h2>\n${bodyWithoutTitle(chapter)
          .map((paragraph) => `<p>${markUp(paragraph, input)}</p>`)
          .join('\n')}</section>`
    )
    .join('\n');

  return `<!doctype html><html lang="${input.book.language}"><head><meta charset="utf-8" />
<title>${escapeHtml(input.book.title)}</title>
<style>
  body { max-width: 38em; margin: 3em auto; padding: 0 1.2em; line-height: 1.7;
         font-family: Georgia, "Songti SC", serif; color: #1a1a1a; }
  h1 { font-size: 1.8em; margin-bottom: 0.2em; }
  .author { color: #666; margin-top: 0; }
  h2 { font-size: 1.2em; margin-top: 2.5em; }
  mark { padding: 0 0.1em; }
  aside { color: #666; font-size: 0.9em; border-left: 3px solid #ddd; padding-left: 0.8em; }
</style></head><body>
<h1>${escapeHtml(input.book.title)}</h1>
${input.book.author ? `<p class="author">${escapeHtml(input.book.author)}</p>` : ''}
${sections}
</body></html>`;
}

/** Offsets are lost once text is HTML, so marks are applied by exact quote. */
function markUp(paragraph: string, input: ExportInput): string {
  let out = escapeHtml(paragraph);
  for (const annotation of input.annotations) {
    const quote = escapeHtml(annotation.quote);
    if (!quote || !out.includes(quote)) continue;
    const note = annotation.note ? ` title="${escapeHtml(annotation.note)}"` : '';
    out = out.replace(
      quote,
      `<mark style="background:${annotation.color ?? '#FFE58A'}"${note}>${quote}</mark>`
    );
  }
  return out;
}

export const htmlExporter: Exporter = {
  id: 'html',
  extension: 'html',
  mimeType: 'text/html',
  keeps: { chapters: true, annotations: true, styling: true },
  roundTrip: false,
  async build(input) {
    return {
      fileName: `${safeFileName(input.book.title)}.html`,
      mimeType: 'text/html',
      body: renderHtml(input),
    };
  },
};
