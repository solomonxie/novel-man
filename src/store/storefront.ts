/**
 * Which App Store sold this copy.
 *
 * Mainland China licenses generative AI separately: a service has to be filed
 * with the CAC to be offered there, and an app that offers one that is not
 * gets rejected — which is what happened. So what the app offers has to differ
 * by storefront, and this is the one place that says which storefront it is.
 *
 * One build ships to every country, so this is StoreKit's own answer — the
 * signed-in account's storefront, `countryCode` "CHN" for mainland China —
 * rather than anything about the device:
 *
 * - **Not the device's region, locale, language or IP.** A reader with a
 *   Canadian Apple ID sitting in Shanghai gets the Canadian app, and a
 *   zh-Hans reader in Vancouver loses nothing. The storefront is a property
 *   of the account that bought the app, not of the phone it is running on.
 * - **Not a setting.** Nothing in the app can change which store sold it.
 *
 * `loadStorefront.ts`, next to this file, is the one place that reaches
 * StoreKit and calls `setStorefront` below — kept apart because this module
 * is imported by the pure-logic files the standalone parse check compiles and
 * runs in plain Node (`npm run check:parse`), which cannot load `react-native`
 * itself. Nothing else needs to know the split exists: everywhere but
 * `Navigator.tsx` still just calls `isChinaStore()`.
 */
export type Storefront = 'world' | 'china';

let cached: Storefront = 'world';

export function setStorefront(value: Storefront) {
  cached = value;
}

export function storefront(): Storefront {
  return cached;
}

export function isChinaStore(): boolean {
  return cached === 'china';
}
