import { modelFor, vendorById, type Vendor } from './vendors';

export type ChatMessage = { role: 'system' | 'user'; content: string };

/**
 * `maxTokens` defaults to a key test's worth. Anything that wants a real answer
 * says how long it may be, and can hand in a signal to stop paying for it.
 * `model` defaults to the vendor's cheapest, which is what an unconfigured key
 * runs on.
 */
export type ChatOptions = { maxTokens?: number; model?: string; signal?: AbortSignal };

const TEST_TOKENS = 64;

/** One request shape per API family, not per vendor. */
export async function chat(
  vendor: Vendor,
  apiKey: string,
  messages: ChatMessage[],
  options: ChatOptions = {}
): Promise<string> {
  if (vendor.api === 'anthropic') return anthropic(vendor, apiKey, messages, options);
  if (vendor.api === 'google') return google(vendor, apiKey, messages, options);
  return openAICompatible(vendor, apiKey, messages, options);
}

async function openAICompatible(
  vendor: Vendor,
  apiKey: string,
  messages: ChatMessage[],
  options: ChatOptions
) {
  const response = await fetch(`${vendor.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    signal: options.signal,
    body: JSON.stringify({
      model: modelFor(vendor, options.model).id,
      max_tokens: options.maxTokens ?? TEST_TOKENS,
      messages,
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new AiError(body?.error?.message ?? response.status, body?.error?.code);
  return body?.choices?.[0]?.message?.content ?? '';
}

async function anthropic(
  vendor: Vendor,
  apiKey: string,
  messages: ChatMessage[],
  options: ChatOptions
) {
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
  const response = await fetch(`${vendor.baseUrl}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    signal: options.signal,
    body: JSON.stringify({
      model: modelFor(vendor, options.model).id,
      max_tokens: options.maxTokens ?? TEST_TOKENS,
      system: system || undefined,
      messages: messages.filter((m) => m.role !== 'system'),
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new AiError(body?.error?.message ?? response.status, body?.error?.type);
  return body?.content?.[0]?.text ?? '';
}

async function google(
  vendor: Vendor,
  apiKey: string,
  messages: ChatMessage[],
  options: ChatOptions
) {
  const response = await fetch(
    `${vendor.baseUrl}/models/${modelFor(vendor, options.model).id}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: options.signal,
      body: JSON.stringify({
        contents: messages.map((m) => ({ role: 'user', parts: [{ text: m.content }] })),
        generationConfig: { maxOutputTokens: options.maxTokens ?? TEST_TOKENS },
      }),
    }
  );
  const body = await response.json();
  if (!response.ok) throw new AiError(body?.error?.message ?? response.status, body?.error?.status);
  return body?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

/** The vendor's own code is what tells the user which field to fix. */
export class AiError extends Error {
  constructor(message: string | number, public code?: string) {
    super(String(message));
  }
}

export function clientFor(vendorId: string) {
  const vendor = vendorById(vendorId);
  if (!vendor) throw new Error(`unknown vendor ${vendorId}`);
  return vendor;
}
