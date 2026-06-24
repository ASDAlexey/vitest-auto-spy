import { defineConfig } from 'tsup';

export default defineConfig({
  // Entry points: the framework-agnostic core (default Vitest adapter), the Bun
  // and `node:test` runtime variants, the optional rxjs layer, and the optional
  // Angular TestBed helpers.
  entry: ['src/index.ts', 'src/bun.ts', 'src/node.ts', 'src/rxjs.ts', 'src/angular.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  // Ship no sourcemaps and minify — non-functional bytes off every consumer.
  sourcemap: false,
  minify: true,
  treeshake: true,
  external: ['@angular/core', '@angular/core/testing', 'bun:test', 'node:test', 'rxjs', 'rxjs/operators', 'vitest'],
  // tsup strips the `node:` prefix by default, but `node:test` has no unprefixed
  // form — `import … from 'test'` would break at runtime. Keep the prefix.
  removeNodeProtocol: false,
});
