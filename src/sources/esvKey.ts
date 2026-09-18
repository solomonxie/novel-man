import * as SecureStore from 'expo-secure-store';

import { cleanToken } from './esv';

/**
 * The key is this device's, like every other secret here: never synced, never
 * in a backup, gone when the app is. Kept apart from the client so the client
 * is a function of its inputs and can be run against fixtures outside the app.
 */
const KEY = 'esv.apiKey';

const SECRET_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export async function esvKey(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY, SECRET_OPTIONS);
}

export async function saveEsvKey(token: string): Promise<void> {
  await SecureStore.setItemAsync(KEY, cleanToken(token), SECRET_OPTIONS);
}

export async function forgetEsvKey(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY, SECRET_OPTIONS);
}
