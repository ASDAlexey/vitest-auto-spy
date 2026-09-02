/**
 * The jasmine compatibility layer on the real `bun:test` runtime.
 *
 * `vitest-auto-spy/jasmine` cannot be imported here — that entry registers the Vitest adapter, and
 * registering it means importing `vitest`, which Bun cannot load. `vitest-auto-spy/jasmine-compat`
 * is the Vitest-free way in, and this file is the proof that the claim holds: the namespaces are
 * written against the `MockAdapter`, so the same `.and` / `.calls` / `.withArgs` a Vitest suite gets
 * are the ones Bun's `mock()` gets.
 */
import { describe, expect, it } from 'bun:test';

import { createSpyFromClass } from '../bun';
import { enableJasmineCompat } from '../jasmine-compat';

enableJasmineCompat();

class AccountService {
  get owner(): string {
    return 'real';
  }

  load(id: number): string {
    return `real-${id}`;
  }

  save(id: number): Promise<string> {
    return Promise.resolve(`real-${id}`);
  }
}

/** The namespaces are typed by `vitest-auto-spy/jasmine`, which this runtime cannot import. */
interface JasmineView {
  and: {
    identity: string;
    returnValue(value: unknown): unknown;
    callFake(fake: (...args: never[]) => unknown): unknown;
    callThrough(): unknown;
    throwError(value: unknown): unknown;
    resolveWith(value: unknown): void;
  };
  calls: { count(): number; argsFor(index: number): unknown[]; allArgs(): unknown[][]; reset(): void };
  withArgs(...args: unknown[]): { and: { returnValue(value: unknown): void } };
}

function asJasmine(spy: unknown): JasmineView {
  return spy as unknown as JasmineView;
}

describe('enableJasmineCompat on bun:test', () => {
  it('installs .and, and its strategies replace what the spy answers', () => {
    const service = createSpyFromClass(AccountService);
    const load = asJasmine(service.load);

    load.and.returnValue('stubbed');
    expect(service.load(1)).toBe('stubbed');

    load.and.callFake((id: number) => `faked-${id}`);
    expect(service.load(2)).toBe('faked-2');

    load.and.throwError('boom');
    expect(() => service.load(3)).toThrow('boom');

    expect(load.and.identity).toBe('load');
  });

  it('restores the library dispatch on callThrough, so calledWith decides again', () => {
    const service = createSpyFromClass(AccountService);
    const load = asJasmine(service.load);

    load.withArgs(7).and.returnValue('seven');
    expect(service.load(7)).toBe('seven');

    load.and.returnValue('flat');
    expect(service.load(7)).toBe('flat');

    load.and.callThrough();
    expect(service.load(7)).toBe('seven');
  });

  it('reads Bun’s own call bookkeeping through .calls', () => {
    const service = createSpyFromClass(AccountService);
    const load = asJasmine(service.load);

    service.load(1);
    service.load(2);

    expect(load.calls.count()).toBe(2);
    expect(load.calls.argsFor(0)).toEqual([1]);
    expect(load.calls.allArgs()).toEqual([[1], [2]]);

    load.calls.reset();
    expect(load.calls.count()).toBe(0);
  });

  it('re-publishes the promise helpers the spy already carries', async () => {
    const service = createSpyFromClass(AccountService);

    asJasmine(service.save).and.resolveWith('saved');

    expect(await service.save(1)).toBe('saved');
  });

  it('installs the namespaces on accessor spies too', () => {
    const service = createSpyFromClass(AccountService, { gettersToSpyOn: ['owner'] });

    asJasmine(service.accessorSpies.getters.owner).and.returnValue('spied');

    expect(service.owner).toBe('spied');
  });
});
