import {
  ACCESSIBLE,
  getInternetCredentials,
  resetInternetCredentials,
  setInternetCredentials,
} from 'react-native-keychain';

/**
 * A key-value store in the iOS keychain, which is where the app's secrets have
 * always lived: API keys, cloud credentials, the one email a feed needs.
 *
 * Each secret is its own keychain entry keyed by name, so one can be replaced
 * or forgotten without reading the others — the shape the call sites already
 * assume.
 */

export type SecretOptions = { keychainAccessible?: string };

/** Never leaves the device and never reaches a backup, which is the point. */
export const WHEN_UNLOCKED_THIS_DEVICE_ONLY = ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY;

// The options argument is accepted and ignored on reads: what a secret is
// protected by was decided when it was written.
export async function getItemAsync(key: string, _options?: SecretOptions): Promise<string | null> {
  const found = await getInternetCredentials(key);
  return found ? found.password : null;
}

export async function setItemAsync(
  key: string,
  value: string,
  options?: SecretOptions
): Promise<void> {
  await setInternetCredentials(key, key, value, {
    accessible: (options?.keychainAccessible as ACCESSIBLE) ?? ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function deleteItemAsync(key: string, _options?: SecretOptions): Promise<void> {
  await resetInternetCredentials({ server: key });
}
