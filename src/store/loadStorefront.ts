import { NativeModules } from 'react-native';

import { STORE } from './override';
import { setStorefront } from './storefront';

const { Storefront: Native } = NativeModules as {
  Storefront?: { countryCode(): Promise<string | null> };
};

/**
 * Resolves StoreKit's storefront and caches it in `storefront.ts`. Await
 * before the app renders — see `Navigator.tsx` — so every `isChinaStore()`
 * call after that, synchronous or not, answers for the real store.
 */
export async function loadStorefront(): Promise<void> {
  // `make ios STORE=china` forces this for a local install; never set by `make release`.
  if (STORE === 'china') {
    setStorefront('china');
    return;
  }
  try {
    const code = await Native?.countryCode();
    setStorefront(code === 'CHN' ? 'china' : 'world');
  } catch {
    setStorefront('world');
  }
}
