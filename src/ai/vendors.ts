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
   * Filed with the CAC, and so offerable on the China App Store.
   *
   * This is a fact about a company's paperwork, not about its technology, and
   * it is the whole reason the field exists: offering a generative service
   * that has not been filed is what got this app rejected there. Absent means
   * no, which is the safe direction — a vendor nobody has checked is not
   * offered in China.
   */
  filed?: true;
  /**
   * Cheapest first: the head is the default a new key runs on, and the rest are
   * what a key can be moved to when the cheap one reads a chapter badly.
   */
  models: Model[];
  /**
   * Model ids this vendor no longer serves. Named rather than merely deleted,
   * because a key saved months ago still has one written against it: dropping
   * the row from `models` leaves that key pointed at a model that is gone, and
   * at DeepSeek a retired id does not answer at all.
   */
  retired?: string[];
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
    id: 'deepseek', name: 'DeepSeek', keyHint: 'sk-…', api: 'openai', filed: true,
    consoleUrl: 'https://platform.deepseek.com/api_keys',
    baseUrl: 'https://api.deepseek.com/v1',
    // `deepseek-chat` and `deepseek-flash` are retired, and a retired model id
    // at this vendor does not come back a 404 — the request simply never
    // answers. So the old default was a key that could not be saved and a run
    // that hung, with nothing on screen to say why.
    models: [
      { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', price: { in: 0.27, out: 1.1 } },
      { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', price: { in: 0.55, out: 2.19 } },
    ],
    retired: ['deepseek-chat', 'deepseek-flash'],
  },
  {
    id: 'qwen', name: '通义千问 Qwen', keyHint: 'sk-…', api: 'openai', filed: true,
    consoleUrl: 'https://bailian.console.aliyun.com/?apiKey=1',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: [
      { id: 'qwen-turbo', name: 'Qwen Turbo', price: { in: 0.05, out: 0.2 } },
      { id: 'qwen-plus', name: 'Qwen Plus', price: { in: 0.4, out: 1.2 } },
      { id: 'qwen-max', name: 'Qwen Max', price: { in: 1.6, out: 6.4 } },
    ],
  },
  {
    id: 'moonshot', name: '月之暗面 Kimi', keyHint: 'sk-…', api: 'openai', filed: true,
    consoleUrl: 'https://platform.moonshot.cn/console/api-keys',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: [
      { id: 'moonshot-v1-8k', name: 'Kimi 8K', price: { in: 1.7, out: 1.7 } },
      { id: 'moonshot-v1-32k', name: 'Kimi 32K', price: { in: 3.4, out: 3.4 } },
      { id: 'moonshot-v1-128k', name: 'Kimi 128K', price: { in: 8.4, out: 8.4 } },
    ],
  },
  {
    id: 'zhipu', name: '智谱 GLM', keyHint: '…', api: 'openai', filed: true,
    consoleUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: [
      { id: 'glm-4-flash', name: 'GLM-4 Flash', price: { in: 0.01, out: 0.01 } },
      { id: 'glm-4-air', name: 'GLM-4 Air', price: { in: 0.14, out: 0.14 } },
      { id: 'glm-4-plus', name: 'GLM-4 Plus', price: { in: 7, out: 7 } },
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
 * The vendors this build may offer.
 *
 * Only a filter, and only on the way in: a key already stored for a vendor
 * that is no longer offered keeps working, because the reader added it on a
 * device where it was offered and taking it away would be this app deciding
 * to lose their work. What the storefront governs is what the app *offers*,
 * which is what the rule is about.
 */
export function vendorsFor(storefront: 'world' | 'china'): Vendor[] {
  return storefront === 'china' ? vendors.filter((vendor) => vendor.filed) : vendors;
}

/**
 * A model id the list has never heard of is still run — vendors ship models
 * faster than an app ships, and a typed id is the escape hatch. Only its price
 * has to be borrowed, and every price here is shown as an estimate anyway.
 *
 * An id the list knows to be *dead* is the one exception, and it is not the
 * same case. Not knowing an id means it is probably newer than this build;
 * knowing it is retired means the request will not come back. So that one
 * falls back to the vendor's default rather than being honoured — which is
 * what unsticks a key saved before the model went away.
 */
export function modelFor(vendor: Vendor, id?: string | null): Model {
  const wanted = id?.trim();
  if (!wanted || vendor.retired?.includes(wanted)) return vendor.models[0];
  return (
    vendor.models.find((model) => model.id === wanted) ?? {
      id: wanted,
      name: wanted,
      price: vendor.models[0].price,
    }
  );
}
