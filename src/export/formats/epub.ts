import { strToU8, zipSync } from 'fflate';
import { escapeHtml } from '../../text/escape';
import { bodyWithoutTitle, chapterBodies, safeFileName, type Exporter } from '../types';

/**
 * EPUB 3 with an EPUB 2 fallback table of contents, because e-readers still
 * split on which one they read. The `mimetype` entry must be first and stored
 * uncompressed or nothing will open the file.
 */
export const epubExporter: Exporter = {
  id: 'epub',
  extension: 'epub',
  mimeType: 'application/epub+zip',
  keeps: { chapters: true, annotations: false, styling: true },
  roundTrip: true,
  async build(input) {
    const chapters = chapterBodies(input);
    const uid = `urn:uuid:${input.book.id}`;
    const documents = chapters.map((chapter, index) => ({
      href: `ch${index + 1}.xhtml`,
      title: chapter.title,
      xhtml: page(chapter.title, bodyWithoutTitle(chapter), input.book.language),
    }));

    const files: Record<string, [Uint8Array, { level: 0 | 6 }]> = {
      mimetype: [strToU8('application/epub+zip'), { level: 0 }],
      'META-INF/container.xml': [strToU8(CONTAINER), { level: 6 }],
      'OEBPS/style.css': [strToU8(CSS), { level: 6 }],
      'OEBPS/content.opf': [
        strToU8(opf(input.book.title, input.book.author, input.book.language, uid, documents)),
        { level: 6 },
      ],
      'OEBPS/nav.xhtml': [strToU8(nav(documents, input.book.language)), { level: 6 }],
      'OEBPS/toc.ncx': [strToU8(ncx(input.book.title, uid, documents)), { level: 6 }],
    };
    for (const document of documents) {
      files[`OEBPS/${document.href}`] = [strToU8(document.xhtml), { level: 6 }];
    }

    return {
      fileName: `${safeFileName(input.book.title)}.epub`,
      mimeType: 'application/epub+zip',
      body: zipSync(files),
    };
  },
};

type Doc = { href: string; title: string };

function page(title: string, paragraphs: string[], language: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${language}">
<head><title>${escapeHtml(title)}</title><link rel="stylesheet" href="style.css" /></head>
<body><h2>${escapeHtml(title)}</h2>
${paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('\n')}
</body></html>`;
}

function opf(title: string, author: string | null, language: string, uid: string, docs: Doc[]) {
  const items = docs
    .map((doc, index) => `<item id="c${index + 1}" href="${doc.href}" media-type="application/xhtml+xml"/>`)
    .join('\n');
  const spine = docs.map((_, index) => `<itemref idref="c${index + 1}"/>`).join('');
  return `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="uid">${uid}</dc:identifier>
<dc:title>${escapeHtml(title)}</dc:title>
<dc:language>${language}</dc:language>
${author ? `<dc:creator>${escapeHtml(author)}</dc:creator>` : ''}
<meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</meta>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
<item id="css" href="style.css" media-type="text/css"/>
${items}
</manifest>
<spine toc="ncx">${spine}</spine>
</package>`;
}

function nav(docs: Doc[], language: string) {
  return `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${language}">
<head><title>Contents</title></head><body>
<nav epub:type="toc"><ol>
${docs.map((doc) => `<li><a href="${doc.href}">${escapeHtml(doc.title)}</a></li>`).join('\n')}
</ol></nav></body></html>`;
}

function ncx(title: string, uid: string, docs: Doc[]) {
  return `<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<head><meta name="dtb:uid" content="${uid}"/></head>
<docTitle><text>${escapeHtml(title)}</text></docTitle>
<navMap>
${docs
  .map(
    (doc, index) =>
      `<navPoint id="n${index + 1}" playOrder="${index + 1}"><navLabel><text>${escapeHtml(
        doc.title
      )}</text></navLabel><content src="${doc.href}"/></navPoint>`
  )
  .join('\n')}
</navMap></ncx>`;
}

const CONTAINER = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;

const CSS = `body { line-height: 1.7; margin: 1em; }
h2 { margin: 2em 0 1em; font-size: 1.2em; }
p { margin: 0 0 0.9em; text-indent: 0; }`;
