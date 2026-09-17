import { escapeHtml } from '../../text/escape';

/** A heading and the lines under it — enough shape for a profile or an index. */
export type Section = { heading: string; lines: string[] };

export function toMarkdown(title: string, sections: Section[]): string {
  const body = sections
    .filter((section) => section.lines.length)
    .map((section) => `## ${section.heading}\n\n${section.lines.join('\n\n')}`)
    .join('\n\n');
  return `# ${title}\n\n${body}\n`;
}

/**
 * Printed rather than styled: this goes through the platform's print pipeline
 * to become a PDF, so it wants readable defaults and nothing that depends on a
 * stylesheet arriving.
 */
export function toHtml(title: string, sections: Section[]): string {
  const body = sections
    .filter((section) => section.lines.length)
    .map(
      (section) =>
        `<h2>${escapeHtml(section.heading)}</h2>` +
        section.lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('')
    )
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  body { font: 15px/1.6 -apple-system, "PingFang SC", "Noto Sans CJK SC", sans-serif;
         margin: 40px; color: #111; }
  h1 { font-size: 26px; margin: 0 0 24px; }
  h2 { font-size: 15px; text-transform: uppercase; letter-spacing: .06em;
       color: #666; margin: 28px 0 8px; }
  p { margin: 0 0 8px; }
</style></head><body><h1>${escapeHtml(title)}</h1>${body}</body></html>`;
}
