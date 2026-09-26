const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–',
  hellip: '…', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’',
};

const ENTITY = /&(#x?[0-9a-f]+|[a-z]+);/gi;

/** Most runs contain no entity at all, and Hermes charges real time per regex run. */
export function decodeEntities(value: string): string {
  if (value.indexOf('&') < 0) return value;
  return value.replace(ENTITY, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return NAMED[body.toLowerCase()] ?? whole;
  });
}

/**
 * Attribute lookup without building a RegExp per call — this runs once per
 * paragraph of a manuscript, and compiling 40,000 patterns is not free.
 */
export function attrValue(tag: string, name: string): string | undefined {
  let cursor = 0;
  while (true) {
    const at = tag.indexOf(name, cursor);
    if (at < 0) return undefined;
    cursor = at + name.length;
    const before = at === 0 ? ' ' : tag[at - 1];
    if (before !== ' ' && before !== '\t' && before !== '\n' && before !== '<') continue;
    let i = cursor;
    while (i < tag.length && (tag[i] === ' ' || tag[i] === '=')) i += 1;
    const quote = tag[i];
    if (quote !== '"' && quote !== "'") continue;
    const end = tag.indexOf(quote, i + 1);
    if (end < 0) return undefined;
    return decodeEntities(tag.slice(i + 1, end));
  }
}

export function attr(tag: string, name: string): string | undefined {
  return attrValue(tag, name);
}

export function firstTagText(xml: string, tagName: string): string | undefined {
  const open = xml.indexOf(`<${tagName}`);
  if (open < 0) return undefined;
  const tagEnd = xml.indexOf('>', open);
  const close = xml.indexOf(`</${tagName}>`, tagEnd);
  if (tagEnd < 0 || close < 0) return undefined;
  return decodeEntities(stripTags(xml.slice(tagEnd + 1, close))).trim() || undefined;
}

const CDATA_OPEN = '<![CDATA[';
const CDATA_CLOSE = ']]>';

export function stripTags(xml: string): string {
  if (xml.indexOf('<') < 0) return xml;
  let out = '';
  let cursor = 0;
  while (true) {
    const open = xml.indexOf('<', cursor);
    if (open < 0) return out + xml.slice(cursor);
    out += xml.slice(cursor, open);
    // A CDATA section is text that happens to start with a `<`. Treating it as
    // a tag threw away everything inside it — and a feed uses CDATA exactly
    // where the text is interesting, so `<title>Dune</title>` survived and
    // `<title><![CDATA[Dune: Messiah]]></title>` came back empty.
    if (xml.startsWith(CDATA_OPEN, open)) {
      const ends = xml.indexOf(CDATA_CLOSE, open + CDATA_OPEN.length);
      if (ends < 0) return out + xml.slice(open + CDATA_OPEN.length);
      out += xml.slice(open + CDATA_OPEN.length, ends);
      cursor = ends + CDATA_CLOSE.length;
      continue;
    }
    const close = xml.indexOf('>', open);
    if (close < 0) return out;
    cursor = close + 1;
  }
}

/**
 * Yields the body of every `<tag …>…</tag>` by scanning with indexOf.
 * The regex equivalent (`<w:p\b[\s\S]*?</w:p>`) backtracks per character in
 * Hermes and does not finish on a 27MB document.
 */
export function* eachElement(xml: string, tag: string): Generator<string> {
  const open = `<${tag}`;
  const close = `</${tag}>`;
  let cursor = 0;
  while (true) {
    const start = xml.indexOf(open, cursor);
    if (start < 0) return;
    const delimiter = xml[start + open.length];
    // `<w:p` is also the prefix of `<w:pPr` and `<w:pStyle`.
    if (delimiter !== '>' && delimiter !== ' ' && delimiter !== '/' && delimiter !== '\t' && delimiter !== '\n') {
      cursor = start + open.length;
      continue;
    }
    const tagEnd = xml.indexOf('>', start);
    if (tagEnd < 0) return;
    if (xml[tagEnd - 1] === '/') {
      cursor = tagEnd + 1;
      continue;
    }
    const end = xml.indexOf(close, tagEnd);
    if (end < 0) return;
    yield xml.slice(start, end);
    cursor = end + close.length;
  }
}
