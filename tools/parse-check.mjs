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
const { imageIn, imageMarker } = await import(join(build, 'reader/images.js'));
const { sentenceAtLine } = await import(join(build, 'reader/lines.js'));
const { runsIn, codeBlockIn } = await import(join(build, 'reader/rich.js'));
const { detectScenes, scenesFromBreaks } = await import(join(build, 'structure/scenes.js'));
const { reanchor } = await import(join(build, 'reader/anchor.js'));
const { txtExporter, markdownExporter } = await import(join(build, 'export/formats/text.js'));
const { docxExporter } = await import(join(build, 'export/formats/docx.js'));
const { epubExporter } = await import(join(build, 'export/formats/epub.js'));
const { parseNumbered, AlignmentError } = await import(join(build, 'translate/context.js'));
const { candidateTerms, termsIn } = await import(join(build, 'translate/terms.js'));
const { diffWords } = await import(join(build, 'translate/diff.js'));
const { countMentions, appearancesIn } = await import(join(build, 'cast/mentions.js'));
const { layoutGraph, withinRange } = await import(join(build, 'cast/graph.js'));
const { sha256Hex, hmacSha256, utf8, hex } = await import(join(build, 'cloud/sha256.js'));
const { signRequest, parseUrl } = await import(join(build, 'cloud/sign.js'));
const { parseListing, extractMessage } = await import(join(build, 'cloud/client.js'));
const { parsePasted, regionFromEndpoint } = await import(join(build, 'cloud/providers.js'));
const { rewrite, nameFor, looksLikeSignIn } = await import(join(build, 'import/sources/links.js'));
const { fountainExporter, finalDraftExporter } = await import(join(build, 'export/formats/screenplay.js'));
const { bundleName, dateOf, isBundleName } = await import(join(build, 'backup/format.js'));
const { parseUsfm, layoutBible, cleanLine } = await import(join(build, 'scripture/usfm.js'));
const { booksFrom, editionFrom, fileNameFor } = await import(join(build, 'sources/gutenberg.js'));
const { chapterMaterial } = await import(join(build, 'analysis/context.js'));
const { blocksFromHtml, bytesFromBase64 } = await import(join(build, 'import/formats/html.js'));
const { papersFrom, queryFor, authorLine, fileNameFor: paperFileName, absolute } =
  await import(join(build, 'sources/arxiv.js'));
const { quoteWithVerses, referenceOf, versesIn } = await import(join(build, 'scripture/reference.js'));
const { escapeLike, looseLike, score } = await import(join(build, 'sources/matching.js'));
const { passageFrom, retryDelay } = await import(join(build, 'sources/esv.js'));
const { parseChapterRef, neighbouringChapters } = await import(join(build, 'scripture/canon.js'));
const { parseCsv, forEachCsvRow } = await import(join(build, 'sources/csv.js'));

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

  // A highlight is made over a passage; the page is drawn a sentence at a time.
  const passage = { start: sentences[2].start, end: sentences[4].end };
  const wide = [{ start: passage.start, end: passage.end }];
  check('every sentence under one highlight is marked',
    [sentences[2], sentences[3], sentences[4]].every((s) => !!annotationAt(wide, s)), true);
  check('a sentence outside it is not',
    !!annotationAt(wide, sentences[5]), false);
  check('the exact mark wins over one merely drawn across it',
    annotationAt([{ start: passage.start, end: passage.end, id: 'wide' },
                  { start: sentences[3].start, end: sentences[3].end, id: 'exact' }],
                 sentences[3]).id, 'exact');
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
  check('a github page becomes the file it was showing',
    rewrite('https://github.com/owner/repo/blob/main/docs/ch01.md'),
    { url: 'https://raw.githubusercontent.com/owner/repo/main/docs/ch01.md', name: 'ch01.md' });
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

console.log('backup names');
{
  const march = new Date(2026, 2, 9, 4, 30);
  check('a bundle is named for its day', bundleName('library', march), 'library-2026-03-09.zip');
  check('every write that day is the same file',
    bundleName('library', new Date(2026, 2, 9, 23, 59)), bundleName('library', march));
  check('a new day is a new file', bundleName('library', new Date(2026, 2, 10)), 'library-2026-03-10.zip');
  check('names sort into date order',
    ['library-2026-03-10.zip', 'library-2026-03-09.zip'].sort(),
    ['library-2026-03-09.zip', 'library-2026-03-10.zip']);
  check('the day reads back off the name', dateOf('library-2026-03-09.zip')?.getDate(), 9);
  check('a bundle named for its month still reads', dateOf('books/202612-abc.zip')?.getFullYear(), 2026);
  check('and still opens', isBundleName('library-2026-03-09-04-30.zip'), true);
  check('13 is not a month', dateOf('202613-library.zip'), null);
  check('nor is a 13th month in a day stamp', dateOf('library-2026-13-09.zip'), null);
}

console.log('usfm');
{
  const john = [
    String.raw`\id JHN 43-JHN-web.sfm World English Bible (WEB)`,
    String.raw`\h John`,
    String.raw`\toc1 The Good News According to John`,
    String.raw`\toc2 John`,
    String.raw`\toc3 Jhn`,
    String.raw`\mt1 John`,
    String.raw`\c 3`,
    String.raw`\s1 Nicodemus`,
    String.raw`\p`,
    String.raw`\v 16 \w For|strong="G1063"\w* God so loved the world,\f + \fr 3:16 \ft or: only begotten\f*`,
    String.raw`\v 17 he gave his Son.\x + \xo 3:17 \xt Rom 5:8\x*`,
    String.raw`\c 4`,
    String.raw`\p`,
    String.raw`\v 1 Therefore.`,
  ].join('\n');
  const book = parseUsfm(john);
  check("the book keeps the edition's own name", book.name, 'John');
  check('every spelling a reference might use', book.names, ['John', 'The Good News According to John', 'Jhn']);
  check('chapters are stated, not detected', book.chapters.map((c) => c.number), [3, 4]);
  check('verses come with them', book.chapters[0].verses.map((v) => v.number), [16, 17]);
  check("a word's dictionary key is not the word", book.chapters[0].verses[0].text, 'For God so loved the world,');
  check('nor is a cross-reference', book.chapters[0].verses[1].text, 'he gave his Son.');
  check('front matter is not a book', parseUsfm(String.raw`\id FRT` + '\n' + String.raw`\p nothing here`), null);

  const laid = layoutBible([book]);
  check('one verse, one block', laid.blocks.length, 3);
  check('a chapter points at the block it starts on', laid.chapters.map((c) => c.block), [0, 2]);
  check('and a verse at its own', laid.verses.map((v) => v.number), [16, 17, 1]);
  check('the part is the bible book', laid.parts[0].name, 'John');
  check('a marker with no content leaves nothing behind', cleanLine(String.raw`\p`), '');

  // Two things the KJV carries that are not its words: Psalm 119's acrostic
  // headings, and the pilcrow it prints where a paragraph begins.
  const psalm = parseUsfm([
    String.raw`\id PSA`,
    String.raw`\h Psalms`,
    String.raw`\c 119`,
    String.raw`\q1`,
    String.raw`\v 8 I will keep thy statutes.`,
    String.raw`\s1 \tl  ב BETH.\tl*`,
    String.raw`\q1`,
    String.raw`\v 9 ¶ Wherewithal shall a young man cleanse his way?`,
  ].join('\n'));
  check('a section heading is not the end of the verse above it',
    psalm.chapters[0].verses[0].text, 'I will keep thy statutes.');
  check('the pilcrow the KJV prints is not a word',
    psalm.chapters[0].verses[1].text, 'Wherewithal shall a young man cleanse his way?');

  // The download reads a chapter's offsets off the block it starts on, by index
  // into what was handed to normalize. Without that index every chapter began
  // at 0 and ran to the end of the bible.
  const placed = normalize(laid.blocks);
  const chapterStarts = laid.chapters.map((chapter) =>
    placed.blocks.find((block) => block.source === chapter.block)?.start);
  check('a chapter starts at its own first verse',
    chapterStarts, [0, placed.text.indexOf('Therefore.')]);
  check('every verse finds its block',
    laid.verses.every((verse) => placed.blocks.some((block) => block.source === verse.block)), true);
}

console.log('markup a book is written in');
{
  check('plain prose is one run', runsIn('She went down anyway.'),
    [{ text: 'She went down anyway.' }]);
  check('bold loses its asterisks', runsIn('a **firm** answer'),
    [{ text: 'a ' }, { text: 'firm', bold: true }, { text: ' answer' }]);
  check('italic too', runsIn('an *aside* here'),
    [{ text: 'an ' }, { text: 'aside', italic: true }, { text: ' here' }]);
  check('code keeps its spacing but not its backticks',
    runsIn('call `npm run check` first').map((run) => run.text),
    ['call ', 'npm run check', ' first']);
  check('and is marked as code', runsIn('`x`')[0].code, true);
  check('a marked phrase is a highlight', runsIn('==this==')[0].mark, true);
  check('struck through', runsIn('~~no~~')[0].strike, true);
  check('an unpaired marker is just a character',
    runsIn('2 * 3 = 6'), [{ text: '2 * 3 = 6' }]);

  check('a fenced block is code', codeBlockIn('```js\nconst a = 1;\n```'), 'const a = 1;');
  check('so is an indented one', codeBlockIn('    const a = 1;\n    const b = 2;'),
    'const a = 1;\nconst b = 2;');
  check('a paragraph is not', codeBlockIn('She went down anyway.'), null);
}

console.log('a tap that missed the words');
{
  //           line 0: 0-9   line 1: 10-19   line 2: 20-25
  const lines = [
    { y: 0, height: 20, length: 10 },
    { y: 20, height: 20, length: 10 },
    { y: 40, height: 20, length: 6 },
  ];
  const spans = [{ start: 100, end: 112 }, { start: 112, end: 126 }];
  const at = (y) => sentenceAtLine(lines, spans, 100, y);
  check('the first line belongs to the first sentence', at(5), spans[0]);
  check('a later line to the sentence it is inside', at(45), spans[1]);
  check('the gap under the last line is still that line', at(200), spans[1]);
  check('above the first line is the first line', at(-10), spans[0]);
  check('no lines measured yet still answers', sentenceAtLine([], spans, 100, 30), spans[1]);
  check('a paragraph with no sentences answers nothing',
    sentenceAtLine(lines, [], 100, 30), null);
}

console.log('a picture on the page');
{
  const marker = imageMarker('file:///images/epub-1.jpg', 'Figure 2');
  check('a picture is a paragraph that links to it', marker, '![Figure 2](file:///images/epub-1.jpg)');
  check('and reads back as one', imageIn(marker), {
    uri: 'file:///images/epub-1.jpg',
    alt: 'Figure 2',
  });
  check('a caption is optional', imageIn('![](https://x/y.png)').alt, '');
  check('an ordinary paragraph is not a picture', imageIn('She went down anyway.'), null);
  check('nor is a sentence that merely mentions one',
    imageIn('see ![this](file:///a.png) here'), null);
  // Relative to what? The book is text by the time anyone reads it.
  check('a path with nothing to resolve against is left as text',
    imageIn('![fig](images/fig1.png)'), null);
}

console.log('the chapter either side of this one');
{
  check('a chapter is a book and a number', parseChapterRef('John 3'), { book: 'John', chapter: 3 });
  check('a verse is not a chapter', parseChapterRef('John 3:16'), null);
  check('a book that does not exist is not a book', parseChapterRef('Hezekiah 3'), null);
  check('nor is a chapter it does not have', parseChapterRef('John 22'), null);
  check('Psalm and Psalms are one book', parseChapterRef('Psalm 23').book, 'Psalms');
  check('a numbered book keeps its number', parseChapterRef('1 Corinthians 13').chapter, 13);

  check('both neighbours, inside the book',
    neighbouringChapters('John 3'), ['John 2', 'John 4']);
  check('the first chapter has only one', neighbouringChapters('John 1'), ['John 2']);
  check('and so does the last', neighbouringChapters('John 21'), ['John 20']);
  check('a one-chapter book has none', neighbouringChapters('Jude 1'), []);
  check('a verse asks for nothing', neighbouringChapters('John 3:16'), []);
}

console.log('a passage asked for, not owned');
{
  check('the reply is the reference it understood and the words it found',
    passageFrom({ canonical: 'John 3:16', passages: ['[16] Verse text.\n'] }),
    { reference: 'John 3:16', text: '[16] Verse text.' });
  check('two passages come back as two paragraphs',
    passageFrom({ canonical: 'A 1; B 2', passages: ['one', 'two'] }).text, 'one\n\ntwo');
  check('nothing found is nothing returned', passageFrom({ canonical: 'X', passages: [] }), null);
  check('and neither is an answer with no passages at all', passageFrom({}), null);

  // Told to slow down: wait longer each time, never forever, never in step
  // with every other phone that was told the same thing.
  check('the wait doubles', retryDelay(0, () => 1) < retryDelay(1, () => 1), true);
  check('and is capped', retryDelay(20, () => 1) <= 8000, true);
  check('jitter keeps two of them apart', retryDelay(2, () => 0) < retryDelay(2, () => 1), true);
  check('a wait is never nothing', retryDelay(0, () => 0) > 0, true);
}

console.log('finding a book in a kept list');
{
  check('a wildcard in a query is a character, not a wildcard',
    escapeLike('50%_off'), '50\\%\\_off');
  check('a loose match is the letters in order', looseLike('austn'), '%a%u%s%t%n%');

  const emma = { title: 'Emma', author: 'Austen, Jane' };
  const letters = { title: 'The Letters of Jane Austen, Volume II', author: 'Austen, Jane' };
  check('a title that starts with the word beats one that merely contains it',
    score(emma, ['emma']) > score(letters, ['emma']), true);
  check('a word found whole beats a word only spelled out across the row',
    score(emma, ['austen']) > score(emma, ['zzz']), true);
  check('every word counts', score(letters, ['jane', 'austen']) > score(letters, ['jane']), true);
  check('nothing typed, nothing to rank', score(emma, []), 0);
}

console.log('a catalog read one row at a time');
{
  const csv = ['Text#,Title,Authors', '1,"A, B",Someone', '2,"Say ""hi""",Nobody'].join('\n');
  const seen = [];
  forEachCsvRow(csv, (row) => seen.push(row));
  check('every row but the header', seen.length, 2);
  check('a comma inside quotes is still one cell', seen[0].Title, 'A, B');
  check('and a doubled quote is one quote', seen[1].Title, 'Say "hi"');
  check('the streaming read and the array read agree', parseCsv(csv), seen);
}

console.log('a paper read from its own html');
{
  const html = [
    '<body>',
    '<h2 class="ltx_title">First Section</h2>',
    '<p>Prose with <math alttext="x^2" display="inline">x2</math> inside it.</p>',
    '<p><math alttext="E = mc^2" display="block">E=mc2</math></p>',
    '<figure><img src="https://arxiv.org/html/1/x1.png" alt="Figure 1"></figure>',
    '<script>ignored()</script>',
    '</body>',
  ].join('\n');
  const blocks = await blocksFromHtml(html);
  const texts = blocks.map((block) => block.text);
  check('a heading keeps its level', blocks[0].heading, 2);
  check('an inline formula stays in its sentence, as its own TeX',
    texts[1], 'Prose with `x^2` inside it.');
  check('a displayed one is a paragraph of its own', texts[2], '`E = mc^2`');
  check('a figure is a picture', texts[3], '![Figure 1](https://arxiv.org/html/1/x1.png)');
  check('a script is not a paragraph', texts.some((text) => text.includes('ignored')), false);

  check('base64 comes back as the bytes that went in',
    Array.from(bytesFromBase64('SGVsbG8=')), [72, 101, 108, 108, 111]);
}

console.log('arxiv');
{
  const feed = [
    '<feed>',
    '<entry>',
    '<id>http://arxiv.org/abs/2310.17688v3</id>',
    '<published>2023-10-26T17:59:06Z</published>',
    '<title>Managing extreme AI\n  risks amid rapid progress</title>',
    '<summary>Artificial Intelligence is\n  progressing rapidly.</summary>',
    '<author><name>Yoshua Bengio</name></author>',
    '<author><name>Geoffrey Hinton</name></author>',
    '<author><name>Andrew Yao</name></author>',
    '<author><name>Dawn Song</name></author>',
    '<arxiv:primary_category term="cs.CY"/>',
    '<category term="cs.AI"/>',
    '<link href="https://arxiv.org/abs/2310.17688v3" rel="alternate" type="text/html"/>',
    '<link href="https://arxiv.org/pdf/2310.17688v3" rel="related" type="application/pdf" title="pdf"/>',
    '</entry>',
    '</feed>',
  ].join('\n');
  const [paper] = papersFrom(feed);
  check('the id carries its version', paper.id, '2310.17688v3');
  check('a title wrapped by the feed is unwrapped',
    paper.title, 'Managing extreme AI risks amid rapid progress');
  check('every author is kept', paper.authors.length, 4);
  check('the category it was filed under first', paper.category, 'cs.CY');
  check('the pdf link is the one marked pdf', paper.pdf, 'https://arxiv.org/pdf/2310.17688v3');
  check('an author line names three and counts the rest',
    authorLine(paper), 'Yoshua Bengio, Geoffrey Hinton, Andrew Yao +1');
  check('the file is named for the paper, not its id',
    paperFileName(paper), 'Managing extreme AI risks amid rapid progress.pdf');
  check('and takes the format it arrived in',
    paperFileName(paper, 'html'), 'Managing extreme AI risks amid rapid progress.html');
  check('a figure beside the page becomes a figure with an address',
    absolute('<img src="x1.png">', 'https://arxiv.org/html/1706.03762/'),
    '<img src="https://arxiv.org/html/1706.03762/x1.png">');
  check('one that already has an address is left alone',
    absolute('<img src="https://x/y.png">', 'https://arxiv.org/html/1/'),
    '<img src="https://x/y.png">');

  check('a category is browsed newest first',
    queryFor('cs.CL', 'cat'), { search: 'cat:cs.CL', newestFirst: true });
  check('an author is a phrase, so two names are one person',
    queryFor('Geoffrey Hinton', 'au'), { search: 'au:"Geoffrey Hinton"', newestFirst: false });
  check('anything else is ranked by relevance',
    queryFor('attention', 'all'), { search: 'all:attention', newestFirst: false });
}

console.log('an appearance under the finger');
{
  const text = 'One. Ada walked in. Two. Nobody here. Three. Ada again, and Ada once more.';
  const chapters = [
    { idx: 0, start: 0, end: 20 },
    { idx: 1, start: 20, end: 38 },
    { idx: 2, start: 38, end: text.length },
  ];
  const found = appearancesIn(text, chapters, ['Ada'], { from: 0, to: 2 });
  check('every occurrence in the range is found', found.length, 3);
  check('in reading order', found.map((entry) => entry.offset).every((offset, at, all) =>
    at === 0 || offset > all[at - 1]), true);
  check('each one knows its chapter', found.map((entry) => entry.chapterIdx), [0, 2, 2]);
  check('and carries enough around it to recognise',
    found[0].quote.includes('Ada walked in'), true);
  check('a chapter outside the range is not searched',
    appearancesIn(text, chapters, ['Ada'], { from: 1, to: 1 }).length, 0);
  check('a cap is a cap', appearancesIn(text, chapters, ['Ada'], { from: 0, to: 2 }, 2).length, 2);
}

console.log('what a pass is given to read');
{
  const text = 'In the beginning. And the earth was without form.';
  const chapter = { idx: 4, title: 'Genesis 5', start: 0, end: text.length };
  const passage = { first: 1, last: 32 };
  const bible = { kind: 'scripture', title: 'King James Version + Apocrypha', language: 'en' };
  const cited = chapterMaterial(bible, chapter, text, passage);
  check('a bible chapter goes out as a reference', cited.includes('Genesis 5:1-32'), true);
  check('naming the edition it is to be read in',
    cited.includes('King James Version + Apocrypha'), true);
  check('and its verse count', cited.includes('Verses: 32'), true);
  check('the text itself stays on the device', cited.includes('In the beginning'), false);

  const novel = { kind: 'novel', title: 'A Novel', language: 'en' };
  check('a novel is still sent, because nobody has read it',
    chapterMaterial(novel, chapter, text, undefined), text);
}

console.log('gutenberg');
{
  const feed = [
    '<feed>',
    '<entry><id>https://www.gutenberg.org/ebooks/search.opds/?sort_order=title</id>',
    '<title>Sort Alphabetically</title></entry>',
    '<entry><id>https://www.gutenberg.org/ebooks/1342.opds</id>',
    '<title>A Book</title><content type="text">Someone, A.</content></entry>',
    '</feed>',
  ].join('\n');
  const books = booksFrom(feed);
  check('a sort link is not a book', books.length, 1);
  check('the id comes off its own feed url', books[0].id, '1342');
  check('and the author out of the content line', books[0].author, 'Someone, A.');

  const book = { id: '1342', title: 'A Book', author: 'Someone, A.' };
  const detail = [
    '<feed>',
    '<entry><dcterms:language>en</dcterms:language><rights>Public domain in the USA.</rights>',
    '<link type="application/epub+zip" rel="http://opds-spec.org/acquisition" length="24835578" href="https://x/big.epub"/>',
    '<link type="application/x-mobipocket-ebook" rel="http://opds-spec.org/acquisition" length="1" href="https://x/kindle"/>',
    '<link type="application/epub+zip" rel="http://opds-spec.org/acquisition" length="558381" href="https://x/small.epub"/>',
    '</entry></feed>',
  ].join('\n');
  const edition = editionFrom(detail, book);
  check('the same book without the plates is the one taken', edition.url, 'https://x/small.epub');
  check('with the length the source stated', edition.bytes, 558381);
  check('its terms are quoted, not assumed', edition.rights, 'Public domain in the USA.');
  check('and its language', edition.language, 'en');
  check('the title names the file, because the url does not', fileNameFor(book), 'A Book.epub');
  check('a book with no epub is not an edition', editionFrom('<feed></feed>', book), null);
}

console.log('citing a passage');
{
  //          0123456789...
  const text = 'Therefore, holy brothers. Consider Jesus. He was faithful.';
  const verses = [
    { number: 1, start: 0, end: 25 },
    { number: 2, start: 26, end: 41 },
    { number: 3, start: 42, end: 58 },
  ];

  check('a range of verses reads as a range',
    referenceOf('Hebrews 3', verses), 'Hebrews 3:1-3');
  check('one verse is not a range of one',
    referenceOf('Hebrews 3', [verses[1]]), 'Hebrews 3:2');
  check('a selection touching two verses names both',
    versesIn(verses, { start: 10, end: 30 }).map((v) => v.number), [1, 2]);
  check('a verse the selection only abuts is not in it',
    versesIn(verses, { start: 26, end: 41 }).map((v) => v.number), [2]);

  check('the reference leads, every verse is numbered',
    quoteWithVerses(text, { start: 0, end: 58 }, verses, 'Hebrews 3'),
    'Hebrews 3:1-3. [1] Therefore, holy brothers. [2] Consider Jesus. [3] He was faithful.');
  check('half a verse quotes as half a verse',
    quoteWithVerses(text, { start: 10, end: 41 }, verses, 'Hebrews 3'),
    'Hebrews 3:1-2. [1] holy brothers. [2] Consider Jesus.');
  check('a book with no verses is quoted plainly',
    quoteWithVerses(text, { start: 0, end: 20 }, [], 'Chapter 3'), null);
}

console.log('catalog csv');
{
  const csv = [
    'languageCode,translationId,title,Redistributable,Copyright,OTbooks,NTbooks,DCbooks',
    'eng,engwebp,"World English Bible",True,public domain,39,27,0',
    'cmn,cmn-cu89s,"新标点和合本",True,public domain,39,27,0',
    'xxx,priv,"A, quoted ""title""",False,all rights reserved,39,27,0',
  ].join('\n');
  const rows = parseCsv(csv);
  check('every row is read', rows.length, 3);
  check('a comma inside quotes is not a column', rows[2].title, 'A, quoted "title"');
  check('the licence column is read as published', rows[0].Redistributable, 'True');
}

console.log(failures ? `\n${failures} failing` : '\nall passing');
process.exit(failures ? 1 : 0);
