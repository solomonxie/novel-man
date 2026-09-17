import { safeFileName, type ExportInput, type Exporter } from '../types';

/** Notes leave as notes: the quote, what you wrote, and where it was. */
export const annotationsMarkdownExporter: Exporter = {
  id: 'notes-md',
  extension: 'md',
  mimeType: 'text/markdown',
  keeps: { chapters: true, annotations: true, styling: false },
  roundTrip: false,
  async build(input) {
    const lines = [`# ${input.book.title} — notes`];
    let lastChapter = '';
    for (const row of rows(input)) {
      if (row.chapter !== lastChapter) {
        lines.push(`\n## ${row.chapter}`);
        lastChapter = row.chapter;
      }
      lines.push(`\n> ${row.quote}`);
      if (row.note) lines.push(`\n${row.note}`);
    }
    return {
      fileName: `${safeFileName(input.book.title)}-notes.md`,
      mimeType: 'text/markdown',
      body: `${lines.join('\n')}\n`,
    };
  },
};

export const annotationsCsvExporter: Exporter = {
  id: 'notes-csv',
  extension: 'csv',
  mimeType: 'text/csv',
  keeps: { chapters: true, annotations: true, styling: false },
  roundTrip: false,
  async build(input) {
    const header = ['chapter', 'kind', 'color', 'start', 'end', 'quote', 'note', 'created'];
    const body = rows(input).map((row) =>
      [row.chapter, row.kind, row.color ?? '', row.start, row.end, row.quote, row.note ?? '', row.created]
        .map(csvCell)
        .join(',')
    );
    return {
      fileName: `${safeFileName(input.book.title)}-notes.csv`,
      mimeType: 'text/csv',
      body: `${[header.join(','), ...body].join('\n')}\n`,
    };
  },
};

function rows(input: ExportInput) {
  return [...input.annotations]
    .sort((a, b) => a.start - b.start)
    .map((annotation) => {
      const chapter = input.chapters.find(
        (entry) => annotation.start >= entry.start && annotation.start < entry.end
      );
      return {
        chapter: chapter ? chapter.title.trim() || `${chapter.idx + 1}` : '—',
        kind: annotation.kind,
        color: annotation.color,
        start: annotation.start,
        end: annotation.end,
        quote: annotation.quote,
        note: annotation.note,
        created: new Date(annotation.created_at).toISOString(),
      };
    });
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
