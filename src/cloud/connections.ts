import * as SecureStore from 'expo-secure-store';
import { Bucket } from './client';
import type { Connection } from './providers';

const INDEX = 'cloud.connections';
const secretKey = (id: string) => `cloud.secret.${id}`;

/** Same rule as an AI key: the secret is pinned to this device and never synced. */
const SECRET_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export type Secret = { accessKeyId: string; secretAccessKey: string; sessionToken?: string };

export async function listConnections(): Promise<Connection[]> {
  const raw = await SecureStore.getItemAsync(INDEX);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeIndex(connections: Connection[]) {
  await SecureStore.setItemAsync(INDEX, JSON.stringify(connections));
}

export async function getSecret(id: string): Promise<Secret | null> {
  const raw = await SecureStore.getItemAsync(secretKey(id));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Save is the test. A connection that can't list its own prefix isn't a
 * connection, and finding that out at the first backup — hours later, with no
 * one watching — is how silent data loss starts.
 */
export async function saveConnection(
  connection: Omit<Connection, 'id' | 'createdAt'>,
  secret: Secret
): Promise<Connection> {
  const id = `cloud-${Date.now().toString(36)}`;
  const candidate: Connection = { ...connection, id, createdAt: Date.now() };
  await new Bucket(candidate, secret).list();
  await SecureStore.setItemAsync(secretKey(id), JSON.stringify(secret), SECRET_OPTIONS);
  await writeIndex([...(await listConnections()), candidate]);
  return candidate;
}

export async function updateConnection(id: string, changes: Partial<Connection>) {
  const connections = await listConnections();
  await writeIndex(
    connections.map((connection) =>
      connection.id === id ? { ...connection, ...changes, id } : connection
    )
  );
}

export async function removeConnection(id: string) {
  await SecureStore.deleteItemAsync(secretKey(id));
  await writeIndex((await listConnections()).filter((connection) => connection.id !== id));
}

export async function bucketFor(id: string): Promise<Bucket | null> {
  const connection = (await listConnections()).find((entry) => entry.id === id);
  const secret = await getSecret(id);
  return connection && secret ? new Bucket(connection, secret) : null;
}
