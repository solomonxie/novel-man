// Runs the real parsers against fixture files outside the app, where failures
// are legible. Node only -- it cannot catch Hermes-specific slowness.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const build = process.env.BUILD_DIR ?? join(here, '..', '.parse-check');

const { docxImporter } = await import(join(build, 'import/formats/docx.js'));
const { epubImporter } = await import(join(build, 'import/formats/epub.js'));
const { txtImporter } = await import(join(build, 'import/formats/plain.js'));
const { normalize } = await import(join(build, 'import/normalize.js'));
const { detectChapters } = await import(join(build, 'structure/detect.js'));
const { detectLanguage } = await import(join(build, 'text/language.js'));
const { layoutChapter, annotationAt } = await import(join(build, 'reader/model.js'));

let failures = 0;

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${label}${ok ? '' : ` — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`);
}

async function parse(importer, name) {
  const bytes = new Uint8Array(readFileSync(join(here, 'fixtures', name)));
  const started = Date.now();
  const parsed = await importer.parse(bytes, name);
  const doc = normalize(parsed.blocks);
  const { language } = detectLanguage(doc.text);
  const detection = detectChapters(doc, language);
  return { parsed, doc, language, detection, ms: Date.now() - started };
}

console.log('docx');
{
  const { parsed, doc, detection, ms } = await parse(docxImporter, 'sample.docx');
  check('title comes from core.xml', parsed.title, 'The Second Step');
  check('author', parsed.author, 'A. Writer');
  check('chapters found by heading style', detection.chapters.length, 3);
  check('the Title style is not a chapter', detection.chapters[0].title, 'Crossing');
  check('&amp; is decoded', doc.text.includes('expected & louder'), true);

  const paragraphs = layoutChapter(doc.text, { ...detection.chapters[0], id: 'c', idx: 0 }, 'en');
  const sentences = paragraphs.flatMap((p) => p.sentences);
  check('heading is its own paragraph', doc.text.slice(sentences[0].start, sentences[0].end), 'Crossing');
  check('"Mr. Hale" does not end a sentence',
    sentences.some((s) => doc.text.slice(s.start, s.end) === 'Mr. Hale had warned her about the ford.'), true);
  check('no span keeps trailing whitespace',
    sentences.every((s) => !/\s$/.test(doc.text.slice(s.start, s.end))), true);

  const target = sentences[2];
  const annotations = [{ start: target.start, end: target.end }];
  const redetected = detectChapters(doc, 'en').chapters[0];
  check('an offset-anchored highlight survives re-detection',
    layoutChapter(doc.text, { ...redetected, id: 'c', idx: 0 }, 'en')
      .flatMap((p) => p.sentences).some((s) => !!annotationAt(annotations, s)), true);
  console.log(`  (${ms}ms)`);
}

console.log('epub');
{
  const { parsed, detection, ms } = await parse(epubImporter, 'sample.epub');
  check('title from the OPF', parsed.title, 'Ash Lane');
  check('chapters from spine order', detection.chapters.length, 3);
  check('relative ../ hrefs resolve', detection.chapters[2].title, 'Three: What the River Kept');
  console.log(`  (${ms}ms)`);
}

console.log('txt, Chinese');
{
  const { language, detection, ms } = await parse(txtImporter, 'sample-zh.txt');
  check('language detected', language, 'zh');
  check('序章 is kept as a chapter', detection.chapters[0].title, '序章');
  check('第N章 pattern found the rest', detection.chapters.length, 4);
  console.log(`  (${ms}ms)`);
}

console.log(failures ? `\n${failures} failing` : '\nall passing');
process.exit(failures ? 1 : 0);
