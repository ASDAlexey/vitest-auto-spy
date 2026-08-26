import { defineConfig } from 'tsup';

const EXTERNAL = [
  '@angular/compiler',
  '@angular/core',
  '@angular/core/testing',
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

export default defineConfig([
  {
    ...SHARED,
    // One ESM pass over every entry, so they share the emitted chunks: the core is bundled once and
    // each entry is a thin re-export of it. `bun-angular` used to be built in its own pass and paid
    // for that with a fully inlined copy of the core (45 kB of JS + 43 kB of types); folding it in
    // here cuts it to ~8 kB of each.
    entry: [
      'src/index.ts',
      'src/bun.ts',
      'src/bun-angular.ts',
      'src/node.ts',
      'src/rxjs.ts',
      'src/console.ts',
      'src/angular.ts',
      'src/nestjs.ts',
      'src/react.ts',
      'src/vue.ts',
      'src/svelte.ts',
      'src/setup.ts',
      'src/eslint-plugin.ts',
    ],
    format: ['esm'] as const,
    clean: true,
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
    // involved). `bun` is dropped too — Bun runs ESM natively and `bun test` files are ESM.
    // `clean` stays off so this pass does not wipe the first one's output.
    entry: ['src/node.ts', 'src/eslint-plugin.ts'],
    format: ['cjs'] as const,
    clean: false,
  },
]);
