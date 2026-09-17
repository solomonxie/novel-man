import { bodyWithoutTitle, chapterBodies, safeFileName, type Exporter } from '../types';

/** Plain text keeps the words and the chapter breaks, and nothing else. */
export const txtExporter: Exporter = {
  id: 'txt',
  extension: 'txt',
  mimeType: 'text/plain',
  keeps: { chapters: true, annotations: false, styling: false },
  roundTrip: true,
  async build(input) {
    const header = [input.book.title, input.book.author].filter(Boolean).join('\n');
    const body = chapterBodies(input)
      .map((chapter) => [chapter.title, ...bodyWithoutTitle(chapter)].join('\n\n'))
      .join('\n\n\n');
    return {
      fileName: `${safeFileName(input.book.title)}.txt`,
      mimeType: 'text/plain',
      body: `${header}\n\n\n${body}\n`,
    };
  },
};

export const markdownExporter: Exporter = {
  id: 'md',
  extension: 'md',
  mimeType: 'text/markdown',
  keeps: { chapters: true, annotations: false, styling: false },
  roundTrip: true,
  async build(input) {
    const lines = [`# ${input.book.title}`];
    if (input.book.author) lines.push(`*${input.book.author}*`);
    for (const chapter of chapterBodies(input)) {
      lines.push(`\n## ${chapter.title}\n`, ...bodyWithoutTitle(chapter));
    }
    return {
      fileName: `${safeFileName(input.book.title)}.md`,
      mimeType: 'text/markdown',
      body: `${lines.join('\n\n')}\n`,
    };
  },
};
