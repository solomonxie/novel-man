/** Vendors are data, not branches — adding one is a row. */
export type Vendor = {
  id: string;
  name: string;
  keyHint: string;
  consoleUrl: string;
  /** OpenAI-shaped APIs share one client; only real shape differences get their own. */
  api: 'openai' | 'anthropic' | 'google';
  baseUrl: string;
  cheapModel: string;
};

export const vendors: Vendor[] = [
  {
    id: 'openai', name: 'OpenAI', keyHint: 'sk-…', api: 'openai',
    consoleUrl: 'https://platform.openai.com/api-keys',
    baseUrl: 'https://api.openai.com/v1', cheapModel: 'gpt-4o-mini',
  },
  {
    id: 'anthropic', name: 'Anthropic', keyHint: 'sk-ant-…', api: 'anthropic',
    consoleUrl: 'https://console.anthropic.com/settings/keys',
    baseUrl: 'https://api.anthropic.com/v1', cheapModel: 'claude-haiku-4-5-20251001',
  },
  {
    id: 'google', name: 'Google Gemini', keyHint: 'AIza…', api: 'google',
    consoleUrl: 'https://aistudio.google.com/apikey',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta', cheapModel: 'gemini-2.0-flash',
  },
  {
    id: 'deepseek', name: 'DeepSeek', keyHint: 'sk-…', api: 'openai',
    consoleUrl: 'https://platform.deepseek.com/api_keys',
    baseUrl: 'https://api.deepseek.com/v1', cheapModel: 'deepseek-chat',
  },
  {
    id: 'groq', name: 'Groq', keyHint: 'gsk_…', api: 'openai',
    consoleUrl: 'https://console.groq.com/keys',
    baseUrl: 'https://api.groq.com/openai/v1', cheapModel: 'llama-3.1-8b-instant',
  },
  {
    id: 'mistral', name: 'Mistral', keyHint: '…', api: 'openai',
    consoleUrl: 'https://console.mistral.ai/api-keys',
    baseUrl: 'https://api.mistral.ai/v1', cheapModel: 'mistral-small-latest',
  },
  {
    id: 'xai', name: 'xAI', keyHint: 'xai-…', api: 'openai',
    consoleUrl: 'https://console.x.ai', baseUrl: 'https://api.x.ai/v1', cheapModel: 'grok-3-mini',
  },
];

export function vendorById(id: string): Vendor | undefined {
  return vendors.find((vendor) => vendor.id === id);
}
