#!/usr/bin/env node
// Adds keys to both catalogs without reordering what's already there.
// Usage: node tools/i18n-add.mjs '<json {lang: {ns: {key: value}}}>'
import { readFileSync, writeFileSync } from 'node:fs';

const patch = JSON.parse(process.argv[2]);
for (const [lang, namespaces] of Object.entries(patch)) {
  const path = new URL(`../src/i18n/${lang}.json`, import.meta.url);
  const catalog = JSON.parse(readFileSync(path, 'utf8'));
  for (const [ns, entries] of Object.entries(namespaces)) {
    catalog[ns] = { ...(catalog[ns] ?? {}), ...entries };
  }
  writeFileSync(path, `${JSON.stringify(catalog, null, 2)}\n`);
}
