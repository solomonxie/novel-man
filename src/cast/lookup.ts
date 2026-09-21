/**
 * What the outside world knows about a name. For a real person that is an
 * encyclopedia article, and the model is asked for the link rather than the
 * facts: a link can be opened and judged, where a paragraph of recalled
 * biography can only be believed.
 *
 * Asked for a URL, a model will write one for anybody — the shape is easy and
 * the article may not exist. Nothing is gained by guessing here, so only a
 * real Wikipedia article address survives, and a 404 is the reader's to see.
 */

const ARTICLE = /^https:\/\/([a-z-]{2,12})\.(m\.)?wikipedia\.org\/wiki\/[^\s"']+$/i;
/** Not an article, whichever of the two forms it arrives in. */
const NOT_AN_ARTICLE = /\/wiki\/(Main_Page|Special:|Portal:|Category:)|^(unknown|none|n\/?a|-+)$/i;
/** A title, not a sentence: "Deborah (biblical figure)" is the long end. */
const LONGEST_TITLE = 60;
const MOST_WORDS = 8;

export function parseWikiLink(raw: unknown): string | null {
  const said = typeof raw === 'string' ? raw.trim() : '';
  if (!said || NOT_AN_ARTICLE.test(said)) return null;
  if (/^https?:\/\//i.test(said)) return ARTICLE.test(said) ? said : null;
  // Asked for an address, a model often answers with the title instead. That
  // is the same claim in fewer characters, so it is built into the address
  // rather than thrown away — and a title that does not exist 404s either way.
  if (said.length > LONGEST_TITLE || /[\n<>|{}[\]]/.test(said)) return null;
  if (said.split(/\s+/).length > MOST_WORDS) return null;
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(said.replace(/\s+/g, '_'))}`;
}

/** Filed under its own name in every language, because that is what it is. */
export const WIKI_LABEL = 'Wikipedia';

/** Already asked and answered — a second run has nothing to add for this one. */
export function hasWiki(fields: { label: string; value: string }[]): boolean {
  return fields.some(
    (field) => field.label.trim().toLowerCase() === WIKI_LABEL.toLowerCase() && field.value.trim()
  );
}

/** A field value that goes somewhere: what the details list draws an arrow on. */
export function isLink(value: string): boolean {
  return /^https?:\/\/\S+$/i.test(value.trim());
}
