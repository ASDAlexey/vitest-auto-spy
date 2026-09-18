// The one list of specifiers this package never bundles, and the one rule every measuring script
// uses to keep somebody else's code out of its numbers.
//
// It used to be four copies: `tsup.config.ts`, `cold-import.mjs`, `size-entries.mjs` and
// `size-badge.mjs` each carried a hand-maintained array, and they had already drifted —
// `@angular/forms` reached the build list when `/signal-forms` shipped and never reached
// `cold-import.mjs`, so the module-graph baseline for that entry recorded 274 233 B of Angular
// forms against 5.7 kB of this package, and the 2 % tolerance was wider than the entry itself.
//
// Two exports, because the build and the measurements need different things:
//
//   * `PEER_EXTERNALS` — what tsup must not bundle. An explicit list, because a build cannot
//     externalise "everything bare": `src/lib/**` imports nothing by bare specifier that is not a
//     peer, and a typo in an import has to fail the build rather than silently become an external.
//   * `externalizeBareImports` — the rule the measuring scripts want. Anything not relative is
//     somebody else's code (this package ships zero runtime dependencies, which `check-dist.mjs`
//     enforces), so a measurement excludes it without naming it and cannot drift again.

/** Peers and host runtimes tsup keeps out of the bundles. Every one of them is a peer or a built-in. */
export const PEER_EXTERNALS = [
  // The three specifiers of the optional second peer. `vitest-auto-spy/angular-http` is the only
  // entry that reaches them, and bundling `@angular/common` would both bloat the entry and defeat
  // the point of keeping the peer optional.
  '@angular/common',
  '@angular/common/http',
  '@angular/common/http/testing',
  '@angular/compiler',
  '@angular/core',
  // A bundled copy would carry its own reactive-graph state, and a signal written through one copy
  // would not notify a consumer reading through the other.
  '@angular/core/primitives/signals',
  '@angular/core/testing',
  // Both, not only `/testing`: `By` (from the root entry) is what a directive matcher queries with,
  // and bundling it would inline the whole of `@angular/platform-browser` into `dist/angular.js` —
  // a package every Angular consumer already has.
  '@angular/platform-browser',
  '@angular/platform-browser/testing',
  // The optional forms peer, reached only by `vitest-auto-spy/signal-forms`.
  '@angular/forms',
  '@angular/forms/signals',
  // The optional router peer, reached only by `vitest-auto-spy/angular-router`.
  '@angular/router',
  '@happy-dom/global-registrator',
  '@rstest/core',
  'bun',
  'bun:test',
  'jsdom',
  'node:test',
  'rxjs',
  'rxjs/operators',
  'vitest',
];

/**
 * esbuild plugin: everything the entry point itself does not own is external.
 *
 * Bare specifiers only — a relative path is this package's own code and stays in the measurement.
 */
export const externalizeBareImports = {
  name: 'externalize-bare-imports',
  setup(build) {
    build.onResolve({ filter: /^[^./]/ }, (args) => (args.kind === 'entry-point' ? undefined : { external: true }));
  },
};
