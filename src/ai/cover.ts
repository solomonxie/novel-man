import * as SecureStore from '../storage/secrets';
import { listKeys, runChat } from './keys';
import { vendorById } from './vendors';
import { fromBase64 } from '../import/base64';

/**
 * A cover drawn to order, for a book that has none.
 *
 * Most of what is on this shelf has no cover anywhere: a manuscript, a bible
 * assembled from a USFM zip, a book somebody typed the name of. The catalogs
 * are asked first — a real cover beats an invented one every time — and this
 * is what is left when they have nothing.
 *
 * Only one of the vendors the app already holds a key for can draw at all, so
 * this is deliberately narrow: if there is no OpenAI key, it says so rather
 * than pretending the feature is missing.
 */
const MODEL = 'gpt-image-1';
const SIZE = '1024x1536';

export class NoImageKey extends Error {
  constructor() {
    super('no-image-key');
  }
}

/** What the book itself can say, capped so a long one costs the same as a short one. */
const CAPS = { summary: 700, briefs: 10, brief: 160, names: 8 };

export type CoverMaterial = {
  title: string;
  author: string | null;
  year: string | null;
  language: string;
  summary: string | null;
  /** A chapter's own line, which is where the concrete imagery lives. */
  briefs: string[];
  people: string[];
  places: string[];
};

/**
 * Everything this shelf knows that could be drawn, as a briefing.
 *
 * A title alone produces the cover of a book that does not exist. What a
 * cover actually needs is nouns — a place, a weather, a thing somebody
 * carries — and those are in the chapter briefs and in the names the analysis
 * wrote down, not in the blurb.
 */
export function coverBriefing(material: CoverMaterial): string {
  const spread = (lines: string[]) => {
    // Across the book rather than the first ten: a cover drawn from chapter
    // one is a cover of the prologue.
    if (lines.length <= CAPS.briefs) return lines;
    const step = lines.length / CAPS.briefs;
    return Array.from({ length: CAPS.briefs }, (_, at) => lines[Math.floor(at * step)]);
  };
  return [
    `Title: ${material.title}`,
    material.author ? `Author: ${material.author}` : '',
    material.year ? `First published: ${material.year}` : '',
    `Language: ${material.language}`,
    material.summary?.trim() ? `What it is about: ${material.summary.trim().slice(0, CAPS.summary)}` : '',
    material.people.length
      ? `People in it: ${material.people.slice(0, CAPS.names).join(', ')}`
      : '',
    material.places.length
      ? `Places in it: ${material.places.slice(0, CAPS.names).join(', ')}`
      : '',
    material.briefs.length
      ? `What happens, chapter by chapter:\n${spread(material.briefs)
          .map((brief) => `- ${brief.slice(0, CAPS.brief)}`)
          .join('\n')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * The prompt the reader starts from before anyone has paid for anything. Local,
 * immediate, and deliberately plain — the good one comes from `artDirect`,
 * which costs a request.
 */
export function coverPrompt(material: CoverMaterial): string {
  const about = material.summary?.trim().slice(0, 300);
  const nouns = [...material.places.slice(0, 3), ...material.people.slice(0, 2)];
  return [
    `Front cover art for "${material.title}"${material.author ? ` by ${material.author}` : ''}.`,
    about ? `The book is about: ${about}` : '',
    nouns.length ? `It features ${nouns.join(', ')}.` : '',
    'One striking image composed as a book cover: portrait, a clear focal subject,',
    'generous margins at the top where a title would sit.',
    NO_TEXT,
  ]
    .filter(Boolean)
    .join(' ');
}

/** The one instruction an image model forgets unless it is repeated. */
const NO_TEXT =
  'No text, no lettering, no title, no author name, no logo, and no writing of any kind anywhere in the image.';

/**
 * A cover, art-directed before it is drawn.
 *
 * This is the step that makes the difference. An image model given a plot
 * paints the plot — several scenes at once, often with invented lettering
 * across the top. A text model that has read the briefs will instead name one
 * image: a subject, a setting, a light, a palette, a medium. That paragraph is
 * what gets drawn, and because it comes back as text the reader can read it,
 * argue with it and edit it before spending anything on the picture.
 */
export async function artDirect(material: CoverMaterial, signal?: AbortSignal): Promise<string> {
  const answer = await runChat(
    [
      {
        role: 'system',
        content:
          'You are an art director briefing an illustrator on the front cover of one book. ' +
          'From what you are told about it, propose exactly ONE image — not a montage, not ' +
          'a series of scenes. Name, in this order and in one paragraph of plain prose: the ' +
          'focal subject and what it is doing; the setting and the time of day; the light; ' +
          'the palette as three or four colours; the medium and period of the artwork (oil, ' +
          'woodcut, mid-century gouache, photographic, ink wash); and the composition, ' +
          'which is portrait with room at the top where a title would be set. ' +
          'Be concrete: a cover is nouns, not themes — name the thing, the place and the ' +
          'weather rather than "loss" or "the human condition". Give away no ending. ' +
          `${NO_TEXT} Reply with the paragraph only, 90 words at most, no preamble.`,
      },
      { role: 'user', content: coverBriefing(material) },
    ],
    { maxTokens: 400, signal }
  );
  return answer.trim();
}

/** The first OpenAI key there is; the others cannot draw. */
async function drawingKey(): Promise<{ secret: string; baseUrl: string } | null> {
  for (const entry of await listKeys()) {
    if (entry.vendorId !== 'openai') continue;
    const secret = await SecureStore.getItemAsync(`ai.key.${entry.id}`);
    const vendor = vendorById(entry.vendorId);
    if (secret && vendor) return { secret, baseUrl: vendor.baseUrl };
  }
  return null;
}

export async function drawCover(prompt: string, signal?: AbortSignal): Promise<Uint8Array> {
  const key = await drawingKey();
  if (!key) throw new NoImageKey();

  const response = await fetch(`${key.baseUrl}/images/generations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key.secret}` },
    body: JSON.stringify({ model: MODEL, prompt, size: SIZE, n: 1 }),
    signal,
  });
  const payload = (await response.json()) as {
    data?: { b64_json?: string; url?: string }[];
    error?: { message?: string };
  };
  if (!response.ok) throw new Error(payload.error?.message ?? `${response.status}`);

  const drawn = payload.data?.[0];
  if (drawn?.b64_json) return fromBase64(drawn.b64_json);
  // Some deployments answer with a link instead of the bytes.
  if (drawn?.url) {
    const image = await fetch(drawn.url, { signal });
    if (!image.ok) throw new Error(`${image.status}`);
    return new Uint8Array(await image.arrayBuffer());
  }
  throw new Error('nothing came back');
}
