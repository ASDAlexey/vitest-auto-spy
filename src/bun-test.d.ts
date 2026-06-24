/**
 * Minimal ambient declaration for `bun:test` — just the `mock` factory the Bun
 * entry injects into {@link createBunMockAdapter}. Avoids a dependency on
 * `@types/bun` purely to type a single import that is external at build time.
 */
declare module 'bun:test' {
  export const mock: import('./lib/bun-adapter').BunTestApi['mock'];
}
