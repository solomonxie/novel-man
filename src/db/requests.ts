import { db, newId } from './index';
import { estimateTokensOf } from '../ai/tokens';

export type AiRequest = {
  id: string;
  key_id: string;
  vendor_id: string;
  model: string;
  /** JSON `ChatMessage[]` — exactly what went out, minus the credential. */
  prompt: string;
  response: string | null;
  error: string | null;
  input_tokens: number;
  output_tokens: number;
  usd: number;
  created_at: number;
};

/** A chapter's prompt is kilobytes; five hundred of them is a database. */
const MAX_ROWS = 300;

export async function recordRequest(input: {
  keyId: string;
  vendorId: string;
  model: string;
  messages: { role: string; content: string }[];
  price: { in: number; out: number };
  response?: string;
  error?: string;
}) {
  const database = await db();
  const inputTokens = input.messages.reduce(
    (total, message) => total + estimateTokensOf(message.content),
    0
  );
  const outputTokens = input.response ? estimateTokensOf(input.response) : 0;
  await database.runAsync(
    `INSERT INTO ai_requests
       (id, key_id, vendor_id, model, prompt, response, error,
        input_tokens, output_tokens, usd, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    newId(),
    input.keyId,
    input.vendorId,
    input.model,
    JSON.stringify(input.messages),
    input.response ?? null,
    input.error ?? null,
    inputTokens,
    outputTokens,
    (inputTokens * input.price.in + outputTokens * input.price.out) / 1_000_000,
    Date.now()
  );
  await database.runAsync(
    `DELETE FROM ai_requests WHERE id IN (
       SELECT id FROM ai_requests ORDER BY created_at DESC LIMIT -1 OFFSET ?)`,
    MAX_ROWS
  );
}

export async function listRequests(keyId: string): Promise<AiRequest[]> {
  const database = await db();
  return database.getAllAsync<AiRequest>(
    'SELECT * FROM ai_requests WHERE key_id = ? ORDER BY created_at DESC',
    keyId
  );
}

export async function getRequest(id: string): Promise<AiRequest | null> {
  const database = await db();
  return database.getFirstAsync<AiRequest>('SELECT * FROM ai_requests WHERE id = ?', id);
}

export async function clearRequests(keyId: string) {
  const database = await db();
  await database.runAsync('DELETE FROM ai_requests WHERE key_id = ?', keyId);
}
