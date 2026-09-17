import { labelFor } from '../../translate/languages';
import { safeFileName, type ExportInput, type Exporter } from '../types';

type Line = { chapterIdx: number; source: string; target: string };

/** The author's edit is the translation; the machine output is only a draft. */
function lines(input: ExportInput): Line[] {
  const units = input.translation?.units ?? [];
  return units
    .slice()
    .sort((a, b) => a.start - b.start)
    .map((unit) => ({
      chapterIdx: unit.chapter_idx,
      source: unit.source,
      target: (unit.edited ?? unit.machine ?? '').trim(),
    }));
}

function chapterTitle(input: ExportInput, idx: number): string {
  const chapter = input.chapters.find((entry) => entry.idx === idx);
  return chapter?.title.trim() || `${idx + 1}`;
}

function render(input: ExportInput, bilingual: boolean): string {
  const target = input.translation?.target ?? '';
  const out = [`# ${input.book.title} — ${labelFor(target)}`];
  let chapter = -1;
  for (const line of lines(input)) {
    if (line.chapterIdx !== chapter) {
      chapter = line.chapterIdx;
      out.push(`\n## ${chapterTitle(input, chapter)}\n`);
    }
    if (bilingual) out.push(`${line.source}\n\n> ${line.target || '—'}`);
    else if (line.target) out.push(line.target);
  }
  return `${out.join('\n\n')}\n`;
}

export const translatedExporter: Exporter = {
  id: 'translated-md',
  extension: 'md',
  mimeType: 'text/markdown',
  keeps: { chapters: true, annotations: false, styling: false },
  roundTrip: false,
  async build(input) {
    return {
      fileName: `${safeFileName(input.book.title)}-${input.translation?.target ?? 'translated'}.md`,
      mimeType: 'text/markdown',
      body: render(input, false),
    };
  },
};

export const bilingualExporter: Exporter = {
  id: 'bilingual-md',
  extension: 'md',
  mimeType: 'text/markdown',
  keeps: { chapters: true, annotations: false, styling: false },
  roundTrip: false,
  async build(input) {
    return {
      fileName: `${safeFileName(input.book.title)}-bilingual.md`,
      mimeType: 'text/markdown',
      body: render(input, true),
    };
  },
};
