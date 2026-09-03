/**
 * Minimal `jest` and `jasmine` globals, backed by Vitest's own mock factory.
 *
 * `jest-auto-spies` and `jasmine-auto-spies` build their doubles out of whatever mock their host
 * runner provides, and neither runner is here. Handing them `vi.fn()` is not a compromise on the
 * comparison — it is what makes the comparison mean anything. All four libraries then create the
 * same underlying mock, so the runner's per-mock cost is a constant shared by every arm and what
 * the numbers separate is each library's own work on top of it. Measuring `jest-auto-spies` on Jest
 * against this package on Vitest would report the difference between two runners.
 *
 * The surface here is deliberately only what those two packages actually call. `jasmine.createSpy`
 * returns a spy whose `.and` is the object `@hirez_io/auto-spies-core` hangs its helpers on, which
 * is why jasmine's configuration API reads `spy.method.and.calledWith(x).returnValue(y)` while the
 * jest and Vitest ones read `spy.method.calledWith(x).mockReturnValue(y)`.
 */
import { vi } from 'vitest';

type Implementation = (...args: unknown[]) => unknown;

interface JasmineAnd {
  callFake: (implementation: Implementation) => JasmineAnd;
}

interface JasmineSpy {
  (...args: unknown[]): unknown;
  and: JasmineAnd;
}

function createJasmineSpy(name: string): JasmineSpy {
  const spy = vi.fn().mockName(name) as unknown as JasmineSpy;

  const and: JasmineAnd = {
    callFake(implementation) {
      (spy as unknown as { mockImplementation: (fn: Implementation) => void }).mockImplementation(implementation);

      return and;
    },
  };

  spy.and = and;

  return spy;
}

/** Install the globals. Idempotent, and safe to call at module scope before any `bench()` body runs. */
export function installRunnerGlobals(): void {
  const scope = globalThis as unknown as Record<string, unknown>;

  scope['jest'] ??= { fn: vi.fn, spyOn: vi.spyOn };
  scope['jasmine'] ??= { createSpy: createJasmineSpy };
}
