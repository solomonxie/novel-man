#!/usr/bin/env node
// Appends one migration to the runner's list. The list is append-only: an
// existing entry has already run on someone's device and can never change.
// Usage: node tools/add-migration.mjs '<comment>' '<sql>'
import { readFileSync, writeFileSync } from 'node:fs';

const [comment, sql] = process.argv.slice(2);
const path = new URL('../src/db/migrations.ts', import.meta.url);
const source = readFileSync(path, 'utf8').trimEnd();
if (!source.endsWith('];')) throw new Error('migrations.ts does not end with the list');
const head = source.slice(0, -2).trimEnd().replace(/,$/, '');
const block = comment ? `\n\n  ${comment.split('\n').map((line) => `// ${line}`).join('\n  ')}\n` : '\n\n';
writeFileSync(path, `${head},${block}  \`${sql}\`,\n];\n`);
