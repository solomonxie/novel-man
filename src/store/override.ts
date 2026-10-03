/**
 * Forces `storefront()` to `'china'` on this install, bypassing the real
 * StoreKit answer. For testing only — `make ios STORE=china` writes `'china'`
 * here, builds, installs and puts `'world'` back, so the China app can be seen
 * on a Canadian Apple ID without a sandbox tester account. `make release`
 * always ships what is committed here, which is `'world'`: production reads
 * the real storefront, never this file. See `storefront.ts`.
 */
// Typed as a plain string on purpose: as a literal, TypeScript narrows it to
// the committed value and calls the comparison against the other one dead.
export const STORE: string = 'world';
