import { zipSync } from 'fflate';
import { appearances, timelineFor } from '../../cast/mentions';
import { safeFileName, type ExportInput, type Exporter } from '../types';
import { pack, paragraph } from './ooxml';

type Section = { heading: string; lines: string[] };

/** What a writers' room actually asks for: who, what they look like, when. */
function sections(input: ExportInput): Section[] {
  const cast = input.cast;
  if (!cast) return [];
  const chapterName = (idx: number) => {
    const chapter = input.chapters.find((entry) => entry.idx === idx);
    return chapter?.title.trim() || `${idx + 1}`;
  };

  return cast.entities
    .filter((entity) => entity.kind === 'character')
    .map((entity) => {
      const timeline = timelineFor(cast.mentions, entity.id);
      const span = appearances(timeline);
      const lines: string[] = [];
      if (entity.alias) lines.push(`Also called: ${entity.alias}`);
      if (entity.role) lines.push(`Role: ${entity.role}`);
      if (span) {
        lines.push(`First seen: ${chapterName(span.first)}`, `Last seen: ${chapterName(span.last)}`);
        lines.push(`Chapters: ${timeline.length} of ${input.chapters.length}`);
      }
      if (entity.appearance) lines.push(`Appearance: ${entity.appearance}`);
      if (entity.voice) lines.push(`Voice: ${entity.voice}`);
      if (entity.arc) lines.push(`Arc: ${entity.arc}`);
      if (entity.summary) lines.push(entity.summary);
      for (const relation of cast.relations) {
        if (relation.from_id !== entity.id && relation.to_id !== entity.id) continue;
        const otherId = relation.from_id === entity.id ? relation.to_id : relation.from_id;
        const other = cast.entities.find((candidate) => candidate.id === otherId);
        if (other) lines.push(`↔ ${other.name}: ${relation.label}`);
      }
      return { heading: entity.name, lines };
    });
}

export const bibleMarkdownExporter: Exporter = {
  id: 'bible-md',
  extension: 'md',
  mimeType: 'text/markdown',
  keeps: { chapters: true, annotations: false, styling: false },
  roundTrip: false,
  async build(input) {
    const body = sections(input)
      .map((section) => `## ${section.heading}\n\n${section.lines.join('\n\n')}`)
      .join('\n\n');
    return {
      fileName: `${safeFileName(input.book.title)}-cast.md`,
      mimeType: 'text/markdown',
      body: `# ${input.book.title} — cast\n\n${body}\n`,
    };
  },
};

export const bibleDocxExporter: Exporter = {
  id: 'bible-docx',
  extension: 'docx',
  mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  keeps: { chapters: true, annotations: false, styling: true },
  roundTrip: false,
  async build(input) {
    const body = [paragraph(`${input.book.title} — cast`, 'Title')];
    for (const section of sections(input)) {
      body.push(paragraph(section.heading, 'Heading1'));
      for (const line of section.lines) body.push(paragraph(line));
    }
    return {
      fileName: `${safeFileName(input.book.title)}-cast.docx`,
      mimeType: bibleDocxExporter.mimeType,
      body: zipSync(pack(body.join(''))),
    };
  },
};
