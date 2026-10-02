import { zipSync, strToU8 } from 'fflate';

/**
 * An EPUB, written so the app's own importer reads it.
 *
 * EPUB rather than Markdown because `src/import/formats/epub.ts` already does
 * the half of this that is hard on a phone: it unzips, finds every `<img>`,
 * writes the bytes through `saveImage` and leaves an image marker in the text.
 * A Markdown file cannot carry a picture at all — it would have to name one,
 * and nothing would have put it where the name points.
 *
 * One XHTML per chapter, because the importer marks the first block of each
 * spine item as a boundary. That is the chapter split, for free and exactly
 * where the book's own outline says it should be.
 */

const escape = (text) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const CONTAINER = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`;

function chapterXhtml(chapter) {
  const body = chapter.blocks
    .map((block) => {
      if (block.image) {
        return `<figure><img src="${escape(block.image)}" alt="${escape(block.alt ?? '')}"/></figure>`;
      }
      // `epub:type="pagebreak"` is the standard way to say a page of the
      // printed book began here. Every other reader ignores it; this one turns
      // it into the page number under the words and the way to the original.
      if (block.heading) return `<h${block.heading}>${escape(block.text)}</h${block.heading}>`;
      if (block.code) return `<pre>${escape(block.text)}</pre>`;
      return `<p>${escape(block.text)}</p>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>${escape(chapter.title)}</title></head>
<body>
<h1>${escape(chapter.title)}</h1>
${body}
</body>
</html>
`;
}

export function buildEpub({ title, author, chapters, images }) {
  const files = {};
  // Not compressed and written first, which is what the specification asks of
  // it. Nothing here reads it, but a file claiming to be an EPUB should be one.
  files['mimetype'] = strToU8('application/epub+zip');
  files['META-INF/container.xml'] = strToU8(CONTAINER);

  const manifest = [];
  const spine = [];
  chapters.forEach((chapter, at) => {
    const name = `ch${String(at + 1).padStart(3, '0')}.xhtml`;
    files[`OEBPS/${name}`] = strToU8(chapterXhtml(chapter));
    manifest.push(`<item id="c${at}" href="${name}" media-type="application/xhtml+xml"/>`);
    spine.push(`<itemref idref="c${at}"/>`);
  });
  for (const [name, bytes] of images) {
    files[`OEBPS/${name}`] = bytes;
    const type = name.endsWith('.png') ? 'png' : name.endsWith('.jpg') ? 'jpeg' : 'webp';
    manifest.push(
      `<item id="${name.replace(/[^\w]/g, '_')}" href="${name}" media-type="image/${type}"/>`
    );
  }

  files['OEBPS/content.opf'] = strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="id">novel-man-${Date.now()}</dc:identifier>
    <dc:title>${escape(title)}</dc:title>
    ${author ? `<dc:creator>${escape(author)}</dc:creator>` : ''}
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
${manifest.map((line) => `    ${line}`).join('\n')}
  </manifest>
  <spine>
${spine.map((line) => `    ${line}`).join('\n')}
  </spine>
</package>
`);

  return zipSync(files, { level: 6 });
}

