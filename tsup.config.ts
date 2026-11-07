import type { Plugin } from 'esbuild';
import { rmSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { defineConfig } from 'tsup';

// One list, shared with the scripts that measure this build — see scripts/externals.mjs for why it
// is not four hand-copied arrays any more.
import { PEER_EXTERNALS } from './scripts/externals.mjs';
import { planHostedEntries } from './scripts/host-entries.mjs';

// Library entries are never minified: whitespace minification drops the `/* @__PURE__ */` marks the
// consumer's bundler needs (+11.6 % min+gzip on `/setup`). Only the CLI and ESLint plugin are (DECISIONS.md).
const SHARED = {
  dts: true,
  sourcemap: false,
  minify: false,
  treeshake: true,
  external: PEER_EXTERNALS,
  // tsup strips the `node:` prefix by default, but `node:test` has no unprefixed form —
  // `import … from 'test'` would break at runtime. Keep the prefix.
  removeNodeProtocol: false,
};

const OUT_DIR = 'dist';

// Every ESM entry except the solo ones below, built together so they share the emitted chunks.
const CHUNKED_ENTRIES = [
  'src/angular-diagnostics.ts',
  'src/angular-doubles.ts',
  'src/angular-matchers.ts',
  'src/angular-http.ts',
  'src/angular-router.ts',
  'src/bun.ts',
  'src/bun-angular.ts',
  'src/rstest.ts',
  'src/rxjs.ts',
  'src/jasmine-compat.ts',
  'src/observer-spy.ts',
  'src/signal-forms.ts',
  'src/zone.ts',
];

// `src/eslint-plugin.ts` is built once, as CommonJS, and `dist/eslint-plugin.js` is a five-line ESM
// re-export of it. The rules are ~80 kB of AST-walking that ESLint loads once per lint run and no
// spec file ever imports, so building it twice was 80 695 B of `dist` — 11 % of the package — spent
// on a byte-for-byte second copy. The plugin's only export is `default`, which is exactly what CJS
// interop gives an ESM importer, so the wrapper is total.
const WRAPPED_CJS_ENTRIES = ['src/eslint-plugin.ts'];

// Entries loaded in every spec file, built as one file each: import cost is module count, not bytes.
// `/nestjs` and `/console` are Vitest-free, so they cannot be hosted on the root (DECISIONS.md).
const SOLO_ENTRIES = ['src/dom-stubs.ts', 'src/diagnostics.ts', 'src/setup.ts', 'src/node.ts', 'src/nestjs.ts', 'src/console.ts'];

// The root entry is solo too, and it hosts the core for the entries loaded beside it: each of these
// imports whatever the root already bundles from `./index.js` instead of inlining a second copy
// (scripts/host-entries.mjs). `/node` cannot join: it must not load Vitest.
const HOST_ENTRY = 'src/index.ts';

const HOSTED_ENTRIES = ['src/angular.ts', 'src/react.ts', 'src/vue.ts', 'src/svelte.ts', 'src/jasmine.ts'];

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
 *   * `emission-timeout`   — `defaultTimeoutMs`, which `setEmissionTimeout()` documents as
 *                            process-wide. The root entry and `/angular` both export the pair and
 *                            an Angular consumer imports both, so a second copy would make
 *                            `setEmissionTimeout()` from the root silently miss `expectEmission()`
 *                            from `/angular`.
 *
 * Only the *state* goes in, never the code that reads it: `expect-emission.ts` used to be the member
 * here, and it dragged its 10 kB of pure helper into every entry that imports this file — including
 * `/rxjs`, `/console`, `/nestjs`, `/setup`, `/jasmine`, `/jasmine-compat` and `/dom-stubs`, none of
 * which export an emission helper at all. Splitting the cell out (`emission-timeout.ts`) took
 * −10.0 kB off each of those seven graphs and −2.5 kB off the eight that do use it, with the module
 * count unchanged everywhere; measured 2026-09-04 with `scripts/cold-import.mjs`.
 *
 * Pinning them to one fixed filename, rather than leaving them to esbuild's code splitting, is what
 * makes the single-registry invariant structural instead of emergent — and it is what lets the
 * unsplit pass below exist at all, since a parallel pass cannot read another pass's chunk names.
 */
const SHARED_STATE_MODULES = ['emission-timeout', 'jasmine-support', 'mock-adapter', 'observable-support', 'package-identity'] as const;

const SHARED_STATE_FILE = 'shared-state';

const SHARED_STATE_NAMESPACE = 'vitest-auto-spy-shared-state';

const SHARED_STATE_RE = new RegExp(String.raw`(?:^|[\\/])(?:${SHARED_STATE_MODULES.join('|')})(?:\.ts)?$`);

/**
 * Builds `dist/shared-state.js` out of a barrel that exists only in memory.
 *
 * tsup needs a real path for the entry (it globs them), so the pass names one of the five modules
 * and this plugin swaps that entry point for a generated re-export of all five. Everything the five
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

function declarationEntries(sources: readonly string[]): Record<string, string> {
  return Object.fromEntries(sources.map((source) => [basename(source, '.ts'), source]));
}

const hosted = await planHostedEntries({
  root: '.',
  host: HOST_ENTRY,
  publicBarrel: 'src/auto-spy.ts',
  hostFile: 'index.js',
  satellites: HOSTED_ENTRIES,
  external: PEER_EXTERNALS,
  plugins: () => [useSharedState()],
  // Stateless tables the satellites mostly read entries of that the root never does: 9.7 kB of
  // Angular doc URLs would otherwise move into the root, which most specs load without `/angular`.
  inline: ['src/lib/docs-links.ts', 'src/lib/message-text.ts'],
});

export default defineConfig([
  {
    ...SHARED,
    // The one file the five stateful modules live in. `dts` is off: nothing imports this path by
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
    // Types for every ESM entry, not only the chunked ones, so the shared `.d.ts` chunks stay shared.
    // `core` names the shared declaration chunk; left to rollup it was named after `bun`.
    dts: {
      entry: {
        core: 'src/auto-spy.ts',
        ...declarationEntries([...CHUNKED_ENTRIES, HOST_ENTRY, ...HOSTED_ENTRIES, ...SOLO_ENTRIES, ...WRAPPED_CJS_ENTRIES]),
      },
    },
    esbuildPlugins: [useSharedState()],
  },
  {
    ...SHARED,
    // The solo entries, each one file plus `shared-state.js`; timings are in DECISIONS.md.
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
    // The root entry, one file plus `shared-state.js`, re-exporting under `ɵ` names what the
    // entries below take from it. None of those names reach a declaration.
    entry: { index: HOST_ENTRY },
    format: ['esm'] as const,
    splitting: false,
    dts: false,
    clean: false,
    esbuildPlugins: [useSharedState(), hosted.hostPlugin()],
  },
  {
    ...SHARED,
    // Their own code plus `index.js` and `shared-state.js`; `/react` and `/svelte` are a re-export.
    entry: HOSTED_ENTRIES,
    format: ['esm'] as const,
    splitting: false,
    dts: false,
    clean: false,
    esbuildPlugins: [useSharedState(), hosted.satellitePlugin()],
  },
  {
    ...SHARED,
    // CommonJS only where a `require()` can succeed: Vitest refuses `require()`, and esbuild cannot
    // split CJS, so each `.cjs` is self-contained with its own registries. `/node` is used alone.
    entry: ['src/node.ts'],
    format: ['cjs'] as const,
    clean: false,
  },
  {
    ...SHARED,
    // Minified like the CLI: loaded once per ESLint run, never bundled. The ESM half,
    // `dist/eslint-plugin.js`, is a re-export of it, written rather than built.
    entry: WRAPPED_CJS_ENTRIES,
    format: ['cjs'] as const,
    minify: true,
    keepNames: true,
    clean: false,
    onSuccess: async (): Promise<void> => {
      const { writeFileSync } = await import('node:fs');

      writeFileSync('dist/eslint-plugin.js', "import plugin from './eslint-plugin.cjs';\n\nexport { plugin as default };\n");
    },
  },
  {
    ...SHARED,
    // The executable: no library core (it loads Vitest) and no chunk shared with the library.
    // Minified with `keepNames`: it never reaches a consumer bundle, so no PURE marks are lost.
    entry: ['src/cli.ts'],
    format: ['esm'] as const,
    dts: false,
    minify: true,
    keepNames: true,
    clean: false,
    banner: { js: '#!/usr/bin/env node' },
    // `codemod` is loaded with `import()`, so `--version`, `doctor` and `init` do not parse it. Its
    // chunks are named for the CLI, apart from the library's `chunk-*` that `sideEffects` covers.
    esbuildOptions(options): void {
      options.chunkNames = 'cli-[hash]';
    },
    // npm sets the executable bit on `bin` targets at install time, but not for a local
    // `./dist/cli.js` or a `npm link`. One `chmod` here and both work.
    onSuccess: async (): Promise<void> => {
      const { chmodSync } = await import('node:fs');

      chmodSync('dist/cli.js', 0o755);
    },
  },
  {
    ...SHARED,
    // The reporter `vitest-auto-spy perf` attaches to the consumer's own Vitest run, in its own pass
    // because it must not carry the `#!` banner of the one above. The CLI hands Vitest an absolute
    // path, but a builder target or a CI script names it too, hence `./perf-reporter` in `exports`.
    entry: { 'perf-reporter': 'src/perf-reporter.ts', 'perf-profiler': 'src/perf-profiler.ts' },
    format: ['esm'] as const,
    splitting: false,
    dts: { entry: { 'perf-reporter': 'src/perf-reporter.ts' } },
    clean: false,
  },
]);
