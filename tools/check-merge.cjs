#!/usr/bin/env node
/**
 * Merging another copy of a book rewrites the manuscript every note, scene,
 * translation and chapter number points into. A wrong offset there is a note
 * silently sitting on the wrong sentence, so this runs the real code — repo,
 * versions, migrations — against an in-memory SQLite in Node, with the native
 * driver and AsyncStorage stood in for.
 *
 * Usage: node tools/check-merge.cjs <dir the TypeScript was compiled into>
 */
const Module = require('node:module');
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const out = path.resolve(process.argv[2]);

const store = new Map();
const stubs = {
  '@op-engineering/op-sqlite': {
    IOS_DOCUMENT_PATH: '/tmp',
    open() {
      const database = new DatabaseSync(':memory:');
      return {
        async execute(sql, params = []) {
          const bound = params.map((v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v));
          const statement = database.prepare(sql);
          if (/^\s*(SELECT|PRAGMA|WITH)/i.test(sql) && !/^\s*PRAGMA\s+\w+\s*=/i.test(sql)) {
            return { rows: statement.all(...bound) };
          }
          const result = statement.run(...bound);
          return { rowsAffected: Number(result.changes) };
        },
      };
    },
  },
  'react-native-fs-turbo': {
    __esModule: true,
    default: {
      DocumentDirectoryPath: '/tmp',
      LibraryDirectoryPath: '/tmp',
      CachesDirectoryPath: '/tmp',
      exists: () => false,
      mkdir() {},
      moveFile() {},
    },
  },
  '@react-native-async-storage/async-storage': {
    __esModule: true,
    default: {
      getItem: async (k) => store.get(k) ?? null,
      setItem: async (k, v) => void store.set(k, v),
      removeItem: async (k) => void store.delete(k),
    },
  },
};
const load = Module._load;
Module._load = function (request, ...rest) {
  if (request in stubs) return stubs[request];
  return load.call(this, request, ...rest);
};

const repo = require(path.join(out, 'db/repo.js'));
const versions = require(path.join(out, 'db/versions.js'));
const { alignChapters, diffParagraphs } = require(path.join(out, 'structure/merge.js'));
const { mapOffset, mergeSegments, offsetCase, indexCase } = require(path.join(out, 'structure/remap.js'));
const { db } = require(path.join(out, 'db/index.js'));

let failures = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n       got ${JSON.stringify(actual)}\n       want ${JSON.stringify(expected)}`}`);
}

const para = (n, words) => Array.from({ length: words }, (_, i) => `w${n}x${i}`).join(' ');
const chapter = (title, body) => `${title}\n\n${body}`;
function build(chapters) {
  let text = '';
  const ranges = [];
  chapters.forEach(([title, body], i) => {
    if (text) text += '\n\n';
    const start = text.length;
    text += chapter(title, body);
    ranges.push({ title, start });
  });
  return {
    text,
    chapters: ranges.map((r, i) => ({ title: r.title, start: r.start, end: i + 1 < ranges.length ? ranges[i + 1].start : text.length, confident: true })),
  };
}

function pure() {
  console.log('alignment, on its own');
  const book = (n) => Array.from({ length: n }, (_, i) => ({ title: `Chapter ${i + 1}`, text: `Chapter ${i + 1}\n\n${para(i, 50)}` }));
  const base = book(6);
  const renumbered = [...base.slice(0, 2), { title: 'Chapter 3', text: `Chapter 3\n\n${para(99, 50)}` },
    ...base.slice(2).map((c, i) => ({ title: `Chapter ${i + 4}`, text: `Chapter ${i + 4}\n\n${c.text.split('\n\n')[1]}` }))];
  check('renumbered headings after an insertion are not changes',
    alignChapters(base, renumbered).map((s) => s.kind), ['same', 'same', 'added', 'same', 'same', 'same', 'same']);
  check('a dropped chapter is kept, not removed',
    alignChapters(base, [...base.slice(0, 3), ...base.slice(4)]).map((s) => s.kind), ['same', 'same', 'same', 'kept', 'same', 'same']);
  const edited = base.map((c, i) => (i === 4 ? { ...c, text: `${c.text} and one more line` } : c));
  check('an edited chapter pairs with its old self',
    alignChapters(base, edited).map((s) => s.kind), ['same', 'same', 'same', 'same', 'changed', 'same']);
  check('an unrelated chapter in the same place does not pair',
    alignChapters(base.slice(0, 2), [base[0], { title: 'Other', text: para(77, 50) }]).map((s) => s.kind), ['same', 'kept', 'added']);
  const big = book(2500);
  const shifted = [...big.slice(0, 1200), { title: 'New', text: para(5000, 30) }, ...big.slice(1200)];
  check('a long book still lines up', alignChapters(big, shifted).filter((s) => s.kind !== 'same').length, 1);

  console.log('paragraph diff');
  const pieces = diffParagraphs('a\n\nb\n\nc', 'a\n\nB\n\nc');
  check('one paragraph out, one in', pieces.map((p) => p.change), ['same', 'removed', 'added', 'same']);

  console.log('offsets in SQL and in arithmetic agree');
  const segments = mergeSegments([
    { os: 0, oe: 100, ns: 0, ne: 100, linear: true },
    { os: 100, oe: 250, ns: 100, ne: 180, linear: false },
    { os: 250, oe: 400, ns: 230, ne: 380, linear: true },
    { os: 400, oe: 500, ns: 380, ne: 480, linear: true },
  ]);
  check('runs that moved together merge', segments.length, 3);
  const sql = new DatabaseSync(':memory:');
  const offsets = [0, 1, 99, 100, 101, 177, 249, 250, 399, 400, 499, 500, 512];
  const fromSql = offsets.map((x) => sql.prepare(`SELECT ${offsetCase(segments, String(x), 500, 480)} AS v`).get().v);
  check('every offset lands in the same place', fromSql, offsets.map((x) => mapOffset(segments, x, 500, 480)));
  const shiftMap = new Map([[0, 0], [1, 1], [2, 3], [3, 4], [4, 6]]);
  const fromIdx = [0, 1, 2, 3, 4].map((x) => sql.prepare(`SELECT ${indexCase(shiftMap, String(x))} AS v`).get().v);
  check('chapter numbers map as runs', fromIdx, [0, 1, 3, 4, 6]);
}

(async () => {
  pure();
  const mine = [
    ['Chapter 1', `${para(1, 30)}\n\n${para(11, 20)}`],
    ['Chapter 2', `${para(2, 30)}\n\nThe lamp went out at midnight.\n\n${para(22, 20)}`],
    ['Chapter 3', `${para(3, 30)}\n\nShe kept the letter unopened.\n\n${para(33, 20)}`],
    ['Chapter 4', `${para(4, 30)}\n\nRain on the harbour wall.\n\n${para(44, 20)}`],
    ['Chapter 5', `${para(5, 30)}\n\n${para(55, 20)}`],
  ];
  const doc = build(mine);
  const bookId = await repo.saveImportedBook({
    book: { title: 'T', author: 'A', language: 'en', kind: 'novel', source_name: 'mine.txt', source_hash: 'h1', source_path: '/x', source_ext: 'txt', word_count: 1, char_count: doc.text.length, cover_hue: 0 },
    text: doc.text, hints: [], chapters: doc.chapters, scenes: [],
  });
  const chapters0 = await repo.listChapters(bookId);
  const at = (needle) => doc.text.indexOf(needle);
  const mark = async (needle, text = doc.text) => {
    const start = text.indexOf(needle);
    return repo.addAnnotation({ bookId, kind: 'note', start, end: start + needle.length, quote: needle, color: null, note: 'n',
      prefix: text.slice(Math.max(0, start - 40), start), suffix: text.slice(start + needle.length, start + needle.length + 40) });
  };
  await mark('The lamp went out at midnight.');
  await mark('She kept the letter unopened.');
  await mark('Rain on the harbour wall.');
  const database = await db();
  await database.runAsync('INSERT INTO scenes (id, book_id, chapter_id, idx, start, end) VALUES (?, ?, ?, 0, ?, ?)', 's1', bookId, chapters0[3].id, at('Rain on'), chapters0[3].end);

  await repo.saveProgress(bookId, at('Rain on the harbour wall.'));
  const entity = await repo.createEntity(bookId, 'character', 'Mira');
  await database.runAsync('INSERT INTO mentions (entity_id, book_id, chapter_idx, count) VALUES (?, ?, ?, ?)', entity, bookId, 3, 2);
  await database.runAsync('INSERT INTO mentions (entity_id, book_id, chapter_idx, count) VALUES (?, ?, ?, ?)', entity, bookId, 4, 1);
  for (const [idx, needle] of [[3, 'Rain on the harbour wall.'], [2, 'She kept the letter unopened.'], [4, 'w5x0']]) {
    await database.runAsync('INSERT INTO translation_units (id, book_id, target, chapter_idx, start, end, source, edited, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)',
      `u${idx}`, bookId, 'zh', idx, at(needle), at(needle) + needle.length, needle, 'translated');
  }

  console.log('alignment');
  const theirs = [
    mine[0], mine[1],
    ['Interlude', para(9, 40)],
    ['Chapter 3', `${para(3, 30)}\n\nShe kept the letter unopened.\n\nAnd then she burned it.\n\n${para(33, 20)}`],
    mine[3], mine[4],
  ];
  const incoming = build(theirs);
  const bodies = await versions.chapterBodies(bookId);
  const inc = incoming.chapters.map((c) => ({ title: c.title, text: incoming.text.slice(c.start, c.end).trimEnd(), hints: [] }));
  const steps = alignChapters(bodies, inc);
  check('an insertion is one step, and the rest still match', steps.map((s) => s.kind), ['same', 'same', 'added', 'changed', 'same', 'same']);

  console.log('merge, taking the incoming wording');
  await versions.mergeInto(bookId, steps, inc, () => 'theirs', () => true, 'theirs.txt');
  const text1 = await repo.getDocumentText(bookId);
  const expected = build([...theirs]).text;
  check('the manuscript is the merged book', text1, expected);
  const chapters1 = await repo.listChapters(bookId);
  check('six chapters, in order', chapters1.map((c) => c.title), ['Chapter 1', 'Chapter 2', 'Interlude', 'Chapter 3', 'Chapter 4', 'Chapter 5']);
  check('chapter ids survive', [chapters1[0].id, chapters1[3].id, chapters1[5].id], [chapters0[0].id, chapters0[2].id, chapters0[4].id]);
  check('ranges are contiguous', chapters1.every((c, i) => i === 0 || c.start === chapters1[i - 1].end), true);
  const notes = await repo.listAnnotations(bookId);
  check('every note still sits on its quote', notes.map((n) => text1.slice(n.start, n.end) === n.quote), [true, true, true]);
  const onThree = notes.find((n) => n.quote.startsWith('She kept'));
  const v = await versions.listVersions(bookId);
  check('the changed chapter keeps both wordings', v.map((x) => x.source_name), ['mine.txt', 'theirs.txt']);
  check('a note remembers the wording it was written on', onThree.version, v[0].hash);
  check('the chapter reads as the incoming wording', chapters1[3].version, v[1].hash);
  check('notes elsewhere carry no version', notes.filter((n) => n.version).length, 1);
  const scenes = await repo.listChapterScenes(chapters1[4].id);
  check('a scene moves with its chapter', [scenes[0].start, scenes[0].end], [text1.indexOf('Rain on'), chapters1[4].end]);
  check('the reading position moves too', await repo.getProgress(bookId), text1.indexOf('Rain on the harbour wall.'));
  const mentions = await database.getAllAsync('SELECT chapter_idx FROM mentions ORDER BY chapter_idx');
  check('chapter numbers shift past the insertion', mentions.map((m) => m.chapter_idx), [4, 5]);
  const units = await database.getAllAsync('SELECT id, chapter_idx, start, end, source, stale FROM translation_units ORDER BY id');
  check('translations still cover their sentences', units.map((u) => text1.slice(u.start, u.end) === u.source), [true, true, true]);
  check('and are filed under the right chapter', units.map((u) => u.chapter_idx), [3, 4, 5]);
  check('nothing is marked stale that was found', units.map((u) => u.stale), [0, 0, 0]);

  console.log('switching back');
  await versions.switchVersion(chapters1[3].id, v[0].hash);
  const text2 = await repo.getDocumentText(bookId);
  check('the chapter reads as it did', text2.includes('And then she burned it.'), false);
  check('the other chapters are untouched', text2.includes(para(9, 40)), true);
  const notes2 = await repo.listAnnotations(bookId);
  check('notes are still on their quotes', notes2.map((n) => text2.slice(n.start, n.end) === n.quote), [true, true, true]);
  check('no third version is made from a known one', (await versions.listVersions(bookId)).length, 2);
  const units2 = await database.getAllAsync('SELECT start, end, source FROM translation_units ORDER BY id');
  check('translations follow', units2.map((u) => text2.slice(u.start, u.end) === u.source), [true, true, true]);

  console.log('a note made now is on the wording being read');
  const fresh = await mark('w33x3', text2);
  const row = (await repo.listAnnotations(bookId)).find((n) => n.id === fresh);
  check('tagged with the current version', row.version, v[0].hash);

  console.log('re-splitting keeps the versions');
  const before = await repo.listChapters(bookId);
  await repo.replaceChapters(bookId, before.map((c) => ({ title: c.title, start: c.start, end: c.end, confident: true })));
  const after = await repo.listChapters(bookId);
  const v3 = await versions.listVersions(bookId);
  check('versions follow the new chapter row', v3.every((x) => x.chapter_id === after[3].id), true);
  check('and it still knows which it reads as', after[3].version, v[0].hash);

  console.log('backup');
  const record = await repo.readBookRecord(bookId);
  check('a backup carries the versions', record.carried.chapter_versions.length, 2);
  const restored = await repo.writeBookRecord(record);
  const rv = await versions.listVersions(restored);
  const rc = await repo.listChapters(restored);
  check('a restore puts them on the restored chapter', rv.every((x) => x.chapter_id === rc[3].id), true);
  check('with the note versions', (await repo.listAnnotations(restored)).filter((n) => n.version).length, 2);

  console.log('a note whose words the new wording lost');
  {
    const lostDoc = build([['One', para(1, 40)], ['Two', `${para(2, 30)}\n\nA line only the old draft has.\n\n${para(22, 30)}`], ['Three', para(3, 40)]]);
    const id = await repo.saveImportedBook({
      book: { title: 'L', author: null, language: 'en', kind: 'novel', source_name: 'old.txt', source_hash: 'h2', source_path: '/y', source_ext: 'txt', word_count: 1, char_count: lostDoc.text.length, cover_hue: 0 },
      text: lostDoc.text, hints: [], chapters: lostDoc.chapters, scenes: [],
    });
    const needle = 'A line only the old draft has.';
    const start = lostDoc.text.indexOf(needle);
    await repo.addAnnotation({ bookId: id, kind: 'highlight', start, end: start + needle.length, quote: needle, color: null,
      prefix: lostDoc.text.slice(start - 40, start), suffix: lostDoc.text.slice(start + needle.length, start + needle.length + 40) });
    const next = build([['One', para(1, 40)], ['Two', `${para(2, 30)}\n\n${para(22, 30)}`], ['Three', para(3, 40)]]);
    const parts = next.chapters.map((c) => ({ title: c.title, text: next.text.slice(c.start, c.end).trimEnd(), hints: [] }));
    const plan = alignChapters(await versions.chapterBodies(id), parts);
    check('it pairs as a change', plan.map((x) => x.kind), ['same', 'changed', 'same']);
    await versions.mergeInto(id, plan, parts, () => 'theirs', () => true, 'new.txt');
    const [note] = await repo.listAnnotations(id);
    const two = (await repo.listChapters(id))[1];
    check('the note is kept, inside its chapter', note && note.start >= two.start && note.start < two.end, true);
    check('with its quote intact', note.quote, needle);
    await versions.switchVersion(two.id, note.version);
    const back = await repo.getDocumentText(id);
    const [again] = await repo.listAnnotations(id);
    check('switching back puts it on its words again', back.slice(again.start, again.end), needle);
  }

  console.log('which books a daily backup carries');
  {
    const since = Date.now();
    await new Promise((resolve) => setTimeout(resolve, 5));
    const quiet = await repo.saveRecordBook({ title: 'Quiet', kind: 'novel', source_name: 'by hand' });
    const mark = Date.now();
    await new Promise((resolve) => setTimeout(resolve, 5));
    await repo.addStandaloneNote({ bookId: quiet, note: 'a thought' });
    const changed = await repo.booksChangedSince(mark);
    check('a note marks its book, and only lightly', changed, [{ id: quiet, heavy: false }]);
    check('a new book counts as wholly changed',
      (await repo.booksChangedSince(since)).find((book) => book.id === quiet)?.heavy, true);
    check('reading does not count', (await (async () => {
      const after = Date.now();
      await new Promise((resolve) => setTimeout(resolve, 5));
      await repo.saveProgress(quiet, 10);
      return repo.booksChangedSince(after);
    })()).length, 0);
  }

  console.log(failures ? `\n${failures} failing` : '\nall passing');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
