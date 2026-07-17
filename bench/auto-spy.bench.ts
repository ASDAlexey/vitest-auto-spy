/**
 * Micro-benchmarks for the hot paths. Run with `npm run bench`.
 *
 * These guard the speed wins (e.g. the per-prototype method-name cache in
 * `createSpyFromClass`) against regressions and give comparable numbers vs.
 * other auto-spy libraries. They assert nothing — Vitest reports ops/sec.
 */
import { bench, describe } from 'vitest';

// Import the public entry (not `src/lib/*` directly) so the default Vitest mock
// adapter registers as a side effect — the same wiring real consumers get.
import { createAutoMock, createSpyFromClass } from '../src/index';

// A deliberately wide class: the more prototype methods, the more the
// method-name walk (and its cache) matters when the class is spied per test.
class WideService {
  m0(): number {
    return 0;
  }
  m1(): string {
    return '';
  }
  m2(a: number): number {
    return a;
  }
  m3(): boolean {
    return true;
  }
  m4(): void {}
  m5(): number[] {
    return [];
  }
  m6(): Record<string, unknown> {
    return {};
  }
  m7(): number {
    return 7;
  }
  m8(): number {
    return 8;
  }
  m9(): number {
    return 9;
  }
}

interface WideApi {
  m0(): number;
  m1(): string;
  m2(a: number): number;
  m3(): boolean;
}

describe('createSpyFromClass', () => {
  // Repeated spying of the SAME class is the realistic `beforeEach` pattern —
  // exercises the per-prototype method-name cache.
  bench('spy a wide class (repeated, same class)', () => {
    createSpyFromClass(WideService);
  });
});

describe('createAutoMock (type-only, lazy Proxy)', () => {
  bench('create + access 4 methods', () => {
    const mock = createAutoMock<WideApi>();
    mock.m0();
    mock.m1();
    mock.m2(1);
    mock.m3();
  });
});

describe('calledWith dispatch', () => {
  const spy = createSpyFromClass(WideService);
  spy.m2.calledWith(1).mockReturnValue(11);
  spy.m2.calledWith(2).mockReturnValue(22);

  bench('configured calledWith lookup (serialized args)', () => {
    spy.m2(1);
    spy.m2(2);
    spy.m2(3);
  });
});
