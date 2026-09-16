import { unzipSync } from 'fflate';
import type { Block, Importer } from '../types';
import { attr, decodeEntities, firstTagText } from '../xml';

const PARAGRAPH = /<w:p\b[\s\S]*?<\/w:p>|<w:p\b[^>]*\/>/g;
const RUN_TEXT = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
const HEADING_STYLE = /^(?:Heading|heading|标题)\s*([1-6])$/;

export const docxImporter: Importer = {
  id: 'docx',
  label: 'Word',
  extensions: ['docx'],
  mimeTypes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  async parse(bytes) {
    const zip = unzipSync(bytes);
    const documentXml = readEntry(zip, 'word/document.xml');
    if (!documentXml) throw new Error('not-a-docx');

    const blocks: Block[] = [];
    let styledTitle: string | undefined;
    for (const paragraph of documentXml.match(PARAGRAPH) ?? []) {
      const text = paragraphText(paragraph);
      if (!text) continue;
      if (!styledTitle && isTitleStyle(paragraph)) {
        styledTitle = text;
        continue;
      }
      const heading = headingLevel(paragraph);
      blocks.push(heading ? { text, heading } : { text });
    }

    const core = readEntry(zip, 'docProps/core.xml') ?? '';
    return {
      blocks,
      title: firstTagText(core, 'dc:title') ?? styledTitle,
      author: firstTagText(core, 'dc:creator'),
    };
  },
};

function paragraphText(paragraph: string): string {
  let out = '';
  let match: RegExpExecArray | null;
  const runs = new RegExp(RUN_TEXT.source, 'g');
  while ((match = runs.exec(paragraph))) out += decodeEntities(match[1]);
  return out.replace(/<w:tab\/>/g, '\t').trim();
}

/** Word marks chapters two different ways and real documents use both. */
function headingLevel(paragraph: string): number | undefined {
  const style = /<w:pStyle\b[^>]*>/.exec(paragraph);
  if (style) {
    const value = attr(style[0], 'w:val') ?? '';
    const named = HEADING_STYLE.exec(value);
    if (named) return Number(named[1]);
  }
  const outline = /<w:outlineLvl\b[^>]*>/.exec(paragraph);
  if (outline) {
    const level = Number(attr(outline[0], 'w:val'));
    if (Number.isFinite(level) && level <= 5) return level + 1;
  }
  return undefined;
}

function isTitleStyle(paragraph: string): boolean {
  const style = /<w:pStyle\b[^>]*>/.exec(paragraph);
  return !!style && /^(Title|Subtitle)$/i.test(attr(style[0], 'w:val') ?? '');
}

function readEntry(zip: Record<string, Uint8Array>, path: string): string | undefined {
  const entry = zip[path];
  return entry ? new TextDecoder('utf-8').decode(entry) : undefined;
}
