import * as SecureStore from '../storage/secrets';

/**
 * The address a Patrons Circle membership is under, which is the whole
 * credential — their feeds take it as the username and want no password. Kept
 * like every other secret here: this device only, never synced, never in a
 * backup, gone when the app is.
 */
const KEY = 'standardebooks.email';

const SECRET_OPTIONS: SecureStore.SecretOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export async function standardEbooksEmail(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY, SECRET_OPTIONS);
}

export async function saveStandardEbooksEmail(email: string): Promise<void> {
  await SecureStore.setItemAsync(KEY, email.trim(), SECRET_OPTIONS);
}

export async function forgetStandardEbooksEmail(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY, SECRET_OPTIONS);
}
