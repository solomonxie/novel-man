/**
 * The storefront this build is for. Rewritten by `make ios STORE=china`, which
 * puts it back afterwards — so what is committed here is what ships unless
 * somebody deliberately asks for the other one, and a dirty tree is never how
 * you find out which you built.
 *
 * `world` or `china`. See `storefront.ts` for why this is a build-time
 * constant and not a setting.
 */
// Typed as a plain string on purpose: as a literal, TypeScript narrows it to
// the committed value and calls the comparison against the other one dead.
export const STORE: string = 'world';
