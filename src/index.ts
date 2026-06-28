import { registerMockAdapter } from './lib/mock-adapter';
import { vitestMockAdapter } from './lib/vitest-adapter';

// Install the default, zero-config mock adapter. The core itself is
// runtime-agnostic and never imports Vitest directly; importing this entry is
// what makes `vitest-auto-spy` "just work" on Vitest. Future entries
// (`vitest-auto-spy/bun`, `…/node`) register their own adapter over the same core.
registerMockAdapter(vitestMockAdapter);

export * from './auto-spy';
