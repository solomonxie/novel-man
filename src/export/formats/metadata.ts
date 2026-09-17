import * as Print from 'expo-print';
import { safeFileName, type ExportInput, type Exporter } from '../types';
import { toHtml, toMarkdown, type Section } from './sections';

/**
 * Everything the book turned out to be, without the book: the chapter list and
 * its briefs, who is in it, where it goes, what was marked. Small enough to
 * mail to someone who is not going to read 300,000 words.
 */
function sections(input: ExportInput): Section[] {
  const chapterName = (idx: number) =>
    input.chapters.find((entry) => entry.idx === idx)?.title.trim() || `${idx + 1}`;
  // Annotations are anchored to the text, not to a chapter, so the chapter is
  // whichever one the offset falls inside.
  const chapterAt = (offset: number) =>
    input.chapters.find((entry) => offset >= entry.start && offset < entry.end)?.idx ?? 0;
  const entities = input.cast?.entities ?? [];
  const scenes = input.scenes ?? [];

  const scenesByChapter = new Map<string, typeof scenes>();
  for (const scene of scenes) {
    const list = scenesByChapter.get(scene.chapter_id) ?? [];
    list.push(scene);
    scenesByChapter.set(scene.chapter_id, list);
  }

  const chapterLines = input.chapters.flatMap((chapter, index) => {
    const head = `${index + 1}. ${chapter.title.trim() || '—'}`;
    const lines = [chapter.brief?.trim() ? `${head}\n${chapter.brief.trim()}` : head];
    for (const scene of scenesByChapter.get(chapter.id) ?? []) {
      const label = scene.title?.trim() || `Scene ${scene.idx + 1}`;
      lines.push(`    ${label}${scene.summary?.trim() ? ` — ${scene.summary.trim()}` : ''}`);
    }
    return lines;
  });

  const describe = (kind: 'character' | 'place') =>
    entities
      .filter((entity) => entity.kind === kind)
      .map((entity) =>
        [
          entity.name,
          entity.alias && `(${entity.alias})`,
          entity.role && `— ${entity.role}`,
          entity.summary && `\n${entity.summary}`,
        ]
          .filter(Boolean)
          .join(' ')
      );

  return [
    { heading: 'About', lines: [input.book.summary, input.book.author].filter(Boolean) as string[] },
    { heading: 'Chapters', lines: chapterLines },
    { heading: 'Characters', lines: describe('character') },
    { heading: 'Places', lines: describe('place') },
    {
      heading: 'Notes and highlights',
      lines: input.annotations.map((note) =>
        [chapterName(chapterAt(note.start)), note.quote.trim(), note.note?.trim()]
          .filter(Boolean)
          .join(' · ')
      ),
    },
  ];
}

export const metadataMarkdownExporter: Exporter = {
  id: 'metadata-md',
  extension: 'md',
  mimeType: 'text/markdown',
  keeps: { chapters: true, annotations: true, styling: false },
  roundTrip: false,
  async build(input) {
    return {
      fileName: `${safeFileName(input.book.title)}-notes.md`,
      mimeType: 'text/markdown',
      body: toMarkdown(input.book.title, sections(input)),
    };
  },
};

export const metadataPdfExporter: Exporter = {
  id: 'metadata-pdf',
  extension: 'pdf',
  mimeType: 'application/pdf',
  keeps: { chapters: true, annotations: true, styling: true },
  roundTrip: false,
  async build(input) {
    const { uri } = await Print.printToFileAsync({
      html: toHtml(input.book.title, sections(input)),
      base64: false,
    });
    return {
      fileName: `${safeFileName(input.book.title)}-notes.pdf`,
      mimeType: 'application/pdf',
      uri,
    };
  },
};
