#!/usr/bin/env node
/**
 * Browser globals Hermes does not have.
 *
 * This check exists because of one line. `src/import/decode.ts` called
 * `new TextDecoder('utf-8')`, which works in Node, works in a WebView, works
 * in every test here — and is a `ReferenceError` on the phone. React Native
 * ships no polyfill. It backed every text format the app could be given, so
 * `.txt`, `.md`, `.html` and a bible out of a repository all failed on it, and
 * the failure read as a parser that could not understand Markdown.
 *
 * It took a screenshot from the device to find, twice: the same call was still
 * in the epub and docx readers after the first fix, so importing an EPUB went
 * on failing in exactly the same way. Nothing else in the repository could
 * have caught it. This can.
 *
 * `base64.ts` is hand-written for the same reason — Hermes has no `btoa` — and
 * `decode.ts` now decodes UTF-8 and UTF-16 by hand beside it.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

/**
 * What to refuse, and what to use instead. Everything here is absent from
 * Hermes rather than merely discouraged, so there is no judgement in the list
 * — a match is a crash on a device.
 */
const MISSING = [
  { api: 'TextDecoder', instead: 'decodeText or decodeUtf8 from src/import/decode.ts' },
  { api: 'TextEncoder', instead: 'a hand-written encoder; see src/import/base64.ts' },
  { api: 'btoa', instead: 'base64 from src/import/base64.ts' },
  { api: 'atob', instead: 'fromBase64 from src/import/base64.ts' },
  { api: 'structuredClone', instead: 'an explicit copy' },
];

/**
 * The hidden WebView is a browser and may use all of them. So may a tool: it
 * runs in Node, on a Mac, and never ships.
 */
const ALLOWED = ['src/import/extractor.tsx'];

function sources(dir, found = []) {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.') || entry === 'node_modules') continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) sources(path, found);
    else if (/\.tsx?$/.test(entry)) found.push(path);
  }
  return found;
}

/** Comments say the name constantly — explaining why it is not used. */
function withoutComments(code) {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

let failures = 0;
console.log('globals Hermes does not have');

for (const path of [...sources(join(root, 'src')), ...sources(join(root, 'app'))]) {
  const rel = relative(root, path);
  if (ALLOWED.includes(rel)) continue;
  const code = withoutComments(readFileSync(path, 'utf8'));
  for (const { api, instead } of MISSING) {
    if (new RegExp(`\\b${api}\\b`).test(code)) {
      failures += 1;
      console.log(`  FAIL ${rel} uses ${api} — use ${instead}`);
    }
  }
}

if (!failures) console.log(`  ok   none of ${MISSING.map((m) => m.api).join(', ')} is reached from the app`);

console.log(failures ? `\n${failures} failing` : '\nall passing');
process.exit(failures ? 1 : 0);
