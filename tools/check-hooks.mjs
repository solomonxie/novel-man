#!/usr/bin/env node
/**
 * A hook below an early return is a crash, and only on the second render.
 *
 * `if (!book) return <Spinner/>` is how every screen here waits for its data,
 * so the first render of a page runs fewer hooks than the one after it — and
 * React throws "rendered more hooks than during the previous render" the
 * moment the data arrives. It looks like "the app crashes when I open a book",
 * it type-checks perfectly, and it is invisible in review because the two
 * lines are two hundred apart.
 *
 * So: inside a component, once something has returned early, nothing may call
 * a hook. Component level only — indented exactly two spaces, which is where a
 * screen's own statements live and where the mistake is always made.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(import.meta.url), '..', '..');
let failures = 0;

function screens(dir) {
  return readdirSync(dir).flatMap((name) => {
    if (name === 'node_modules' || name.startsWith('.')) return [];
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return screens(path);
    return name.endsWith('.tsx') ? [path] : [];
  });
}

const HOOK = /^ {2}(?:const .*= )?use[A-Z][A-Za-z]*\(/;
const BRANCH = /^ {2}if \(/;
const CLOSES = /^ {2}\}/;
const ENDS = /^\}/;

for (const path of [...screens(join(root, 'app')), ...screens(join(root, 'src'))]) {
  const lines = readFileSync(path, 'utf8').split('\n');
  let returnedAt = 0;

  for (let at = 0; at < lines.length; at++) {
    const line = lines[at];
    // A new component: whatever the last one did is its own business.
    if (ENDS.test(line)) {
      returnedAt = 0;
      continue;
    }
    if (!returnedAt && BRANCH.test(line)) {
      for (let scan = at; scan < lines.length && !CLOSES.test(lines[scan]); scan++) {
        if (/^\s+return\b/.test(lines[scan])) {
          returnedAt = at + 1;
          break;
        }
      }
      continue;
    }
    if (returnedAt && HOOK.test(line)) {
      failures += 1;
      console.log(
        `  FAIL ${relative(root, path)}:${at + 1} — ${line.trim().slice(0, 60)}` +
          `\n       called after the early return on line ${returnedAt}`
      );
    }
  }
}

console.log('hooks before every early return');
if (!failures) console.log('  ok   no hook runs after a component has returned');
process.exit(failures ? 1 : 0);
