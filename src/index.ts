import { useVitestAdapter } from './lib/use-vitest-adapter';

// Install the default, zero-config mock adapter. The core itself is
// runtime-agnostic and never imports Vitest directly; importing this entry is
// what makes `vitest-auto-spy` "just work" on Vitest. Runtime entries
// (`vitest-auto-spy/bun`, `…/node`) register their own adapter over the same core.
useVitestAdapter();

export * from './auto-spy';
