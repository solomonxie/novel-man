import { vendorById, type Vendor } from './vendors';

export type ChatMessage = { role: 'system' | 'user'; content: string };

/** One request shape per API family, not per vendor. */
export async function chat(vendor: Vendor, apiKey: string, messages: ChatMessage[]): Promise<string> {
  if (vendor.api === 'anthropic') return anthropic(vendor, apiKey, messages);
  if (vendor.api === 'google') return google(vendor, apiKey, messages);
  return openAICompatible(vendor, apiKey, messages);
}

async function openAICompatible(vendor: Vendor, apiKey: string, messages: ChatMessage[]) {
  const response = await fetch(`${vendor.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: vendor.cheapModel, max_tokens: 64, messages }),
  });
  const body = await response.json();
  if (!response.ok) throw new AiError(body?.error?.message ?? response.status, body?.error?.code);
  return body?.choices?.[0]?.message?.content ?? '';
}

async function anthropic(vendor: Vendor, apiKey: string, messages: ChatMessage[]) {
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
  const response = await fetch(`${vendor.baseUrl}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: vendor.cheapModel,
      max_tokens: 64,
      system: system || undefined,
      messages: messages.filter((m) => m.role !== 'system'),
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new AiError(body?.error?.message ?? response.status, body?.error?.type);
  return body?.content?.[0]?.text ?? '';
}

async function google(vendor: Vendor, apiKey: string, messages: ChatMessage[]) {
  const response = await fetch(
    `${vendor.baseUrl}/models/${vendor.cheapModel}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: messages.map((m) => ({ role: 'user', parts: [{ text: m.content }] })),
        generationConfig: { maxOutputTokens: 64 },
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
