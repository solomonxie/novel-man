/**
 * USD per million tokens. Published prices move, so this is what an estimate
 * is built from and is always labeled as one.
 */
export type Model = { id: string; name: string; price: { in: number; out: number } };

/** Vendors are data, not branches — adding one is a row. */
export type Vendor = {
  id: string;
  name: string;
  keyHint: string;
  consoleUrl: string;
  /** OpenAI-shaped APIs share one client; only real shape differences get their own. */
  api: 'openai' | 'anthropic' | 'google';
  baseUrl: string;
  /**
   * Cheapest first: the head is the default a new key runs on, and the rest are
   * what a key can be moved to when the cheap one reads a chapter badly.
   */
  models: Model[];
};

export const vendors: Vendor[] = [
  {
    id: 'openai', name: 'OpenAI', keyHint: 'sk-…', api: 'openai',
    consoleUrl: 'https://platform.openai.com/api-keys',
    baseUrl: 'https://api.openai.com/v1',
    models: [
      { id: 'gpt-4o-mini', name: 'GPT-4o mini', price: { in: 0.15, out: 0.6 } },
      { id: 'gpt-4.1-mini', name: 'GPT-4.1 mini', price: { in: 0.4, out: 1.6 } },
      { id: 'gpt-4.1', name: 'GPT-4.1', price: { in: 2, out: 8 } },
      { id: 'gpt-4o', name: 'GPT-4o', price: { in: 2.5, out: 10 } },
    ],
  },
  {
    id: 'anthropic', name: 'Anthropic', keyHint: 'sk-ant-…', api: 'anthropic',
    consoleUrl: 'https://console.anthropic.com/settings/keys',
    baseUrl: 'https://api.anthropic.com/v1',
    models: [
      { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', price: { in: 1, out: 5 } },
      { id: 'claude-sonnet-5', name: 'Claude Sonnet 5', price: { in: 2, out: 10 } },
      { id: 'claude-opus-5', name: 'Claude Opus 5', price: { in: 5, out: 25 } },
    ],
  },
  {
    id: 'google', name: 'Google Gemini', keyHint: 'AIza…', api: 'google',
    consoleUrl: 'https://aistudio.google.com/apikey',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    models: [
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', price: { in: 0.1, out: 0.4 } },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', price: { in: 0.3, out: 2.5 } },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', price: { in: 1.25, out: 10 } },
    ],
  },
  {
    id: 'deepseek', name: 'DeepSeek', keyHint: 'sk-…', api: 'openai',
    consoleUrl: 'https://platform.deepseek.com/api_keys',
    baseUrl: 'https://api.deepseek.com/v1',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek Chat', price: { in: 0.27, out: 1.1 } },
      { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', price: { in: 0.55, out: 2.19 } },
    ],
  },
  {
    id: 'groq', name: 'Groq', keyHint: 'gsk_…', api: 'openai',
    consoleUrl: 'https://console.groq.com/keys',
    baseUrl: 'https://api.groq.com/openai/v1',
    models: [
      { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B', price: { in: 0.05, out: 0.08 } },
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', price: { in: 0.59, out: 0.79 } },
    ],
  },
  {
    id: 'mistral', name: 'Mistral', keyHint: '…', api: 'openai',
    consoleUrl: 'https://console.mistral.ai/api-keys',
    baseUrl: 'https://api.mistral.ai/v1',
    models: [
      { id: 'mistral-small-latest', name: 'Mistral Small', price: { in: 0.2, out: 0.6 } },
      { id: 'mistral-large-latest', name: 'Mistral Large', price: { in: 2, out: 6 } },
    ],
  },
  {
    id: 'xai', name: 'xAI', keyHint: 'xai-…', api: 'openai',
    consoleUrl: 'https://console.x.ai', baseUrl: 'https://api.x.ai/v1',
    models: [
      { id: 'grok-3-mini', name: 'Grok 3 mini', price: { in: 0.3, out: 0.5 } },
      { id: 'grok-3', name: 'Grok 3', price: { in: 3, out: 15 } },
    ],
  },
];

export function vendorById(id: string): Vendor | undefined {
  return vendors.find((vendor) => vendor.id === id);
}

/**
 * A model id the list has never heard of is still run — vendors ship models
 * faster than an app ships, and a typed id is the escape hatch. Only its price
 * has to be borrowed, and every price here is shown as an estimate anyway.
 */
export function modelFor(vendor: Vendor, id?: string | null): Model {
  const wanted = id?.trim();
  if (!wanted) return vendor.models[0];
  return (
    vendor.models.find((model) => model.id === wanted) ?? {
      id: wanted,
      name: wanted,
      price: vendor.models[0].price,
    }
  );
}
