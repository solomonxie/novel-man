import { unzipSync } from 'fflate';
import type { Block, Importer, ParseContext } from '../types';
import { attrValue, decodeEntities, eachElement, firstTagText } from '../xml';

const HEADING_STYLE = /^(?:Heading|heading|标题)\s*([1-6])$/;
const YIELD_EVERY = 2000;

export const docxImporter = {
  id: 'docx',
  label: 'Word',
  extensions: ['docx'],
  utis: ['org.openxmlformats.wordprocessingml.document'],
  async parse(bytes: Uint8Array, _fileName: string, context?: ParseContext) {
    const zip = unzipSync(bytes);
    const documentXml = readEntry(zip, 'word/document.xml');
    if (!documentXml) throw new Error('not-a-docx');

    const blocks: Block[] = [];
    let styledTitle: string | undefined;
    let seen = 0;
    // The XML length is the only cheap proxy for total work before scanning.
    const total = documentXml.length;

    for (const paragraph of eachElement(documentXml, 'w:p')) {
      seen += 1;
      if (seen % YIELD_EVERY === 0) {
        await context?.onProgress?.(Math.min(total, seen * (total / estimatedParagraphs(total))), total);
      }
      const text = paragraphText(paragraph);
      if (!text) continue;
      if (!styledTitle && isTitleStyle(paragraph)) {
        styledTitle = text;
        continue;
      }
      const heading = headingLevel(paragraph);
      blocks.push(heading ? { text, heading } : { text });
    }
    await context?.onProgress?.(total, total);

    const core = readEntry(zip, 'docProps/core.xml') ?? '';
    return {
      blocks,
      title: firstTagText(core, 'dc:title') ?? styledTitle,
      author: firstTagText(core, 'dc:creator'),
    };
  },
} satisfies Importer;

/** Word averages roughly 600 bytes of XML per paragraph; only used to pace progress. */
function estimatedParagraphs(totalBytes: number) {
  return Math.max(1, totalBytes / 600);
}

function paragraphText(paragraph: string): string {
  let out = '';
  for (const run of eachElement(paragraph, 'w:t')) {
    const textStart = run.indexOf('>');
    if (textStart >= 0) out += decodeEntities(run.slice(textStart + 1));
  }
  if (paragraph.indexOf('<w:tab/>') >= 0) out = out.replace(/<w:tab\/>/g, '\t');
  return out.trim();
}

/** Word marks chapters two different ways and real documents use both. */
function headingLevel(paragraph: string): number | undefined {
  const value = styleValue(paragraph);
  if (value) {
    const named = HEADING_STYLE.exec(value);
    if (named) return Number(named[1]);
  }
  const outlineAt = paragraph.indexOf('<w:outlineLvl');
  if (outlineAt >= 0) {
    const end = paragraph.indexOf('>', outlineAt);
    const level = Number(attrValue(paragraph.slice(outlineAt, end + 1), 'w:val'));
    if (Number.isFinite(level) && level <= 5) return level + 1;
  }
  return undefined;
}

function styleValue(paragraph: string): string | undefined {
  const at = paragraph.indexOf('<w:pStyle');
  if (at < 0) return undefined;
  const end = paragraph.indexOf('>', at);
  return attrValue(paragraph.slice(at, end + 1), 'w:val');
}

function isTitleStyle(paragraph: string): boolean {
  const value = styleValue(paragraph);
  return !!value && /^(Title|Subtitle)$/i.test(value);
}

function readEntry(zip: Record<string, Uint8Array>, path: string): string | undefined {
  const entry = zip[path];
  return entry ? new TextDecoder('utf-8').decode(entry) : undefined;
}
