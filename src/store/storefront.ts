import { STORE } from './override';

/**
 * Which App Store this copy was built for.
 *
 * Mainland China licenses generative AI separately: a service has to be filed
 * with the CAC to be offered there, and an app that offers one that is not
 * gets rejected — which is what happened. So what the app offers has to differ
 * by storefront, and this is the one place that says which storefront it is.
 *
 * It is decided at build time, not at run time, and both halves of that matter:
 *
 * - **Not the device's region, locale, language or IP.** A reader with a
 *   Canadian Apple ID sitting in Shanghai gets the Canadian app, and a
 *   zh-Hans reader in Vancouver loses nothing. The question is which store
 *   sold the app, and nothing about the running device answers it.
 * - **Not a setting.** A switch that changes this would ship in the binary,
 *   and a reviewer who finds a "pretend I am not in China" toggle has found
 *   something worse than the original rejection. `make ios STORE=china` writes
 *   the value, builds, installs and puts the file back — so the author can see
 *   the China app on his own phone in Canada without a sandbox account, and
 *   without anything switchable reaching the store.
 */
export type Storefront = 'world' | 'china';

export function storefront(): Storefront {
  return STORE === 'china' ? 'china' : 'world';
}

export function isChinaStore(): boolean {
  return storefront() === 'china';
}
