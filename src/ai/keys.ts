import * as SecureStore from 'expo-secure-store';
import { chat, type ChatMessage } from './client';
import { vendorById } from './vendors';

export type StoredKey = { id: string; vendorId: string; requests: number };
export type Strategy = 'sequential' | 'round-robin';

const INDEX = 'ai.keys.index';
const STRATEGY = 'ai.keys.strategy';
const secretKey = (id: string) => `ai.key.${id}`;

/**
 * The secret lives in the Keychain and is pinned to this device, so it never
 * rides an iCloud Keychain sync to another phone — or into a backup.
 */
const SECRET_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export async function listKeys(): Promise<StoredKey[]> {
  const raw = await SecureStore.getItemAsync(INDEX);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeIndex(keys: StoredKey[]) {
  await SecureStore.setItemAsync(INDEX, JSON.stringify(keys));
}

export async function getStrategy(): Promise<Strategy> {
  return ((await SecureStore.getItemAsync(STRATEGY)) as Strategy) ?? 'sequential';
}

export async function setStrategy(strategy: Strategy) {
  await SecureStore.setItemAsync(STRATEGY, strategy);
}

/** Save is the test: one real cheap request, and nothing is stored unless it works. */
export async function addKey(vendorId: string, apiKey: string): Promise<StoredKey> {
  const vendor = vendorById(vendorId);
  if (!vendor) throw new Error('unknown-vendor');
  await chat(vendor, apiKey.trim(), [{ role: 'user', content: 'Reply with OK.' }]);

  const id = `${vendorId}-${Date.now().toString(36)}`;
  await SecureStore.setItemAsync(secretKey(id), apiKey.trim(), SECRET_OPTIONS);
  const keys = await listKeys();
  const entry: StoredKey = { id, vendorId, requests: 1 };
  await writeIndex([...keys, entry]);
  return entry;
}

export async function removeKey(id: string) {
  await SecureStore.deleteItemAsync(secretKey(id));
  await writeIndex((await listKeys()).filter((key) => key.id !== id));
}

/** Order is the fallback order, so moving a row is a real setting. */
export async function moveKey(id: string, direction: -1 | 1) {
  const keys = await listKeys();
  const at = keys.findIndex((key) => key.id === id);
  const to = at + direction;
  if (at < 0 || to < 0 || to >= keys.length) return;
  [keys[at], keys[to]] = [keys[to], keys[at]];
  await writeIndex(keys);
}

let roundRobinCursor = 0;

/**
 * Tries each configured key in turn so one dead key doesn't take AI features
 * down. Sequential is sticky — it stays on the first key until that key itself
 * errors. Round-robin advances every call, win or lose, to spread load.
 */
export async function runChat(messages: ChatMessage[]): Promise<string> {
  const keys = await listKeys();
  if (!keys.length) throw new Error('no-keys');
  const strategy = await getStrategy();
  const start = strategy === 'round-robin' ? roundRobinCursor++ % keys.length : 0;

  let lastError: unknown;
  for (let offset = 0; offset < keys.length; offset++) {
    const entry = keys[(start + offset) % keys.length];
    const vendor = vendorById(entry.vendorId);
    const secret = await SecureStore.getItemAsync(secretKey(entry.id));
    if (!vendor || !secret) continue;
    try {
      const answer = await chat(vendor, secret, messages);
      entry.requests += 1;
      await writeIndex(keys);
      return answer;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error('no-usable-key');
}

export async function hasAnyKey(): Promise<boolean> {
  return (await listKeys()).length > 0;
}
