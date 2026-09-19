import * as Print from '../print';
import { parseFields } from '../../db/repo';
import { safeFileName, type ExportInput, type Exporter } from '../types';
import { toHtml, toMarkdown, type Section } from './sections';

/** The profile as it reads on screen, in the order the page shows it. */
function sections(input: ExportInput): Section[] {
  const profile = input.profile;
  if (!profile) return [];
  const { entity, observations, relations } = profile;
  const chapterName = (idx: number) =>
    input.chapters.find((entry) => entry.idx === idx)?.title.trim() || `${idx + 1}`;

  const facts = [
    entity.alias && `Also called: ${entity.alias}`,
    entity.role && `Role: ${entity.role}`,
    entity.age && `Age: ${entity.age}`,
    entity.gender && `Gender: ${entity.gender}`,
    ...parseFields(entity.fields).map((field) => `${field.label}: ${field.value}`),
  ].filter(Boolean) as string[];

  return [
    { heading: 'Summary', lines: entity.summary ? [entity.summary] : [] },
    { heading: 'Facts', lines: facts },
    { heading: 'Appearance', lines: entity.appearance ? [entity.appearance] : [] },
    { heading: 'Voice', lines: entity.voice ? [entity.voice] : [] },
    { heading: 'Arc', lines: entity.arc ? [entity.arc] : [] },
    {
      heading: 'Relationships',
      lines: relations.map((relation) =>
        [relation.other_name, relation.label].filter(Boolean).join(' — ')
      ),
    },
    {
      heading: 'Chapter by chapter',
      lines: observations.map((row) => {
        const said = [row.appearance, row.voice, row.note].filter(Boolean).join(' · ');
        return `${chapterName(row.chapter_idx)}: ${said}`;
      }),
    },
  ];
}

function nameOf(input: ExportInput): string {
  return safeFileName(input.profile?.entity.name || 'profile');
}

export const profileMarkdownExporter: Exporter = {
  id: 'profile-md',
  extension: 'md',
  mimeType: 'text/markdown',
  keeps: { chapters: false, annotations: false, styling: false },
  roundTrip: false,
  async build(input) {
    return {
      fileName: `${nameOf(input)}.md`,
      mimeType: 'text/markdown',
      body: toMarkdown(input.profile?.entity.name ?? '', sections(input)),
    };
  },
};

export const profilePdfExporter: Exporter = {
  id: 'profile-pdf',
  extension: 'pdf',
  mimeType: 'application/pdf',
  keeps: { chapters: false, annotations: false, styling: true },
  roundTrip: false,
  async build(input) {
    const { uri } = await Print.printToFileAsync({
      html: toHtml(input.profile?.entity.name ?? '', sections(input)),
      base64: false,
    });
    return { fileName: `${nameOf(input)}.pdf`, mimeType: 'application/pdf', uri };
  },
};
