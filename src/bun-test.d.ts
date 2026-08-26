/**
 * Minimal ambient declarations for the two Bun-only modules this package touches.
 *
 * `@types/bun` would type them in full, but it also declares Bun's globals, which collide with the
 * `vitest/globals` + `node` types the rest of the repo compiles against. What is declared here is
 * exactly what `src/bun.ts`, `src/bun-angular.ts` and the Bun suite under `src/bun-tests/` use —
 * nothing wider, so there is no second source of truth to drift.
 */

declare module 'bun:test' {
  export const mock: import('./lib/bun-adapter').BunTestApi['mock'];

  /** Synchronous assertions — the Jest-compatible subset this repo's own Bun suite asserts with. */
  export interface BunExpectation<T> {
    readonly not: BunExpectation<T>;
    readonly rejects: BunAsyncExpectation;
    readonly resolves: BunAsyncExpectation;
    toBe(expected: T): void;
    toBeDefined(): void;
    toBeInstanceOf(expected: unknown): void;
    toBeNull(): void;
    toBeTruthy(): void;
    toBeUndefined(): void;
    toContain(expected: unknown): void;
    toEqual(expected: unknown): void;
    toHaveBeenCalled(): void;
    toHaveBeenCalledTimes(times: number): void;
    toHaveBeenCalledWith(...args: unknown[]): void;
    toThrow(expected?: RegExp | string): void;
  }

  /** The `.resolves` / `.rejects` half: the same matchers, awaited. */
  export interface BunAsyncExpectation {
    readonly not: BunAsyncExpectation;
    toBe(expected: unknown): Promise<void>;
    toEqual(expected: unknown): Promise<void>;
    toThrow(expected?: RegExp | string): Promise<void>;
  }

  export function expect<T>(actual: T): BunExpectation<T>;
  export function describe(label: string, body: () => void): void;
  export function it(label: string, body: () => Promise<void> | void): void;
  export function beforeEach(body: () => Promise<void> | void): void;
  export function afterEach(body: () => Promise<void> | void): void;
}

declare module 'bun' {
  /** What an `onLoad` hook receives. Bun has no "fall through": a hook must always return contents. */
  export interface BunOnLoadArgs {
    path: string;
  }

  export interface BunOnLoadResult {
    contents: string;
    loader: 'js' | 'jsx' | 'ts' | 'tsx';
  }

  export interface BunPluginBuilder {
    onLoad(constraints: { filter: RegExp; namespace?: string }, callback: (args: BunOnLoadArgs) => BunOnLoadResult): void;
  }

  export function plugin(definition: { name: string; setup: (build: BunPluginBuilder) => void }): void;
}
