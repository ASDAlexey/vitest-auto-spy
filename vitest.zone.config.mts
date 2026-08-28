import { defineConfig } from 'vitest/config';

// A second, deliberately separate project: the one place in this repository where zone.js is
// loaded. The main suite (`vitest.config.mts`) stays zoneless — that is what the library itself is
// written against, and loading a zone there would hide exactly the failures this project exists to
// catch. Nothing is shared between the two but the source under test.
//
// zone.js is a devDependency and only a devDependency. The published `vitest-auto-spy/zone` entry
// imports none of it: it reads `globalThis.Zone`, which this project's setup file loads.
export default defineConfig({
  test: {
    // `globals: true` is a requirement of the patch, not a preference: it replaces the runner's
    // globals, and an imported `it` is a module binding nothing can reach.
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/zone-tests/setup.ts'],
    include: ['src/zone-tests/**/*.zone-test.ts'],
  },
});
