import * as SecureStore from '../storage/secrets';
import { listKeys } from './keys';
import { vendorById } from './vendors';
import { isChinaStore } from '../store/storefront';
import { fromBase64 } from '../import/base64';

/**
 * Drawing, for whatever on the shelf wants a picture.
 *
 * Only one of the vendors the app already holds a key for can draw at all, so
 * this is deliberately narrow: with no OpenAI key it says so rather than
 * pretending the feature is missing.
 */
export type Shape = 'portrait' | 'square';

/**
 * How long a picture is worth waiting for, which is not the app's call.
 *
 * `normal` is the current model at its cheapest pass: a picture judged in a
 * strip of 88-point thumbnails does not need the slowest setting, and the wait
 * is the thing that makes drawing feel broken rather than deliberate. `fast`
 * is the small model, and `best` the slow, precise one at high quality.
 *
 * Each is a list, newest first. OpenAI retires image models on a schedule
 * (gpt-image-1 went in October 2026), and a key may not have access to the
 * newest yet, so a model the vendor says is gone or not allowed falls through
 * to the next — and the one that answered is remembered until the app closes.
 */
export type Grade = 'fast' | 'normal' | 'best';

const DRAWING = 'ai.drawing.grade';

type Recipe = { model: string; quality?: string; sizes: Record<Shape, string> };

const TALL = { portrait: '1024x1536', square: '1024x1024' };
const at = (quality: string, ...models: string[]): Recipe[] =>
  models.map((model) => ({ model, quality, sizes: TALL }));

const RECIPES: Record<Grade, Recipe[]> = {
  fast: [
    ...at('low', 'gpt-image-1-mini', 'gpt-image-2.5-flare', 'gpt-image-2'),
    { model: 'dall-e-2', sizes: { portrait: '512x512', square: '512x512' } },
  ],
  normal: at('low', 'gpt-image-2.5-flare', 'gpt-image-2', 'gpt-image-1.5', 'gpt-image-1-mini'),
  best: at('high', 'gpt-image-2.5-sunburst', 'gpt-image-2.5-flare', 'gpt-image-2', 'gpt-image-1.5'),
};

/** The model that last drew for each grade, so a gone one is asked about once. */
const working = new Map<Grade, string>();

/** The vendor saying this model is not one it will run for this key — not that the prompt was wrong. */
function modelUnavailable(status: number, message: string): boolean {
  return (
    status === 404 ||
    ((status === 400 || status === 403) &&
      /model|does not exist|not found|not have access|deprecated|retired|shut ?down|unsupported/i.test(message) &&
      !/safety|policy|moderation/i.test(message))
  );
}

export async function getGrade(): Promise<Grade> {
  return ((await SecureStore.getItemAsync(DRAWING)) as Grade) ?? 'normal';
}

export async function setGrade(grade: Grade) {
  await SecureStore.setItemAsync(DRAWING, grade);
}

/** The one instruction an image model forgets unless it is repeated. */
export const NO_TEXT =
  'No text, no lettering, no title, no author name, no logo, and no writing of any kind anywhere in the image.';

/**
 * The opposite, and only ever for a cover: a cover without its title on it is
 * a picture. Spelled out word by word because an image model left to infer
 * lettering invents it — a plausible-looking title that is not the book's.
 */
export function lettering(title: string, author: string | null): string {
  const byline = author?.trim()
    ? ` Beneath it, smaller, the author name exactly: "${author.trim()}".`
    : '';
  return (
    `Set the title on the cover in clean, legible type, spelled exactly: "${title.trim()}".` +
    `${byline} Keep the lettering clear of the focal subject and inside the margins. ` +
    'No other words anywhere in the image.'
  );
}

export class NoImageKey extends Error {
  constructor() {
    super('no-image-key');
  }
}

/** The first OpenAI key there is; the others cannot draw. */
async function drawingKey(): Promise<{ secret: string; baseUrl: string } | null> {
  // Belt as well as braces. The China build cannot offer OpenAI as a vendor,
  // so no key for it can be added there — but a library restored from a
  // backup made elsewhere carries the keys' index, and this is the line that
  // makes that harmless.
  if (isChinaStore()) return null;
  for (const entry of await listKeys()) {
    if (entry.vendorId !== 'openai') continue;
    const secret = await SecureStore.getItemAsync(`ai.key.${entry.id}`);
    const vendor = vendorById(entry.vendorId);
    if (secret && vendor) return { secret, baseUrl: vendor.baseUrl };
  }
  return null;
}

export async function drawImage(
  prompt: string,
  shape: Shape = 'portrait',
  signal?: AbortSignal
): Promise<Uint8Array> {
  const key = await drawingKey();
  if (!key) throw new NoImageKey();

  const grade = await getGrade();
  const recipes = RECIPES[grade];
  const first = Math.max(0, recipes.findIndex((recipe) => recipe.model === working.get(grade)));
  let payload: { data?: { b64_json?: string; url?: string }[]; error?: { message?: string } } = {};
  let lastProblem = '';
  for (const recipe of [...recipes.slice(first), ...recipes.slice(0, first)]) {
    const response = await fetch(`${key.baseUrl}/images/generations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key.secret}` },
      body: JSON.stringify({
        model: recipe.model,
        prompt,
        size: recipe.sizes[shape],
        // The older model has no quality of its own, and refuses the field.
        ...(recipe.quality ? { quality: recipe.quality } : { response_format: 'b64_json' }),
        n: 1,
      }),
      signal,
    });
    payload = ((await response.json().catch(() => null)) ?? {}) as typeof payload;
    if (response.ok) {
      working.set(grade, recipe.model);
      break;
    }
    lastProblem = payload.error?.message ?? `${response.status}`;
    if (!modelUnavailable(response.status, lastProblem)) throw new Error(lastProblem);
    payload = {};
  }
  if (!payload.data) throw new Error(lastProblem || 'nothing came back');

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
