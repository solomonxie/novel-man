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
const { detectScenes, scenesFromBreaks } = await import(join(build, 'structure/scenes.js'));
const { reanchor } = await import(join(build, 'reader/anchor.js'));
const { txtExporter, markdownExporter } = await import(join(build, 'export/formats/text.js'));
const { docxExporter } = await import(join(build, 'export/formats/docx.js'));
const { epubExporter } = await import(join(build, 'export/formats/epub.js'));
const { parseNumbered, AlignmentError } = await import(join(build, 'translate/context.js'));
const { candidateTerms, termsIn } = await import(join(build, 'translate/terms.js'));
const { diffWords } = await import(join(build, 'translate/diff.js'));
const { countMentions } = await import(join(build, 'cast/mentions.js'));
const { layoutGraph, withinRange } = await import(join(build, 'cast/graph.js'));
const { sha256Hex, hmacSha256, utf8, hex } = await import(join(build, 'cloud/sha256.js'));
const { signRequest, parseUrl } = await import(join(build, 'cloud/sign.js'));
const { parseListing, extractMessage } = await import(join(build, 'cloud/client.js'));
const { parsePasted, regionFromEndpoint } = await import(join(build, 'cloud/providers.js'));
const { rewrite, nameFor, looksLikeSignIn } = await import(join(build, 'import/sources/links.js'));
const { fountainExporter, finalDraftExporter } = await import(join(build, 'export/formats/screenplay.js'));

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

console.log('scenes');
{
  const { doc, detection } = await parse(txtImporter, 'sample-zh.txt');
  const scenes = detection.chapters.flatMap((chapter) => detectScenes(doc, chapter));
  check('an unmarked chapter has no scenes, not one',
    detection.chapters.every((c) => detectScenes(doc, c).length !== 1), true);
  check('scenes stay inside their chapter',
    scenes.every((scene) => detection.chapters.some((c) => scene.start >= c.start && scene.end <= c.end)), true);

  const marked = normalize([
    { text: 'She crossed the ford.' },
    { text: '* * *' },
    { text: 'Years later, in another country.' },
    { text: '※' },
    { text: 'The ford was gone.' },
  ]);
  const split = detectScenes(marked, { start: 0, end: marked.text.length });
  check('a separator glyph starts a new scene', split.length, 3);
  check('the separator itself is not part of a scene',
    split.every((scene) => !marked.text.slice(scene.start, scene.end).trim().startsWith('*')), true);
  check('scenes tile the chapter with no gaps',
    split.map((scene) => scene.start), [0, marked.text.indexOf('Years later'), marked.text.indexOf('The ford was gone')]);

  check('two breaks make three scenes',
    scenesFromBreaks({ start: 0, end: 100 }, [30, 60]).length, 3);
  check('no breaks make no scenes', scenesFromBreaks({ start: 0, end: 100 }, []).length, 0);
  check('a break outside the chapter is ignored',
    scenesFromBreaks({ start: 0, end: 100 }, [200]).length, 0);
}

console.log('re-anchoring');
{
  const { doc } = await parse(txtImporter, 'sample-zh.txt');
  const start = doc.text.indexOf('，') - 6;
  const quote = doc.text.slice(start, start + 12);
  const moved = `${'x'.repeat(50)}\n\n${doc.text}`;
  const found = reanchor(moved, {
    start, end: start + quote.length, quote,
    prefix: doc.text.slice(Math.max(0, start - 40), start),
    suffix: doc.text.slice(start + quote.length, start + quote.length + 40),
  });
  check('a shifted highlight is found again', moved.slice(found.start, found.end), quote);
  check('an unknown quote is reported, not guessed',
    reanchor(doc.text, { start: 0, end: 5, quote: 'ZZZ-not-here', prefix: '', suffix: '' }), null);
}

console.log('export round trip');
{
  const { doc, detection } = await parse(docxImporter, 'sample.docx');
  const input = {
    book: { id: 'b1', title: 'The Second Step', author: 'A. Writer', language: 'en' },
    text: doc.text,
    chapters: detection.chapters.map((chapter, idx) => ({ ...chapter, id: `c${idx}`, idx, confident: 1, user_edited: 0 })),
    annotations: [],
  };

  const txt = await txtExporter.build(input);
  check('txt keeps every chapter title',
    detection.chapters.every((chapter) => txt.body.includes(chapter.title)), true);

  const md = await markdownExporter.build(input);
  check('markdown heads each chapter with ##',
    (md.body.match(/^## /gm) ?? []).length, detection.chapters.length);

  const docx = await docxExporter.build(input);
  const reparsed = await docxImporter.parse(docx.body, docx.fileName);
  const roundTripped = detectChapters(normalize(reparsed.blocks), 'en');
  check('a docx export imports back with the same chapters',
    roundTripped.chapters.map((chapter) => chapter.title),
    detection.chapters.map((chapter) => chapter.title));

  const epub = await epubExporter.build(input);
  const reparsedEpub = await epubImporter.parse(epub.body, epub.fileName);
  const epubChapters = detectChapters(normalize(reparsedEpub.blocks), 'en');
  check('an epub export imports back with the same chapters',
    epubChapters.chapters.map((chapter) => chapter.title),
    detection.chapters.map((chapter) => chapter.title));
}

console.log('translation alignment');
{
  const answer = '1. First line\n2. Second line\n   continued\n3. Third';
  const aligned = parseNumbered(answer, 3);
  check('numbered lines come back in order', aligned.map((line) => line.index), [1, 2, 3]);
  check('a wrapped line joins the one above', aligned[1].text, 'Second line continued');

  let threw = null;
  try { parseNumbered('1. Only one', 2); } catch (error) { threw = error; }
  check('a short answer is rejected, not padded', threw instanceof AlignmentError, true);
}

console.log('glossary');
{
  const text = 'Mira crossed the ford. Mira waited. Mira never spoke of Ashfall again. Ashfall burned. Ashfall was gone.';
  const terms = candidateTerms(text, 'en', [], []);
  check('a repeated proper noun is a candidate',
    terms.some((term) => term.source === 'Ashfall'), true);
  check('a candidate carries its count',
    terms.find((term) => term.source === 'Ashfall')?.count, 3);
  check('an existing term is not suggested again',
    candidateTerms(text, 'en', [{ source: 'Ashfall', translation: '灰落' }], [])
      .some((term) => term.source === 'Ashfall'), false);
  check('only terms present in the text are sent',
    termsIn('Mira waited.', [
      { source: 'Mira', translation: '米拉' },
      { source: 'Ashfall', translation: '灰落' },
    ]).map((term) => term.source), ['Mira']);
}

console.log('post-edit diff');
{
  const pieces = diffWords('She crossed the ford.', 'She crossed the river.');
  check('the changed word is marked both ways',
    [pieces.some((p) => p.change === 'removed' && p.text.includes('ford')),
     pieces.some((p) => p.change === 'added' && p.text.includes('river'))], [true, true]);
  check('unchanged words stay unchanged',
    pieces.filter((p) => p.change === 'same').map((p) => p.text).join('').includes('She crossed'), true);
}

console.log('cast');
{
  const { doc, detection } = await parse(docxImporter, 'sample.docx');
  const chapters = detection.chapters.map((chapter, idx) => ({ ...chapter, id: `c${idx}`, idx }));
  const entities = [{ id: 'e1', name: 'Hale', alias: null, kind: 'character' }];
  const mentions = countMentions(doc.text, chapters, entities);
  check('a name is counted where it occurs', mentions.length > 0, true);
  check('every mention names a real chapter',
    mentions.every((m) => chapters.some((c) => c.idx === m.chapter_idx)), true);

  const people = [
    { id: 'a', name: 'A', kind: 'character' },
    { id: 'b', name: 'B', kind: 'character' },
    { id: 'c', name: 'C', kind: 'character' },
  ];
  const relations = [
    { id: 'r1', from_id: 'a', to_id: 'b', label: 'sisters', first_chapter: 0, last_chapter: 2 },
  ];
  const graph = layoutGraph(people, relations, 300);
  check('only connected characters are placed', graph.nodes.map((n) => n.id), ['a', 'b']);
  check('an edge joins two placed nodes', graph.edges.length, 1);
  check('a relation outside the range is filtered', withinRange(relations[0], 5, 9), false);
  check('a relation inside the range is kept', withinRange(relations[0], 1, 9), true);
}

console.log('signing');
{
  check('sha256 of "abc"', sha256Hex('abc'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  check('sha256 of the empty string', sha256Hex(''),
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  check('sha256 of a 64-byte block boundary', sha256Hex('a'.repeat(64)),
    'ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb');
  check('hmac-sha256 reference vector',
    hex(hmacSha256(utf8('key'), utf8('The quick brown fox jumps over the lazy dog'))),
    'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8');

  // The AWS sigv4 test suite's "get-vanilla" case.
  const signed = signRequest({
    method: 'GET',
    url: 'https://example.amazonaws.com/',
    credentials: {
      accessKeyId: 'AKIDEXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
      region: 'us-east-1',
      service: 'service',
    },
    payloadHash: sha256Hex(''),
    now: new Date(Date.UTC(2015, 7, 30, 12, 36, 0)),
  });
  check('sigv4 signs the published test vector',
    /Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31/.test(
      signed.headers.Authorization), true);

  const parsed = parseUrl('https://bucket.example.com/a%20b/c?prefix=books/&max-keys=5');
  check('url host', parsed.host, 'bucket.example.com');
  check('path segments stay encoded', parsed.path, '/a%20b/c');
  check('query is canonical and sorted', parsed.query, 'max-keys=5&prefix=books%2F');
}

console.log('bucket');
{
  const xml = `<?xml version="1.0"?><ListBucketResult>
    <Contents><Key>novel-man/library.nmbak</Key><Size>4096</Size>
      <LastModified>2026-01-02T03:04:05.000Z</LastModified></Contents>
    <Contents><Key>novel-man/books/abc.nmbak</Key><Size>512</Size>
      <LastModified>2026-01-02T03:04:06.000Z</LastModified></Contents>
  </ListBucketResult>`;
  const objects = parseListing(xml, 'novel-man');
  check('keys come back without the prefix',
    objects.map((object) => object.key), ['library.nmbak', 'books/abc.nmbak']);
  check('size is a number', objects[0].size, 4096);
  check('modified is parsed', objects[0].modified, Date.parse('2026-01-02T03:04:05.000Z'));
  check("the vendor's own error text is what surfaces",
    extractMessage('<Error><Code>NoSuchBucket</Code><Message>The bucket does not exist</Message></Error>'),
    'NoSuchBucket: The bucket does not exist');

  const pasted = parsePasted([
    'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE',
    'AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    'endpoint_url = https://s3.eu-west-2.amazonaws.com',
    'bucket: my-manuscripts',
  ].join('\n'));
  check('a pasted block fills the key', pasted.accessKeyId, 'AKIAIOSFODNN7EXAMPLE');
  check('a pasted block fills the secret', pasted.secretAccessKey,
    'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY');
  check('a pasted block fills the bucket', pasted.bucket, 'my-manuscripts');
  check('the region is derived from the endpoint', pasted.region, 'eu-west-2');
  check('r2 endpoints use the auto region',
    regionFromEndpoint('https://abc123.r2.cloudflarestorage.com'), 'auto');
}

console.log('links');
{
  check('a Google Doc link becomes a .docx export',
    rewrite('https://docs.google.com/document/d/1AbC_dEf-123/edit?usp=sharing').url,
    'https://docs.google.com/document/d/1AbC_dEf-123/export?format=docx');
  check('an ordinary link is left alone',
    rewrite('https://example.com/book.epub').url, 'https://example.com/book.epub');
  check('a filename comes from the path',
    nameFor('https://example.com/a/book.epub', 'application/epub+zip', null), 'book.epub');
  check('content-disposition wins over the path',
    nameFor('https://example.com/dl?id=9', '', 'attachment; filename="My Novel.docx"'), 'My Novel.docx');
  check('an extensionless url takes one from the mime type',
    nameFor('https://example.com/dl', 'application/pdf', null), 'dl.pdf');

  const loginPage = new TextEncoder().encode('<html><body>Sign in to continue</body></html>');
  check('a login page is not a manuscript', looksLikeSignIn('text/html; charset=utf-8', loginPage), true);
  check('a real document is not a login page',
    looksLikeSignIn('application/epub+zip', new Uint8Array([80, 75, 3, 4])), false);
}

console.log('screenplay');
{
  const input = {
    book: { id: 'b', title: 'Ash Lane', author: 'A. Writer', language: 'en' },
    text: '',
    chapters: [],
    annotations: [],
    script: [
      { id: '1', type: 'scene_heading', text: 'int. kitchen - night' },
      { id: '2', type: 'action', text: 'Mira sets down the kettle.' },
      { id: '3', type: 'character', text: 'mira' },
      { id: '4', type: 'parenthetical', text: 'quietly' },
      { id: '5', type: 'dialogue', text: "It's late." },
      { id: '6', type: 'transition', text: 'cut to:' },
    ],
  };
  const fountain = await fountainExporter.build(input);
  check('a slug line is upper case', fountain.body.includes('INT. KITCHEN - NIGHT'), true);
  check('a character cue is upper case', fountain.body.includes('MIRA'), true);
  check('a parenthetical is wrapped once', fountain.body.includes('(quietly)'), true);
  check('a transition is marked', fountain.body.includes('> CUT TO:'), true);

  const fdx = await finalDraftExporter.build(input);
  check('fdx types each paragraph',
    fdx.body.includes('<Paragraph Type="Scene Heading">') &&
    fdx.body.includes('<Paragraph Type="Dialogue">'), true);
  check('fdx escapes the apostrophe safely', fdx.body.includes("It's late."), true);
}

console.log(failures ? `\n${failures} failing` : '\nall passing');
process.exit(failures ? 1 : 0);
