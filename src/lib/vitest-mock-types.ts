import type { Mock, MockInstance } from 'vitest';

// Re-exported for its declaration only by the entries that load Vitest, so `Spy<T>` is built on
// Vitest's own mock types wherever one of them is in the program; see `./mock-types`.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- must match the declaration in `./mock-types` exactly.
  interface VitestAutoSpyMockTypes<T extends (...args: any[]) => any> {
    vitest: { mock: Mock<T>; instance: MockInstance<T> };
  }
}

export {};
