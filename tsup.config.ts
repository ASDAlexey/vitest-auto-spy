import type { Plugin } from 'esbuild';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'tsup';

const EXTERNAL = [
  // The three specifiers of the optional second peer. `vitest-auto-spy/angular-http` is the only
  // entry that reaches them, and bundling `@angular/common` would both bloat the entry and defeat
  // the point of keeping the peer optional.
  '@angular/common',
  '@angular/common/http',
  '@angular/common/http/testing',
  '@angular/compiler',
  '@angular/core',
  '@angular/core/testing',
  // Both, not only `/testing`: `By` (from the root entry) is what a directive matcher queries with,
  // and bundling it would inline the whole of `@angular/platform-browser` into `dist/angular.js` —
  // a package every Angular consumer already has.
  '@angular/platform-browser',
  '@angular/platform-browser/testing',
  '@happy-dom/global-registrator',
  'bun',
  'bun:test',
  'jsdom',
  'node:test',
  'rxjs',
  'rxjs/operators',
  'vitest',
];

// Ship no sourcemaps. Do NOT minify: supply-chain scanners (Socket, Snyk) flag minified published
// code as unauditable, and this is a dev-only dependency where a few extra KB never reach a
// production bundle.
const SHARED = {
  dts: true,
  sourcemap: false,
  minify: false,
  treeshake: true,
  external: EXTERNAL,
  // tsup strips the `node:` prefix by default, but `node:test` has no unprefixed form —
  // `import … from 'test'` would break at runtime. Keep the prefix.
  removeNodeProtocol: false,
};

const OUT_DIR = 'dist';

// Every ESM entry except the two below, built together so they share the emitted chunks.
const CHUNKED_ENTRIES = [
  'src/angular-http.ts',
  'src/bun.ts',
  'src/bun-angular.ts',
  'src/node.ts',
  'src/rxjs.ts',
  'src/console.ts',
  'src/jasmine.ts',
  'src/jasmine-compat.ts',
  'src/observer-spy.ts',
  'src/nestjs.ts',
  'src/react.ts',
  'src/vue.ts',
  'src/svelte.ts',
  'src/setup.ts',
  'src/zone.ts',
  'src/eslint-plugin.ts',
];

// The two entries built as one file each. Every consumer imports the root on every spec, and every
// Angular consumer imports both.
const SOLO_ENTRIES = ['src/index.ts', 'src/angular.ts'];

// tsup runs the array below with `Promise.all`, so `clean: true` on any one pass is a race against
// every other pass's output — and the passes here are no longer independent: three of them emit
// files that reference `dist/shared-state.js`. Wiping the directory once, here, before any pass
// starts, is the only ordering this config can actually guarantee.
rmSync(OUT_DIR, { recursive: true, force: true });

/**
 * The modules that hold module-scope state. Every entry a consumer loads at once has to reach *one*
 * copy of each, so all of them are pulled out into a single `dist/shared-state.js` that the ESM
 * entries import instead of inlining.
 *
 *   * `mock-adapter`       — `registeredAdapter`. Two copies is "No mock adapter registered", and
 *                            together with `observable-support` it is the historical
 *                            "Observable spies require rxjs" failure.
 *   * `observable-support` — `registeredSupport`, registered by `vitest-auto-spy/rxjs` and read by
 *                            every other entry.
 *   * `jasmine-support`    — `registeredSupport` for the `.and` / `.calls` layer, registered by
 *                            `vitest-auto-spy/jasmine` (or `…/jasmine-compat`) and read by the spy
 *                            factories every other entry uses. A second copy means a suite that
 *                            called `enableJasmineCompat()` still gets spies without `.and`.
 *   * `package-identity`   — the duplicate-copy report.
 *   * `expect-emission`    — `defaultTimeoutMs`, which `setEmissionTimeout()` documents as
 *                            process-wide. The root entry and `/angular` both export the pair and
 *                            an Angular consumer imports both, so a second copy would make
 *                            `setEmissionTimeout()` from the root silently miss `expectEmission()`
 *                            from `/angular`.
 *
 * Pinning them to one fixed filename, rather than leaving them to esbuild's code splitting, is what
 * makes the single-registry invariant structural instead of emergent — and it is what lets the
 * unsplit pass below exist at all, since a parallel pass cannot read another pass's chunk names.
 */
const SHARED_STATE_MODULES = ['expect-emission', 'jasmine-support', 'mock-adapter', 'observable-support', 'package-identity'] as const;

const SHARED_STATE_FILE = 'shared-state';

const SHARED_STATE_NAMESPACE = 'vitest-auto-spy-shared-state';

const SHARED_STATE_RE = new RegExp(String.raw`(?:^|[\\/])(?:${SHARED_STATE_MODULES.join('|')})(?:\.ts)?$`);

/**
 * Builds `dist/shared-state.js` out of a barrel that exists only in memory.
 *
 * tsup needs a real path for the entry (it globs them), so the pass names one of the four modules
 * and this plugin swaps that entry point for a generated re-export of all four. Everything the four
 * pull in is inlined here; nothing is externalised, or the file would not be self-contained.
 */
function bundleSharedState(): Plugin {
  return {
    name: 'vitest-auto-spy:bundle-shared-state',
    setup(build): void {
      build.onResolve({ filter: /./ }, (args) =>
        args.kind === 'entry-point' ? { path: SHARED_STATE_FILE, namespace: SHARED_STATE_NAMESPACE } : null,
      );

      build.onLoad({ filter: /./, namespace: SHARED_STATE_NAMESPACE }, () => ({
        contents: SHARED_STATE_MODULES.map((name) => `export * from './${name}';`).join('\n'),
        loader: 'ts' as const,
        resolveDir: resolve('src/lib'),
      }));
    },
  };
}

/**
 * Points every other ESM pass at `dist/shared-state.js` instead of letting it bundle a second copy
 * of the stateful modules. Every ESM entry sits at the root of `dist`, so the rewritten specifier
 * is the same for all of them.
 *
 * Deliberately not applied to the CommonJS pass: esbuild cannot code-split CommonJS, `node.cjs` is
 * self-contained on purpose, and a `require()` of an ESM file would fail outright.
 */
function useSharedState(): Plugin {
  return {
    name: 'vitest-auto-spy:use-shared-state',
    setup(build): void {
      build.onResolve({ filter: SHARED_STATE_RE }, (args) =>
        args.kind === 'entry-point' ? null : { path: `./${SHARED_STATE_FILE}.js`, external: true },
      );
    },
  };
}

export default defineConfig([
  {
    ...SHARED,
    // The one file the four stateful modules live in. `dts` is off: nothing imports this path by
    // hand, and each entry's own `.d.ts` carries the types already.
    entry: { [SHARED_STATE_FILE]: 'src/lib/mock-adapter.ts' },
    format: ['esm'] as const,
    splitting: false,
    dts: false,
    clean: false,
    esbuildPlugins: [bundleSharedState()],
  },
  {
    ...SHARED,
    // One ESM pass over these entries, so they share the emitted chunks: the core is bundled once
    // and each entry is a thin re-export of it. `bun-angular` used to be built in its own pass and
    // paid for that with a fully inlined copy of the core (45 kB of JS + 43 kB of types); folding
    // it in here cuts it to ~8 kB of each.
    //
    // `index` and `angular` are deliberately not here — see the pass below.
    entry: CHUNKED_ENTRIES,
    format: ['esm'] as const,
    clean: false,
    // Types for *all eighteen* ESM entries, not just the sixteen this pass bundles. The declaration
    // build has no reason to follow the JavaScript split — one pass over every entry keeps the
    // shared `.d.ts` chunks shared, where letting the unsplit pass below emit its own gave
    // `index.d.ts` and `angular.d.ts` a private copy of the type graph and cost ~106 kB.
    dts: { entry: [...CHUNKED_ENTRIES, ...SOLO_ENTRIES] },
    esbuildPlugins: [useSharedState()],
  },
  {
    ...SHARED,
    // `index` and `angular`, each one file plus `shared-state.js`.
    //
    // The cost of importing an entry is module count, not code volume: the same 58.8 kB bundled into
    // a single module costs 0.1 ms. The root reached the loader as 8 files and `angular` as 10, and
    // every Angular consumer pays for both on every spec. `splitting: false` collapses each entry to
    // one file; `useSharedState()` keeps the four stateful modules outside it, so there is still
    // exactly one registry.
    //
    // Measured under Node's native loader, before and after, on identical sources: the root entry
    // goes 3.2 → 2.4 ms and root + `angular` 4.7 → 3.7 ms, so **−0.8 ms and −1.0 ms per spec file**.
    // Treat those as a lower bound rather than the whole win — under Vitest each module additionally
    // goes through Vite's transform and SSR module-runner path, where per-module overhead is higher.
    // An earlier figure of 5.9 ms/file circulated from a Vitest-side harness; it could not be
    // reproduced here and is not claimed. The trade is +120 kB of `dist` in a dev-only dependency
    // that never reaches a production bundle.
    //
    // Only these two: full de-chunking of every entry costs +429 kB and duplicates the
    // registries. Every other entry keeps the shared chunks.
    entry: SOLO_ENTRIES,
    format: ['esm'] as const,
    splitting: false,
    // Declarations come from the pass above, over every entry at once.
    dts: false,
    clean: false,
    esbuildPlugins: [useSharedState()],
  },
  {
    ...SHARED,
    // CommonJS only where a `require()` can actually succeed, which is a much shorter list than it
    // looks. Two independent reasons rule the rest out:
    //
    //  1. **Vitest refuses to be required at all** (`Vitest cannot be imported in a CommonJS module
    //     using require()`), so every Vitest-backed entry — `index`, `angular`, `nestjs`, `react`,
    //     `vue`, `svelte`, `console`, `setup` — threw on the first line of its own `.cjs`. Those
    //     files could never load in any consumer; they were ~230 kB of unreachable output.
    //  2. **esbuild cannot code-split CommonJS**, so each `.cjs` is a self-contained bundle with its
    //     own copy of the `MockAdapter` / `ObservableSupport` registries. Requiring two entries gave
    //     two disconnected registries: `require('…/rxjs')` next to `require('…/node')` still failed
    //     with "Observable spies require rxjs". Only a *single* self-contained entry works in CJS.
    //
    // What survives is what is genuinely usable: `node` (a `node --test` suite written in CJS, used
    // on its own) and `eslint-plugin` (loaded by a CommonJS `eslint.config.cjs`, no registry
    // involved). `bun` is dropped too — Bun runs ESM natively and `bun test` files are ESM. And for
    // the same reason these two must stay self-contained, `useSharedState()` is not applied here.
    entry: ['src/node.ts', 'src/eslint-plugin.ts'],
    format: ['cjs'] as const,
    clean: false,
  },
  {
    ...SHARED,
    // The `vitest-auto-spy` executable — `doctor` and `init`. Its own pass, and deliberately not
    // part of the shared-chunk one: it imports nothing from the library core (the core loads
    // Vitest, which refuses to be imported outside a test run), and a `bin` that resolves a chunk
    // in a sibling directory is one more thing that can go wrong in a consumer's node_modules.
    // No `dts`: nobody imports a bin.
    entry: ['src/cli.ts'],
    format: ['esm'] as const,
    dts: false,
    clean: false,
    banner: { js: '#!/usr/bin/env node' },
    // npm sets the executable bit on `bin` targets at install time, but not for a local
    // `./dist/cli.js` or a `npm link`. One `chmod` here and both work.
    onSuccess: async (): Promise<void> => {
      const { chmodSync } = await import('node:fs');

      chmodSync('dist/cli.js', 0o755);
    },
  },
]);
