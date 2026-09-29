import { defineConfig } from 'vitest/config';

/**
 * The type-level gate. `npm run typecheck` proves the sources compile; this proves what a *caller*
 * infers from them, which is a different claim and the one that has actually regressed here — see
 * the header of `src/type-tests/emission.test-d.ts`.
 *
 * Nothing runs: `typecheck.only` keeps Vitest from also collecting the runtime suite, and `include`
 * is empty for the same reason. The Angular plugin is not needed either — these files are compiled,
 * never executed.
 */
export default defineConfig({
  test: {
    include: [],
    typecheck: {
      enabled: true,
      // Pinned: `typescript` (6) and `typescript-7` both ship a `tsc` bin, and `.bin/tsc` follows install order.
      checker: 'node_modules/typescript/bin/tsc',
      only: true,
      include: ['src/type-tests/**/*.test-d.ts'],
      tsconfig: 'tsconfig.types.json',
    },
  },
});
