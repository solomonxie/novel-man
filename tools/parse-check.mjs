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
const { placeTranslation, endsTight } = await import(join(build, 'translate/layout.js'));
const { diffWords } = await import(join(build, 'translate/diff.js'));
const { countMentions, appearancesIn } = await import(join(build, 'cast/mentions.js'));
const { layoutGraph, reachable, withinRange } = await import(join(build, 'cast/graph.js'));
const { sha256Hex, hmacSha256, utf8, hex } = await import(join(build, 'cloud/sha256.js'));
const { signRequest, parseUrl } = await import(join(build, 'cloud/sign.js'));
const { parseListing, extractMessage } = await import(join(build, 'cloud/client.js'));
const { parsePasted, regionFromEndpoint } = await import(join(build, 'cloud/providers.js'));
const { rewrite, nameFor, looksLikeSignIn } = await import(join(build, 'import/sources/links.js'));
const { fountainExporter, finalDraftExporter } = await import(join(build, 'export/formats/screenplay.js'));
const { bundleName, dateOf, isBundleName } = await import(join(build, 'backup/format.js'));
const { parseUsfm, layoutBible, cleanLine } = await import(join(build, 'scripture/usfm.js'));
const { booksFrom, editionFrom, fileNameFor } = await import(join(build, 'sources/gutenberg.js'));
const {
  booksFrom: seBooksFrom,
  catalogLinkFrom,
  epubLinkFrom,
  pathOf,
  nextLinkFrom,
  authHeader,
  bookFromIndex: seBookFromIndex,
  fileNameFor: seFileName,
} = await import(join(build, 'sources/standardEbooks.js'));
const { chapterMaterial, quotable } = await import(join(build, 'analysis/context.js'));
const { blocksFromHtml, bytesFromBase64 } = await import(join(build, 'import/formats/html.js'));
const { papersFrom, queryFor, authorLine, fileNameFor: paperFileName, absolute } =
  await import(join(build, 'sources/arxiv.js'));
const { quoteWithVerses, referenceOf, versesIn } = await import(join(build, 'scripture/reference.js'));
const { escapeLike, looseLike, score } = await import(join(build, 'sources/matching.js'));
const {
  cleanIsbn,
  isIsbn,
  googleCover,
  looksLikeImage,
  candidatesFromOpenLibrary,
  candidatesFromGoogle,
  mergeCandidates,
} = await import(join(build, 'sources/identify.js'));
const { passageFrom, retryDelay, cleanToken } = await import(join(build, 'sources/esv.js'));
const { parseChapterRef, neighbouringChapters, canonChapters, isBible } =
  await import(join(build, 'scripture/canon.js'));
const { parseCsv, forEachCsvRow } = await import(join(build, 'sources/csv.js'));
const { worksFromSearch, worksFromSubject, languageOf, rowOf, workOf, subjectOf } =
  await import(join(build, 'sources/openLibrary.js'));
const {
  booksFromExport,
  booksFromFeed,
  titleAndSeries,
  plainText,
  statusFromShelf,
  parseFeedUrl,
  pageUrl,
} = await import(join(build, 'sources/goodreads.js'));
const { isSkeleton, starsOf, statusOf } = await import(join(build, 'books/record.js'));
const { readBible } = await import(join(build, 'scripture/published.js'));
const { bookFiles, contentsUrl, parseRepoUrl, rawUrl, searchUrl, titleFrom } =
  await import(join(build, 'sources/repo.js'));
const { parsePin, mapUrl, pinLabel } = await import(join(build, 'cast/location.js'));
const { parseWikiLink, isLink } = await import(join(build, 'cast/lookup.js'));
const { parseTie, tieOf, reverseTie, TIES, TIE_OPPOSITE } = await import(join(build, 'cast/ties.js'));

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

console.log('a page read in translation');
{
  // A chapter the way a Chinese novel sets one: narration, then dialogue on
  // lines of its own.
  const text = [
    '河水涨过了第二级台阶。她还是下去了。',
    '“你疯了。”',
    '他没有回答。',
    '到了早晨，水又退了下去。',
  ].join('\n\n');
  const paragraphs = layoutChapter(text, { start: 0, end: text.length }, 'zh');
  const kinds = (page) => paragraphs.map((p) => page.paragraphs.get(p.start).kind);
  const unit = (start, end, machine) => ({
    start, end, source: text.slice(start, end), machine, edited: null,
  });
  const at = (needle) => text.indexOf(needle);
  const spanning = (from, to, machine) => unit(at(from), at(to) + to.length, machine);

  const aligned = paragraphs.flatMap((paragraph) =>
    paragraph.sentences.map((span) => unit(span.start, span.end, `T${span.start}`))
  );

  const lined = placeTranslation(paragraphs, aligned, text);
  check('sentences that line up stay tappable', kinds(lined), paragraphs.map(() => 'sentences'));
  check('every sentence finds its own translation',
    paragraphs.flatMap((p) => p.sentences).every((span) => lined.sentences.get(span.start)), true);

  // Units made before the splitter agreed with the reader, so one of them runs
  // from the tail of a paragraph across the break and over the two under it.
  const straddling = [
    unit(paragraphs[0].sentences[0].start, paragraphs[0].sentences[0].end, 'A'),
    unit(paragraphs[0].sentences[1].start, paragraphs[0].sentences[1].end, 'B'),
    unit(paragraphs[1].sentences[0].start, paragraphs[1].sentences[0].end, 'C'),
    spanning('”', '到了早晨，水又退了下去。', 'D'),
  ];
  const drifted = placeTranslation(paragraphs, straddling, text);
  check('a swallowed paragraph is not redrawn in the original',
    kinds(drifted), ['sentences', 'sentences', 'absorbed', 'paragraph']);
  check('the swallowed words are printed once, where most of them are',
    paragraphs.map((p) => drifted.paragraphs.get(p.start).text), ['A B', 'C', '', 'D']);
  check('no paragraph is drawn in both languages at once',
    paragraphs.every((p) => !drifted.paragraphs.get(p.start).text.includes(text.slice(p.start, p.start + 3))),
    true);

  // A chapter only half translated still shows what nobody has reached, and
  // still answers a tap: nothing here is printed anywhere else.
  const partial = placeTranslation(paragraphs, [straddling[0]], text);
  check('a half-translated paragraph stays tappable',
    kinds(partial), paragraphs.map(() => 'sentences'));
  check('an untranslated sentence keeps its own words',
    partial.paragraphs.get(paragraphs[0].start).text, 'A 她还是下去了。');
  check('a sentence a unit only reaches into is not drawn twice',
    kinds(placeTranslation(paragraphs, [spanning('河水涨过了第二级台阶。', '她还是下去了。', 'A')], text))[0],
    'paragraph');

  check('a chinese full stop is not followed by a space', endsTight('他没有回答。'), true);
  check('nor is one inside a closing quote', endsTight('\u201c你疯了。\u201d'), true);
  check('an english one is', endsTight('She waited.'), false);

  // The manuscript moved under the units; they are found by their words.
  const moved = `序章\n\n${text}`;
  const shifted = layoutChapter(moved, { start: 0, end: moved.length }, 'zh');
  const found = placeTranslation(shifted, aligned, moved);
  check('a unit whose offsets drifted is found by its own words',
    shifted.slice(1).every((paragraph) =>
      found.paragraphs.get(paragraph.start).kind === 'sentences' &&
      paragraph.sentences.every((span) => found.sentences.get(span.start))),
    true);
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

  // Two crowds and a bridge: d knows c, and nobody else knows either of them.
  const crowds = [
    { id: 'r1', from_id: 'a', to_id: 'b', label: 'sisters', first_chapter: 0, last_chapter: 2 },
    { id: 'r2', from_id: 'c', to_id: 'd', label: 'rivals', first_chapter: 0, last_chapter: 2 },
    { id: 'r3', from_id: 'd', to_id: 'e', label: 'hired', first_chapter: 0, last_chapter: 2 },
  ];
  check('travel reaches the whole crowd, however many steps',
    [...reachable('c', crowds)].sort(), ['c', 'd', 'e']);
  check('and never the other one', reachable('c', crowds).has('a'), false);
  check('someone in no relation at all is their own crowd',
    [...reachable('z', crowds)], ['z']);
  check('direction does not matter', [...reachable('e', crowds)].sort(), ['c', 'd', 'e']);
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
  // A name this app wrote itself is resolved against its own directory, which
  // is the only way a picture survives the app moving between installs.
  check('a stored name is a picture', imageIn('![fig](epub-1.jpg)'), {
    uri: 'epub-1.jpg',
    alt: 'fig',
  });
  check('and an old absolute path still is',
    imageIn('![fig](file:///var/old/images/epub-1.jpg)').uri,
    'file:///var/old/images/epub-1.jpg');
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

  // A bible whose words are elsewhere is still a bible with a shape.
  const built = canonChapters();
  check('every chapter of the canon is a row', built.length, 1189);
  check('the first is the first', built[0].title, 'Genesis 1');
  check('and the last is the last', built[built.length - 1].title, 'Revelation 22');
  check('each sits under the book it belongs to', built[0].part_title, 'Genesis');
  check('books are numbered in canon order',
    built[built.length - 1].part_idx, 65);
  check('nothing has a length, because nothing is here yet',
    built.every((row) => row.start === 0 && row.end === 0), true);

  // Which titles that shape is the right answer for.
  check('a translation by its initials is a bible', isBible('NIV Bible'), true);
  check('initials alone are enough', isBible('KJV'), true);
  check('and so is the name spelled out', isBible('New International Version'), true);
  check('the book itself, named and nothing else', isBible('The Holy Bible'), true);
  check('half of it, likewise', isBible('The New Testament'), true);
  check('a novel is not one, whatever the word in its title',
    isBible('The Poisonwood Bible'), false);
  check('an edition carrying more books is not this canon',
    isBible('Douay-Rheims Bible'), false);
  check('nor is one with the apocrypha bound in',
    isBible('King James Version + Apocrypha'), false);
  check('scripture that is not a bible is not one', isBible('The Quran'), false);
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

  // The page that issues a key shows the whole header, so that is what gets
  // pasted. Any of these is the same key.
  const token = '59e333187956442fadadf8881fbe7e9204f39f50';
  check('a bare token is a token', cleanToken(token), token);
  check('with the scheme on it', cleanToken(`Token ${token}`), token);
  check('with the whole header on it', cleanToken(`Authorization: Token ${token}`), token);
  check('and with the spacing somebody else chose',
    cleanToken(`  authorization:   token  ${token}  `), token);
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

  // A book on the shelf with no words behind it: nothing to send, so what
  // goes out is everything that says which chapter this is.
  const record = {
    kind: 'novel',
    title: 'Life and Fate',
    author: 'Vasily Grossman',
    language: 'en',
    word_count: 0,
    text_source: null,
  };
  const named = {
    idx: 6,
    title: '',
    brief: 'The crossing of the Volga under fire.',
    part_title: 'Part Two',
    start: 0,
    end: 0,
  };
  const asked = chapterMaterial(record, named, '', undefined);
  check('a book with no words is named rather than sent',
    asked.includes('Life and Fate by Vasily Grossman'), true);
  check('the chapter is placed by its number', asked.includes('Chapter 7'), true);
  check('and by the part it sits in', asked.includes('Part Two'), true);
  check('its own line from the contents is what makes it answerable',
    asked.includes('The crossing of the Volga under fire.'), true);
  check('and the model is told not to hold out for a text nobody can send',
    asked.includes('do not decline for want of'), true);

  // Scripture is quotable whatever it was filed as, and a bible kept as a
  // record is a bible before it is a book nobody can look up.
  check('a title naming an edition is quotable',
    quotable({ kind: 'novel', title: 'NIV Bible' }), true);
  check('so is anything filed as scripture',
    quotable({ kind: 'scripture', title: 'Some Edition' }), true);
  check('a novel is not', quotable({ kind: 'novel', title: 'Life and Fate' }), false);

  const shelvedBible = {
    kind: 'novel',
    title: 'NIV Bible',
    language: 'en',
    word_count: 0,
    text_source: null,
  };
  const quoted = chapterMaterial(shelvedBible, { ...chapter, brief: null }, '', passage);
  check('a bible with no words here is still cited as an edition',
    quoted.includes('Edition: NIV Bible'), true);
  check('rather than as a book the model may not know',
    quoted.includes('{\"unknown\":true}'), false);
}

console.log('one book, looked up in the catalogs');
{
  check('an isbn is its digits', cleanIsbn('978-0-14-044913-6'), '9780140449136');
  check('and that one checks out', isIsbn('978-0-14-044913-6'), true);
  check('a transposed pair does not', isIsbn('9780140449163'), false);
  check('ten digits are an isbn too', isIsbn('0-14-044913-2'), true);
  check('with the wrong check digit, no', isIsbn('0-14-044913-3'), false);
  check('X is a check digit, not a letter', isIsbn('043942089X'), true);
  check('a year is not an isbn', isIsbn('1997'), false);

  const ol = candidatesFromOpenLibrary({
    docs: [
      {
        key: '/works/OL45804W',
        title: 'Fantastic Mr Fox',
        author_name: ['Roald Dahl'],
        first_publish_year: 1970,
        cover_i: 6498519,
        language: ['eng'],
        edition_key: ['OL7353617M'],
      },
      { key: '/works/OL1W', title: 'No Cover Here' },
      { title: 'Nameless' },
    ],
  });
  check('a work with everything on it', ol.length, 2);
  check('the cover is a url, not an id', ol[0].thumb.includes('/b/id/6498519-M.jpg'), true);
  check('a big one is kept for keeping', ol[0].cover.includes('-L.jpg'), true);
  check('the edition is held for the fields a search leaves out', ol[0].edition, 'OL7353617M');
  check('a row with no cover is still a row', ol[1].thumb, null);

  const google = candidatesFromGoogle({
    items: [
      {
        id: 'zyTCAlFPjgYC',
        volumeInfo: {
          title: 'The Google Story',
          subtitle: 'Inside the Hottest Business',
          authors: ['David A. Vise'],
          publishedDate: '2005-11-15',
          industryIdentifiers: [
            { type: 'ISBN_10', identifier: '055380457X' },
            { type: 'ISBN_13', identifier: '9780553804577' },
          ],
          imageLinks: {
            thumbnail:
              'http://books.google.com/books/content?id=zyTCAlFPjgYC&printsec=frontcover&img=1&zoom=1&edge=curl&source=gbs_api',
          },
          language: 'en',
          description: 'What it is about.',
        },
      },
    ],
  });
  check('the subtitle belongs to the title',
    google[0].title, 'The Google Story: Inside the Hottest Business');
  check('thirteen digits where there are both', google[0].isbn, '9780553804577');
  check('the date is a year', google[0].year, '2005');
  check('the fold is taken off the cover', google[0].cover.includes('edge=curl'), false);
  check('and it is fetched over https', google[0].cover.startsWith('https://'), true);
  check('the thumbnail stays small', googleCover(google[0].thumb, 1).includes('zoom=1'), true);
  check('what it keeps is bigger', google[0].cover.includes('zoom=0'), true);

  const pad = (head) => Uint8Array.from([...head, ...new Array(64).fill(0)]);
  check('a jpeg is a picture', looksLikeImage(pad([0xff, 0xd8, 0xff, 0xe0])), true);
  check('so is a png', looksLikeImage(pad([0x89, 0x50, 0x4e, 0x47])), true);
  check('and a webp', looksLikeImage(pad([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])), true);
  check('an html error page is not', looksLikeImage(pad([0x3c, 0x21, 0x44, 0x4f])), false);
  check('nor is a riff that is not a webp',
    looksLikeImage(pad([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x41, 0x56, 0x49, 0x20])), false);
  check('nor is a file too small to be one', looksLikeImage(Uint8Array.from([0xff, 0xd8, 0xff])), false);

  const merged = mergeCandidates([ol, google, google]);
  check('the same printing is not offered twice', merged.length, 3);
  check('a row with a cover comes first', merged[0].thumb !== null, true);
  check('and one without sinks', merged[merged.length - 1].thumb, null);
  check('ten is the most anybody looks at', mergeCandidates([ol, google], 1).length, 1);

  // A catalog thinks a book *about* the King James Version answers "KJV"; the
  // grid is put back in the order of what was actually asked for.
  const asked = [
    { id: 'a', source: 'google', title: 'The King James Only Controversy', author: 'James R. White', thumb: 'x', cover: 'x', isbn: null, year: null, language: null, summary: null, edition: null },
    { id: 'b', source: 'google', title: 'Holy Bible', author: 'King James Version', thumb: 'y', cover: 'y', isbn: null, year: null, language: null, summary: null, edition: null },
  ];
  check('the book itself outranks a book about it',
    mergeCandidates([asked], 10, 'Holy Bible KJV')[0].title, 'Holy Bible');
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

console.log('standard ebooks');
{
  const nav = [
    '<feed>',
    '<link rel="start" type="application/atom+xml;profile=opds-catalog;kind=navigation" href="/feeds/opds"/>',
    '<entry><title>New Releases</title>',
    '<link rel="subsection" type="application/atom+xml;profile=opds-catalog;kind=acquisition" href="/feeds/opds/new-releases"/>',
    '</entry>',
    '<entry><title>All Ebooks</title>',
    '<link rel="subsection" type="application/atom+xml;profile=opds-catalog;kind=acquisition" href="/feeds/opds/all"/>',
    '</entry>',
    '</feed>',
  ].join('\n');
  check('the whole shelf is preferred over a slice of it',
    catalogLinkFrom(nav), 'https://standardebooks.org/feeds/opds/all');
  check('the newest fifteen is never mistaken for the shelf',
    catalogLinkFrom(nav.replace('/feeds/opds/all', '/feeds/opds/subjects')),
    'https://standardebooks.org/feeds/opds/subjects');
  check('paging is followed in the feed\'s own words',
    nextLinkFrom('<feed><link rel="next" href="/feeds/opds/all?page=2"/></feed>'),
    'https://standardebooks.org/feeds/opds/all?page=2');
  check('a last page says nothing about a next one', nextLinkFrom('<feed></feed>'), null);
  check('a navigation link is not a catalog',
    catalogLinkFrom('<feed><link rel="start" type="application/atom+xml;profile=opds-catalog;kind=navigation" href="/x"/></feed>'),
    null);

  const entry = [
    '<entry>',
    '<id>url:https://standardebooks.org/ebooks/jane-austen/persuasion</id>',
    '<title>Persuasion</title>',
    '<author><name>Jane Austen</name></author>',
    '<rights>Public domain in the United States.</rights>',
    '<dcterms:language>en-GB</dcterms:language>',
    '<category scheme="http://purl.org/dc/terms/LCSH" term="Love stories"/>',
    '<link rel="http://opds-spec.org/acquisition" type="application/kepub+zip" href="/ebooks/jane-austen/persuasion/downloads/jane-austen_persuasion.kepub.epub"/>',
    '<link rel="http://opds-spec.org/acquisition" type="application/epub+zip" href="/ebooks/jane-austen/persuasion/downloads/jane-austen_persuasion_advanced.epub"/>',
    '<link rel="http://opds-spec.org/acquisition" type="application/epub+zip" href="/ebooks/jane-austen/persuasion/downloads/jane-austen_persuasion.epub"/>',
    '</entry>',
  ].join('\n');
  check('the plain epub wins over the advanced one', epubLinkFrom(entry),
    'https://standardebooks.org/ebooks/jane-austen/persuasion/downloads/jane-austen_persuasion.epub');
  check('a kepub is not an epub this app reads',
    epubLinkFrom(entry.replace(/^.*_advanced\.epub.*$/m, '').replace(/^.*persuasion\.epub.*$/m, '')),
    null);

  const feed = `<feed><entry><title>Nav</title></entry>${entry}</feed>`;
  const rows = seBooksFrom(feed);
  check('an entry with nothing to fetch is not a book', rows.length, 1);
  check('the id is the path the site files it under', rows[0].extId, 'jane-austen/persuasion');
  check('the url is the one stated, never built from the id',
    rows[0].href,
    'https://standardebooks.org/ebooks/jane-austen/persuasion/downloads/jane-austen_persuasion.epub');
  check('its terms are quoted', rows[0].terms, 'Public domain in the United States.');
  check('and its language', rows[0].language, 'en-GB');
  check('subjects are searchable without being shown', rows[0].extra, 'Love stories');

  check('a download url still reduces to the book it belongs to',
    pathOf('https://standardebooks.org/ebooks/a/b/downloads/a_b.epub'), 'a/b');

  // Their instruction: the email in the username, nothing in the password.
  check('the credential is basic auth with an empty password',
    authHeader('reader@example.com'), 'Basic cmVhZGVyQGV4YW1wbGUuY29tOg==');

  const book = seBookFromIndex(rows[0]);
  check('a kept row is the whole download', book.url, rows[0].href);
  check('the title names the file', seFileName(book), 'Persuasion.epub');
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

/*
 * A bible published as data. The readers are offered a file in turn and the
 * first whose result is a bible wins, so these check two things at once: that
 * a layout is read, and that something which merely resembles it is refused.
 *
 * The fixtures carry real chapter counts because the reader insists on them —
 * position only names a book where that book's own number of chapters is there.
 */
const verses = (count) =>
  Array.from({ length: count }, (_, at) => ({ verse: at + 1, text: `Verse ${at + 1}, written down.` }));
const chapters = (count, each = 4) =>
  Array.from({ length: count }, (_, at) => ({ chapter: at + 1, verses: verses(each) }));
const loose = (count, each = 4) =>
  Array.from({ length: count }, () => Array.from({ length: each }, (_, at) => `Verse ${at + 1}, written down.`));
const xmlChapters = (count, each = 4) =>
  Array.from({ length: count }, (_, c) =>
    `<chapter number="${c + 1}">` +
    Array.from({ length: each }, (_, v) => `<verse number="${v + 1}">Verse ${v + 1}, written down.</verse>`).join('') +
    '</chapter>').join('');

console.log('a bible published as data');
{
  // One file per book, the book named in the file.
  const perBook = readBible(JSON.stringify({
    book: '1 Chronicles', count: 29, chapters: chapters(29),
  }), '1 Chronicles.json');
  check('the file names its own book', perBook.ok && perBook.books[0].name, '1 Chronicles');
  check('and carries its code', perBook.books[0].code, '1CH');
  check('numbers are numbers even when written as strings',
    readBible(JSON.stringify({
      book: 'Jude', chapters: [{ chapter: '1', verses: verses(25).map((v) => ({ verse: String(v.verse), text: v.text })) }],
    }), 'Jude.json').books[0].chapters[0].verses.slice(0, 2).map((v) => v.number), [1, 2]);

  // A whole bible in one file, books under a key of their own.
  const whole = readBible(JSON.stringify({
    translation: 'King James Version',
    books: [{ name: 'Genesis', chapters: chapters(50) }, { name: 'Exodus', chapters: chapters(40) }],
  }), 'kjv.json');
  check('the file says what edition it is', whole.title, 'King James Version');
  check('and every book in it', whole.books.map((b) => b.name), ['Genesis', 'Exodus']);

  // Verses by position, under an abbreviation nothing resolves: the place in
  // the canon is all that is stated, and the chapter counts are what confirm it.
  const positional = readBible(JSON.stringify([
    { abbrev: 'gn', chapters: loose(50) },
    { abbrev: 'ex', chapters: loose(40) },
  ]), 'en_kjv.json');
  check('position names a book when its chapters agree',
    positional.ok && positional.books.map((b) => b.name), ['Genesis', 'Exodus']);
  check('and position numbers the verses',
    positional.books[0].chapters[0].verses.map((v) => v.number), [1, 2, 3, 4]);
  check('the name it did state is kept as one of its own',
    positional.books[0].names, ['Genesis', 'gn']);

  // One row per verse: what a database export of a bible looks like.
  const rows = readBible(JSON.stringify([
    ...verses(21).map((v) => ({ book_name: 'Obadiah', chapter: 1, verse: v.number, text: v.text })),
    ...verses(25).map((v) => ({ book_name: 'Jude', chapter: 1, verse: v.number, text: v.text })),
  ]), 'bible.json');
  check('rows gather into books', rows.ok && rows.books.map((b) => b.name), ['Obadiah', 'Jude']);
  check('and into their chapters', rows.books[0].chapters[0].verses.length, 21);

  check('which layout it turned out to be is reported',
    [perBook.shape, whole.shape, positional.shape, rows.shape],
    ['one-book', 'book-list', 'book-list', 'verse-rows']);
}

console.log('a file that is not a bible');
{
  // The dangerous case, and the reason position has to be earned: a list of
  // sixty-six anythings must not become the canon by being in the right order.
  const sections = readBible(JSON.stringify(
    Array.from({ length: 66 }, (_, at) => ({ name: `Section ${at + 1}`, chapters: chapters(3) }))
  ), 'sections.json');
  check('sixty-six of something else is not the canon', sections, { ok: false, why: 'canon' });

  // Fifty chapters at index nought, and nothing else to corroborate it.
  check('one list of fifty is not Genesis',
    readBible(JSON.stringify({ chapters: chapters(50) }), 'export.json'),
    { ok: false, why: 'canon' });

  check('a book cannot have more chapters than it has',
    readBible(JSON.stringify({ book: 'Jude', chapters: chapters(3) }), 'Jude.json'),
    { ok: false, why: 'canon' });

  check('an edition of one-verse chapters is not one',
    readBible(JSON.stringify({ book: 'John', chapters: chapters(21, 1) }), 'John.json'),
    { ok: false, why: 'canon' });

  check('a config file is not a book',
    readBible('{"name":"thing","version":"1.0.0"}', 'package.json'), { ok: false, why: 'shape' });
  check('nor is a page of HTML',
    readBible('<html><body><p>hello</p></body></html>', 'index.html'), { ok: false, why: 'shape' });
  check('nor is an empty file', readBible('', 'empty.json'), { ok: false, why: 'shape' });

  // A file whose extension lies is still read, just read second.
  const mislabelled = readBible(
    `<bible><book number="43">${xmlChapters(21)}</book></bible>`, 'john.json');
  check('the extension sets the order, not the answer',
    mislabelled.ok && [mislabelled.shape, mislabelled.books[0].name], ['xml', 'John']);
}

console.log('a bible published as xml');
{
  // Books numbered rather than named, nested inside testaments.
  const numbered = readBible([
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<bible translation="English NIV">',
    '<testament name="Old">',
    `<book number="1">${xmlChapters(50)}</book>`,
    `<book number="2">${xmlChapters(40)}</book>`,
    '</testament>',
    '</bible>',
  ].join(''), 'niv.xml');
  check('the edition names itself', numbered.title, 'English NIV');
  check('a numbered book is a named one where its chapters agree',
    numbered.ok && numbered.books.map((b) => b.name), ['Genesis', 'Exodus']);
  check('a verse stops where the next tag starts',
    numbered.books[0].chapters[0].verses[0].text, 'Verse 1, written down.');
  check('the testament around them is not a book', numbered.books.length, 2);

  // Its own tag names, the book named outright, and a footnote inside a verse.
  const tagged = readBible([
    '<XMLBIBLE biblename="Luther 1912">',
    '<BIBLEBOOK bnumber="43" bname="John" bsname="Jhn">',
    '<CHAPTER cnumber="3">',
    '<VERS vnumber="16">For God so loved the world<NOTE>a footnote</NOTE></VERS>',
    ...verses(3).map((v) => `<VERS vnumber="${v.number + 16}">${v.text}</VERS>`),
    '</CHAPTER>',
    '</BIBLEBOOK>',
    '</XMLBIBLE>',
  ].join(''), 'luther.xml');
  check('a name it states is the name it keeps', tagged.ok && tagged.books[0].name, 'John');
  check('the chapter is the one it says', tagged.books[0].chapters[0].number, 3);
  check('a footnote is not the verse',
    tagged.books[0].chapters[0].verses[0].text, 'For God so loved the world');

  // Milestones: the verse is marked open and closed, and nothing contains it.
  const milestoned = readBible([
    '<osisText>',
    '<div type="book" osisID="Gen">',
    '<chapter osisID="Gen.1">',
    '<title>The Creation</title>',
    ...verses(4).map((v) =>
      `<verse osisID="Gen.1.${v.number}" sID="Gen.1.${v.number}"/>${v.text}<verse eID="Gen.1.${v.number}"/>`),
    '</chapter>',
    '<div type="section"><p>not a book</p></div>',
    '</div>',
    '</osisText>',
  ].join(''), 'gen.xml');
  check('a milestone opens a verse the same as a container does',
    milestoned.ok && milestoned.books[0].chapters[0].verses.map((v) => v.text),
    verses(4).map((v) => v.text));
  check('a three-letter code names the book', milestoned.books[0].name, 'Genesis');
  check('a section is not a book, and its words are not verses', milestoned.books.length, 1);
}

console.log('a bible kept in a repository');
{
  check('the page someone was reading',
    parseRepoUrl('https://github.com/aruljohn/Bible-niv/blob/main/1%20Chronicles.json'),
    { owner: 'aruljohn', repo: 'Bible-niv', ref: 'main', path: '1 Chronicles.json' });
  check('the raw file is the same file',
    parseRepoUrl('https://raw.githubusercontent.com/aruljohn/Bible-niv/main/1%20Chronicles.json').path,
    '1 Chronicles.json');
  check('a branch written out in full is a branch',
    parseRepoUrl('https://raw.githubusercontent.com/o/r/refs/heads/main/Genesis.json'),
    { owner: 'o', repo: 'r', ref: 'refs/heads/main', path: 'Genesis.json' });
  check('a folder is a folder',
    parseRepoUrl('https://github.com/o/r/tree/master/json/').path, 'json');
  check('a repository browsed at its root is its root',
    parseRepoUrl('https://github.com/o/r/tree/main'),
    { owner: 'o', repo: 'r', ref: 'main', path: '' });
  check('and so is one named with nothing after it',
    parseRepoUrl('https://github.com/o/r'), { owner: 'o', repo: 'r', ref: 'HEAD', path: '' });
  check('anything else is not one', parseRepoUrl('https://example.com/bible.json'), null);

  check('a space in a name survives the round trip',
    rawUrl({ owner: 'a', repo: 'b', ref: 'main', path: '' }, '1 Chronicles.json'),
    'https://raw.githubusercontent.com/a/b/main/1%20Chronicles.json');
  check('a repository root is listed, not a file inside it',
    contentsUrl({ owner: 'o', repo: 'r', ref: 'main', path: '' }, ''),
    'https://api.github.com/repos/o/r/contents/?ref=main');

  check('a keyword asks for repositories, most-starred first',
    searchUrl('niv'),
    'https://github.com/search?q=bible%20niv&type=repositories&s=stars&o=desc');

  // A folder of books is one bible, and the canon is the order to read it in.
  check('only the books, and only in order',
    bookFiles(['Exodus.json', 'README.md', 'Genesis.json', 'John.json', 'notes.txt']),
    ['Genesis.json', 'Exodus.json', 'John.json']);
  check('a folder of whole bibles names no books',
    bookFiles(['EnglishNIVBible.xml', 'EnglishKJVBible.xml']), []);
  check('where a book is published twice, the format asked for wins',
    bookFiles(['Genesis.json', 'Genesis.xml'], 'xml'), ['Genesis.xml']);

  check('a bible in one file is called what the file is',
    titleFrom({ owner: 'Beblia', repo: 'Holy-Bible-XML-Format', ref: 'master', path: '' },
      ['EnglishNIVBible.xml']), 'EnglishNIVBible');
  check('a bible in many is called what the repository is',
    titleFrom({ owner: 'aruljohn', repo: 'Bible-niv', ref: 'main', path: '' },
      ['Genesis.json', 'Exodus.json']), 'Bible niv');
}

// Where a place is today. What matters is what gets refused: a model asked
// where Eden is will answer, and "unknown" is an answer it writes as a name.
console.log('\nplace pins');
{
  check('a modern name is kept, with how sure it is',
    parsePin({ modern: '  Tel Hazor, Israel ', certainty: 'certain' }),
    { located: 'Tel Hazor, Israel', located_certainty: 'certain' });
  check('no name, no pin', parsePin({ certainty: 'certain' }), null);
  check('nothing at all is not a pin', parsePin(undefined), null);
  check('"unknown" is not a place', parsePin({ modern: 'Unknown' }), null);
  check('nor is a dash', parsePin({ modern: '—' }), null);
  check('a sentence is the model explaining, not naming',
    parsePin({ modern: 'Somewhere in the northern Sinai, though the site has never been agreed on' }),
    null);
  check('an unstated certainty is not certainty',
    parsePin({ modern: 'Susa, Iran' }).located_certainty, 'probable');
  check('a made-up certainty is not one either',
    parsePin({ modern: 'Susa, Iran', certainty: 'very sure' }).located_certainty, 'probable');
  check('the map is asked for the name',
    mapUrl('Tel Hazor, Israel'),
    'https://www.google.com/maps/search/?api=1&query=Tel%20Hazor%2C%20Israel');
  check('the pin is called what the place is called now',
    pinLabel({ name: 'Hazor', located: 'Tel Hazor, Israel' }), 'Tel Hazor, Israel');
  check('and what the book calls it when there is nothing else',
    pinLabel({ name: 'Hazor', located: null }), 'Hazor');
}

// An article somebody can open, or nothing. A model asked for a link writes
// one whether or not the page exists, and the plausible ones are the problem.
console.log('\npeople links');
{
  check('an article is kept',
    parseWikiLink('https://en.wikipedia.org/wiki/Deborah'),
    'https://en.wikipedia.org/wiki/Deborah');
  check('so is one in another language',
    parseWikiLink('https://zh.wikipedia.org/wiki/%E5%BA%95%E6%B3%A2%E6%8B%89'),
    'https://zh.wikipedia.org/wiki/%E5%BA%95%E6%B3%A2%E6%8B%89');
  check('a title is the same claim, so it becomes the address',
    parseWikiLink('Deborah (biblical figure)'),
    'https://en.wikipedia.org/wiki/Deborah_(biblical_figure)');
  check('a one-word title too', parseWikiLink('Samson'), 'https://en.wikipedia.org/wiki/Samson');
  check('"unknown" is not a title', parseWikiLink('unknown'), null);
  check('a sentence is not a title either',
    parseWikiLink('There is no article for this person as far as I know'), null);
  check('another site is not the encyclopedia',
    parseWikiLink('https://biblehub.com/wiki/Deborah'), null);
  check('http is not https', parseWikiLink('http://en.wikipedia.org/wiki/Deborah'), null);
  check('the front page is nobody', parseWikiLink('https://en.wikipedia.org/wiki/Main_Page'), null);
  check('a category is nobody either',
    parseWikiLink('https://en.wikipedia.org/wiki/Category:Judges_of_ancient_Israel'), null);
  check('nothing at all is not a link', parseWikiLink(undefined), null);
  check('a detail that is a url gets an arrow', isLink('https://example.org/a'), true);
  check('and one that is a sentence does not', isLink('a walled city in the north'), false);
}

// Sixteen words and nothing else. The graph is only deterministic if every
// pass, every edition and every reader's edit land on the same one.
console.log('\nties');
{
  check('a word from the list is itself', parseTie('sibling'), 'sibling');
  check('so is one in another case', parseTie(' Spouse '), 'spouse');
  check('a father is a parent', parseTie('father'), 'parent');
  check('and so is 父亲', parseTie('父亲'), 'parent');
  check('prose around the word still names the word', parseTie('his elder brother'), 'sibling');
  check('a word from nowhere is not a tie', parseTie('travelled together once'), null);
  check('nothing is not a tie', parseTie(''), null);
  check('but an old row still draws as something', tieOf('travelled together once'), 'other');

  check('reversing a parent gives a child', reverseTie('parent'), 'child');
  check('reversing a sibling gives a sibling', reverseTie('sibling'), 'sibling');
  check('reversing a master gives a servant', reverseTie('master'), 'servant');
  check('every tie reverses to one in the list',
    TIES.filter((tie) => !TIES.includes(TIE_OPPOSITE[tie])), []);
  check('and reversing twice is where it started',
    TIES.filter((tie) => TIE_OPPOSITE[TIE_OPPOSITE[tie]] !== tie), []);
}

// A catalog that hands over records instead of books. What matters is that a
// row with no title never becomes a book, and that the two shapes their two
// endpoints answer in both reduce to the same one.
console.log('\nopen library');
{
  const search = worksFromSearch({
    docs: [
      {
        key: '/works/OL45804W',
        title: '  Fantastic  Mr Fox ',
        author_name: ['Roald Dahl', 'Quentin Blake'],
        first_publish_year: 1970,
        cover_i: 8739161,
        language: ['eng'],
        subject: ['Foxes', 'Fiction'],
      },
      { key: '/works/OL1W' },
      { title: 'No key at all' },
    ],
  });
  check('a row becomes one work', search.length, 1);
  check('the work key loses its path', search[0].key, 'OL45804W');
  check('the title is squeezed', search[0].title, 'Fantastic Mr Fox');
  check('up to three authors, as one line', search[0].author, 'Roald Dahl, Quentin Blake');
  check('the year is a year', search[0].year, '1970');
  check('the language comes over as two letters', search[0].language, 'en');
  check('nothing at all is not a language', languageOf(undefined), '');
  check('a two-letter code is already one', languageOf(['fr']), 'fr');
  check('a subject page is the same work in another shape',
    worksFromSubject({
      works: [
        { key: '/works/OL45804W', title: 'Fantastic Mr Fox', authors: [{ name: 'Roald Dahl' }],
          first_publish_year: 1970, cover_id: 8739161 },
        { key: '/works/OL2W' },
      ],
    }).map((work) => [work.key, work.title, work.author, work.coverId]),
    [['OL45804W', 'Fantastic Mr Fox', 'Roald Dahl', 8739161]]);
  check('a work survives the round trip through a kept row',
    (() => {
      const back = workOf(rowOf(search[0]));
      return [back.key, back.title, back.author, back.year, back.coverId, back.language];
    })(),
    ['OL45804W', 'Fantastic Mr Fox', 'Roald Dahl, Quentin Blake', '1970', 8739161, 'en']);
  check('a kept list says which category it is', subjectOf('openlibrary:fantasy').name, 'Fantasy');
  check('and a source that is not one says nothing', subjectOf('gutenberg'), null);
}

// Somebody's own library, brought over. Every row of it is a claim about what
// they thought of a book, and getting a rating onto the wrong book — or a "0"
// read as a rating of nought — is the failure that matters here.
console.log('\ngoodreads');
{
  const csv = [
    'Book Id,Title,Author,ISBN,ISBN13,My Rating,Number of Pages,Year Published,' +
      'Original Publication Year,Date Read,Date Added,Bookshelves,Exclusive Shelf,My Review,Private Notes',
    '234225,"Dune (Dune, #1)",Frank Herbert,"=""0441013597""","=""9780441013593""",5,604,2005,1965,' +
      '2019/03/14,2018/01/02,"sci-fi, favourites",read,"Still the best of them.<br/>Twice.",Reread in spring',
    '1,"Nothing Rated",Someone,"","",0,100,2001,,,2020/05/05,,to-read,,',
    ',,,,,,,,,,,,,,',
  ].join('\n');
  const books = booksFromExport(csv);
  check('a row with no title is not a book', books.length, 2);
  check('the series comes out of the title', titleAndSeries('Dune (Dune, #1)').title, 'Dune');
  check('and is kept as a shelf', books[0].shelves, ['Dune, #1', 'sci-fi', 'favourites']);
  check('a title with real brackets keeps them',
    titleAndSeries('Gödel, Escher, Bach (An Eternal Golden Braid)').title,
    'Gödel, Escher, Bach (An Eternal Golden Braid)');
  check('the rating', books[0].stars, 5);
  check('nought is not a rating', books[1].stars, null);
  check('the review keeps its line breaks',
    books[0].review, 'Still the best of them.\nTwice.');
  check('private notes are notes, not a review', books[0].notes, 'Reread in spring');
  check('the original year beats the printing', books[0].year, '1965');
  check('and the printing is used when there is nothing else', books[1].year, '2001');
  check('the ISBN comes out of the spreadsheet quoting', books[0].isbn, '9780441013593');
  check('their shelf becomes a status', books[0].status, 'read');
  check('to-read is a wish', books[1].status, 'wishlist');
  check('currently-reading is reading', statusFromShelf('currently-reading'), 'reading');
  check('a shelf of their own is not a status', statusFromShelf('sci-fi'), null);
  check('the date read is when they finished it',
    new Date(books[0].at).getFullYear(), 2019);
  check('added is the fallback', new Date(books[1].at).getFullYear(), 2020);

  const feed = `<rss><channel>
    <item><title>Dune (Dune, #1)</title><book_id>234225</book_id>
      <author_name>Frank Herbert</author_name><user_rating>4</user_rating>
      <user_read_at>Tue, 14 Mar 2019 00:00:00 -0700</user_read_at>
      <user_review>Read it again &amp; again.</user_review>
      <book_published>1965</book_published><isbn>0441013597</isbn></item>
    <item><title></title></item>
  </channel></rss>`;
  const fromFeed = booksFromFeed(feed, 'read');
  check('a feed item is the same book', fromFeed.length, 1);
  check('with its rating', fromFeed[0].stars, 4);
  check('its review, entities and all', fromFeed[0].review, 'Read it again & again.');
  check('and the shelf the feed was asked for', fromFeed[0].status, 'read');
  check('a feed address of theirs is accepted',
    parseFeedUrl('https://www.goodreads.com/review/list_rss/12345?key=abc&shelf=read').shelf, 'read');
  check('anywhere else is not', parseFeedUrl('https://example.org/review/list_rss/1'), null);
  check('nor is http', parseFeedUrl('http://www.goodreads.com/review/list_rss/1'), null);
  check('paging keeps the key', pageUrl('https://www.goodreads.com/review/list_rss/1?key=abc', 2),
    'https://www.goodreads.com/review/list_rss/1?key=abc&page=2');
  check('and replaces a page rather than adding a second',
    pageUrl('https://www.goodreads.com/review/list_rss/1?key=abc&page=2', 3),
    'https://www.goodreads.com/review/list_rss/1?key=abc&page=3');
  check('markup around nothing is nothing', plainText('<br/>'), null);
}

// What separates a book with no words from one whose words are fetched.
console.log('\nskeletons');
{
  check('no words and no source is a skeleton', isSkeleton({ word_count: 0, text_source: null }), true);
  check('a licensed edition is not one',
    isSkeleton({ word_count: 0, text_source: 'esv' }), false);
  check('and neither is a manuscript',
    isSkeleton({ word_count: 91000, text_source: null }), false);
  check('five stars is five', starsOf(5), 5);
  check('six is five', starsOf(6), 5);
  check('nothing is nothing', starsOf(null), 0);
  check('a status from nowhere is no status', statusOf('abandoned'), null);
  check('and one from the list is itself', statusOf('reading'), 'reading');
}

console.log(failures ? `\n${failures} failing` : '\nall passing');
process.exit(failures ? 1 : 0);
