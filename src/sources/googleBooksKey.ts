import * as SecureStore from '../storage/secrets';

/**
 * A Google Books API key of the reader's own.
 *
 * Their keyless quota is zero a day now — every anonymous request comes back
 * 429 against a shared project — so the catalog with the best coverage of
 * anything published this century, and of anything not in English, has been
 * contributing nothing. A key is free and takes a minute, and for a Chinese
 * ISBN it is most of the difference between a cover and "no results".
 *
 * This device's, like every other secret here: never synced, never in a backup.
 * Kept out of `identify.ts` on purpose — that module is a function of its
 * inputs so the fixtures can run it outside the app.
 */
const KEY = 'googlebooks.apiKey';

const SECRET_OPTIONS: SecureStore.SecretOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export async function googleBooksKey(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY, SECRET_OPTIONS);
}

export async function saveGoogleBooksKey(value: string): Promise<void> {
  await SecureStore.setItemAsync(KEY, value.trim(), SECRET_OPTIONS);
}

export async function forgetGoogleBooksKey(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY, SECRET_OPTIONS);
}
