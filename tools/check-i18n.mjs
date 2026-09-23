#!/usr/bin/env node
/**
 * Two mechanical checks the catalogs need to stay real:
 *
 *  1. Both catalogs carry the same keys. A missing key falls back to English
 *     silently, so nothing else would ever notice.
 *  2. No user-facing string is written inline in a screen. `eslint`'s
 *     `react/jsx-no-literals` would be the natural home for this, but
 *     typescript-eslint does not support TypeScript 7 yet — so the rule lives
 *     here until it does.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(import.meta.url), '..', '..');
let failures = 0;

function report(message) {
  failures += 1;
  console.log(`  FAIL ${message}`);
}

function flatten(object, prefix = '') {
  return Object.entries(object).flatMap(([key, value]) =>
    value && typeof value === 'object'
      ? flatten(value, `${prefix}${key}.`)
      : [`${prefix}${key}`]
  );
}

console.log('catalogs');
{
  const en = JSON.parse(readFileSync(join(root, 'src/i18n/en.json'), 'utf8'));
  const zh = JSON.parse(readFileSync(join(root, 'src/i18n/zh-Hans.json'), 'utf8'));
  const enKeys = new Set(flatten(en));
  const zhKeys = new Set(flatten(zh));
  const missingZh = [...enKeys].filter((key) => !zhKeys.has(key));
  const missingEn = [...zhKeys].filter((key) => !enKeys.has(key));
  if (missingZh.length) report(`zh-Hans is missing: ${missingZh.join(', ')}`);
  if (missingEn.length) report(`en is missing: ${missingEn.join(', ')}`);
  if (!missingZh.length && !missingEn.length) {
    console.log(`  ok   ${enKeys.size} keys in both catalogs`);
  }
}

// Glyphs and punctuation read the same in every language and are not copy.
const ALLOWED = /^[\s＋›‹✓✕⋯⊕⊖≡·—↔／/%－⚠✎🔒🔍0-9.,:|–\-]*$|^Aa$/u;
// Single-line text that a closing tag follows. Requiring the `</` is what
// separates a text node from a `>=` comparison or a generic parameter.
const TEXT_IN_JSX = />\s*([^<>{}\n]*?)\s*<\//g;
const CODE = /[;=()[\]'"`$]/;

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.') || entry === 'node_modules') continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path);
    else if (path.endsWith('.tsx')) scan(path);
  }
}

console.log('bare strings');
let bare = 0;
function scan(path) {
  const source = readFileSync(path, 'utf8');
  for (const match of source.matchAll(TEXT_IN_JSX)) {
    const text = match[1];
    if (ALLOWED.test(text)) continue;
    // An expression container is code, not copy; only literal text counts.
    if (!/[A-Za-z一-鿿]/.test(text)) continue;
    const line = source.slice(0, match.index).split('\n').length;
    report(`${relative(root, path)}:${line} — untranslated text "${text}"`);
    bare += 1;
  }
}

walk(join(root, 'app'));
walk(join(root, 'src'));
if (!bare) console.log('  ok   every visible string comes from a catalog');

// A queue row builds its key at the call site — `work.task_${job.kind}` — so
// nothing above can see it. Rename a kind and its label stays behind under
// the old name, and the queue prints the key itself at the reader.
console.log('work kinds');
const kinds = [
  ...readFileSync(join(root, 'src/db/work.ts'), 'utf8')
    .split('export type WorkKind =')[1]
    .split(';')[0]
    .matchAll(/'([a-z-]+)'/g),
].map((match) => match[1]);
const work = JSON.parse(readFileSync(join(root, 'src/i18n/en.json'), 'utf8')).work;
const missing = kinds.filter((kind) => !(`task_${kind}` in work));
const orphan = Object.keys(work).filter(
  (key) => key.startsWith('task_') && !kinds.includes(key.slice(5))
);
for (const kind of missing) report(`no work.task_${kind} — the queue would show the key`);
for (const key of orphan) report(`work.${key} names no kind`);
if (!missing.length && !orphan.length) console.log('  ok   every job kind has a label, and no label outlives its kind');

console.log(failures ? `\n${failures} failing` : '\nall passing');
process.exit(failures ? 1 : 0);
