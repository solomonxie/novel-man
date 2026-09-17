import { escapeHtml } from '../../text/escape';
import type { ScriptElement } from '../../script/model';
import { safeFileName, type ExportInput, type Exporter } from '../types';

/**
 * Fountain is plain text with conventions; Final Draft is XML. Both read the
 * same element list, so the conversion is done once and the two formats are
 * only rendering.
 */
function elements(input: ExportInput): ScriptElement[] {
  return input.script ?? [];
}

export const fountainExporter: Exporter = {
  id: 'fountain',
  extension: 'fountain',
  mimeType: 'text/plain',
  keeps: { chapters: true, annotations: false, styling: true },
  roundTrip: false,
  async build(input) {
    const lines = [
      `Title: ${input.book.title}`,
      input.book.author ? `Author: ${input.book.author}` : '',
      '',
    ];
    for (const element of elements(input)) {
      switch (element.type) {
        case 'scene_heading':
          lines.push('', element.text.toUpperCase(), '');
          break;
        case 'character':
          lines.push('', element.text.toUpperCase());
          break;
        case 'parenthetical':
          lines.push(`(${element.text.replace(/^\(|\)$/g, '')})`);
          break;
        case 'dialogue':
          lines.push(element.text);
          break;
        case 'transition':
          lines.push('', `> ${element.text.toUpperCase()}`, '');
          break;
        default:
          lines.push('', element.text);
      }
    }
    return {
      fileName: `${safeFileName(input.book.title)}.fountain`,
      mimeType: 'text/plain',
      body: `${lines.filter((line, index) => line !== '' || lines[index - 1] !== '').join('\n')}\n`,
    };
  },
};

const FDX_TYPES: Record<ScriptElement['type'], string> = {
  scene_heading: 'Scene Heading',
  action: 'Action',
  character: 'Character',
  parenthetical: 'Parenthetical',
  dialogue: 'Dialogue',
  transition: 'Transition',
};

export const finalDraftExporter: Exporter = {
  id: 'fdx',
  extension: 'fdx',
  mimeType: 'application/xml',
  keeps: { chapters: true, annotations: false, styling: true },
  roundTrip: false,
  async build(input) {
    const paragraphs = elements(input)
      .map(
        (element) =>
          `<Paragraph Type="${FDX_TYPES[element.type]}"><Text>${escapeHtml(
            element.type === 'scene_heading' || element.type === 'character'
              ? element.text.toUpperCase()
              : element.text
          )}</Text></Paragraph>`
      )
      .join('\n');
    return {
      fileName: `${safeFileName(input.book.title)}.fdx`,
      mimeType: 'application/xml',
      body: `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<FinalDraft DocumentType="Script" Template="No" Version="5">
<Content>
${paragraphs}
</Content>
<TitlePage><Content>
<Paragraph Alignment="Center"><Text>${escapeHtml(input.book.title)}</Text></Paragraph>
${input.book.author ? `<Paragraph Alignment="Center"><Text>${escapeHtml(input.book.author)}</Text></Paragraph>` : ''}
</Content></TitlePage>
</FinalDraft>`,
    };
  },
};
