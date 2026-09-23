import * as SecureStore from '../storage/secrets';
import { listKeys } from './keys';
import { vendorById } from './vendors';
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
 * `normal` is the newer model at its cheapest pass: a picture judged in a
 * strip of 88-point thumbnails does not need the slowest setting, and the wait
 * is the thing that makes drawing feel broken rather than deliberate.
 *
 * `fast` is the only genuinely smaller option there is — the newer model will
 * not draw below 1024 on its short side, so going lower means the older one at
 * 512. It is quick and cheap and markedly worse at doing as it is told, which
 * is the whole point here: a tear mole named in the prompt is the first thing
 * it drops. `best` is the same model as `normal` at its slowest.
 */
export type Grade = 'fast' | 'normal' | 'best';

const DRAWING = 'ai.drawing.grade';

const RECIPES: Record<Grade, { model: string; quality?: string; sizes: Record<Shape, string> }> = {
  fast: { model: 'dall-e-2', sizes: { portrait: '512x512', square: '512x512' } },
  normal: {
    model: 'gpt-image-1',
    quality: 'low',
    sizes: { portrait: '1024x1536', square: '1024x1024' },
  },
  best: {
    model: 'gpt-image-1',
    quality: 'high',
    sizes: { portrait: '1024x1536', square: '1024x1024' },
  },
};

export async function getGrade(): Promise<Grade> {
  return ((await SecureStore.getItemAsync(DRAWING)) as Grade) ?? 'normal';
}

export async function setGrade(grade: Grade) {
  await SecureStore.setItemAsync(DRAWING, grade);
}

/** The one instruction an image model forgets unless it is repeated. */
export const NO_TEXT =
  'No text, no lettering, no title, no author name, no logo, and no writing of any kind anywhere in the image.';

export class NoImageKey extends Error {
  constructor() {
    super('no-image-key');
  }
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

export async function drawImage(
  prompt: string,
  shape: Shape = 'portrait',
  signal?: AbortSignal
): Promise<Uint8Array> {
  const key = await drawingKey();
  if (!key) throw new NoImageKey();

  const recipe = RECIPES[await getGrade()];
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
