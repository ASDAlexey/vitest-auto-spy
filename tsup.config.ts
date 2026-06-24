import { defineConfig } from 'tsup';

export default defineConfig({
  // Three entry points: framework-agnostic core, the optional rxjs layer, and
  // the optional Angular TestBed helpers.
  entry: ['src/index.ts', 'src/rxjs.ts', 'src/angular.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  // Ship no sourcemaps and minify — non-functional bytes off every consumer.
  sourcemap: false,
  minify: true,
  treeshake: true,
  external: ['@angular/core', '@angular/core/testing', 'rxjs', 'rxjs/operators', 'vitest'],
});
