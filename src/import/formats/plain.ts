import type { Block, Importer } from '../types';
import { decodeText } from '../decode';

function blocksFromText(text: string): Block[] {
  return text
    .split(/\n{2,}|\r\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((text) => ({ text }));
}

export const txtImporter: Importer = {
  id: 'txt',
  label: 'Plain text',
  extensions: ['txt'],
  utis: ['public.plain-text'],
  async parse(bytes) {
    return { blocks: blocksFromText(decodeText(bytes)) };
  },
};

export const markdownImporter: Importer = {
  id: 'markdown',
  label: 'Markdown',
  extensions: ['md', 'markdown'],
  utis: ['net.daringfireball.markdown'],
  async parse(bytes) {
    const blocks: Block[] = [];
    let title: string | undefined;
    for (const chunk of decodeText(bytes).split(/\n{2,}/)) {
      const text = chunk.trim();
      if (!text) continue;
      const heading = /^(#{1,6})\s+(.*)$/.exec(text);
      if (heading) {
        const level = heading[1].length;
        const label = heading[2].trim();
        if (level === 1 && !title) title = label;
        blocks.push({ text: label, heading: level });
      } else {
        blocks.push({ text: text.replace(/^>\s?/gm, '') });
      }
    }
    return { blocks, title };
  },
};
