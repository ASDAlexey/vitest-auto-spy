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
  format: ['esm', 'cjs'] as const,
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
    // Entry points: the framework-agnostic core (default Vitest adapter), the Bun and `node:test`
    // runtime variants, the optional rxjs layer, the console spies, and the optional Angular
    // TestBed helpers.
    entry: [
      'src/index.ts',
      'src/bun.ts',
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
    clean: true,
  },
  {
    ...SHARED,
    // `bun-angular` is ESM-only: it awaits its DOM registrar at the top level, and top-level await
    // has no CommonJS form. Nothing is lost — it is loaded as a `bun test` preload, and Bun runs
    // ESM natively. `clean` stays off so this pass does not wipe the first one's output.
    entry: ['src/bun-angular.ts'],
    format: ['esm'],
    clean: false,
  },
]);
