/**
 * The core (`vitest-auto-spy`) must work with ZERO rxjs runtime support when `vitest-auto-spy/rxjs`
 * is never imported — the "rxjs not installed" paths.
 *
 * The IoC observable registry is process-wide, so this file cannot assume it runs before some other
 * spec imported `vitest-auto-spy/rxjs`: under `isolate: false` they all share one module graph.
 * Each test therefore empties the registry itself and puts back whatever was registered, which is
 * what makes these paths reachable regardless of file order or isolation.
 */
import { Observable, of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createSpyFromClass } from './index';
import { type ObservableSupport, getObservableSupport, registerObservableSupport, resetObservableSupport } from './lib/observable-support';

class Service {
  value$: Observable<number> = of(1);

  syncMethod(_a?: number): string {
    return 'real';
  }

  getPromise(): Promise<string> {
    return Promise.resolve('real');
  }

  getObs(): Observable<number> {
    return of(1);
  }
}

describe('core without vitest-auto-spy/rxjs', () => {
  let installedSupport: ObservableSupport | undefined;

  beforeEach(() => {
    installedSupport = getObservableSupport();
    resetObservableSupport();
  });

  afterEach(() => {
    resetObservableSupport();

    if (installedSupport) {
      registerObservableSupport(installedSupport);
    }
  });

  it('sync + promise + calledWith spies work without any observable support', async () => {
    const spy = createSpyFromClass(Service);

    spy.syncMethod.mockReturnValue('fake');
    expect(spy.syncMethod()).toBe('fake');

    // `calledWith` on a separate spy (native `mockReturnValue` above would
    // otherwise replace the whole vi.fn implementation).
    const matcher = createSpyFromClass(Service);
    matcher.syncMethod.calledWith(1).mockReturnValue('one');
    expect(matcher.syncMethod(1)).toBe('one');
    expect(matcher.syncMethod(2)).toBeUndefined();

    spy.getPromise.resolveWith('p');
    await expect(spy.getPromise()).resolves.toBe('p');
  });

  it('does not attach observable helpers to method spies', () => {
    const spy = createSpyFromClass(Service);

    expect(vi.isMockFunction(spy.getObs)).toBe(true);
    expect((spy.getObs as unknown as Record<string, unknown>)['nextWith']).toBeUndefined();
  });

  it('throws an actionable hint when observable props are requested', () => {
    expect(() => createSpyFromClass(Service, { observablePropsToSpyOn: ['value$'] })).toThrow(/vitest-auto-spy\/rxjs/);
  });
});
