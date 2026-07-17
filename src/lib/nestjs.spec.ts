/**
 * The NestJS helpers are a thin `{ provide, useValue }` wrapper plus a typed
 * `moduleRef.get` shorthand. No `@nestjs/*` package is imported: `injectSpy` is
 * exercised against a fake module ref typed only by the structural
 * {@link NestModuleRef} contract.
 */
import { describe, expect, it, vi } from 'vitest';

import { registerMockAdapter } from './mock-adapter';
import { type NestModuleRef, injectSpy, provideAutoSpy } from './nestjs';
import type { ClassType, Spy } from './types';
import { vitestMockAdapter } from './vitest-adapter';

// `provideAutoSpy` builds real spies through the IoC adapter registry; the lib
// helper itself never registers one (the `vitest-auto-spy/nestjs` entry does),
// so install the default Vitest adapter here.
registerMockAdapter(vitestMockAdapter);

class FooService {
  greet(name: string): string {
    return `hello ${name}`;
  }

  add(a: number, b: number): number {
    return a + b;
  }
}

describe('nestjs helpers', () => {
  it('provideAutoSpy returns { provide, useValue } with a working spy', () => {
    const provider = provideAutoSpy(FooService);

    expect(provider.provide).toBe(FooService);
    expect(vi.isMockFunction(provider.useValue.greet)).toBe(true);
    expect(vi.isMockFunction(provider.useValue.add)).toBe(true);

    provider.useValue.greet.mockReturnValue('hi');
    expect(provider.useValue.greet('ada')).toBe('hi');
    expect(provider.useValue.greet).toHaveBeenCalledWith('ada');
  });

  it('injectSpy resolves the value from a structural module ref', () => {
    const spy = provideAutoSpy(FooService).useValue;

    const moduleRef: NestModuleRef = {
      get: (token: unknown): unknown => (token === FooService ? spy : undefined),
    };

    const injected: Spy<FooService> = injectSpy(moduleRef, FooService as ClassType<FooService>);

    expect(injected).toBe(spy);
    expect(vi.isMockFunction(injected.add)).toBe(true);
  });
});
