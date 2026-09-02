/**
 * Type-level tests for the `vitest-auto-spy/jasmine` surface.
 *
 * The whole promise of that entry is that a `jasmine-auto-spies` suite compiles after one import
 * line changes, and "compiles" is a claim `tsc --noEmit` over the sources cannot check — it proves
 * the library builds, not that a *caller* sees `.and.nextWith` typed on the right methods and absent
 * from the wrong ones. Upstream types the async helpers per return type (`{ and: AddObservableSpyMethods }`
 * only when the method returns an `Observable`), and a migrating spec is written against exactly
 * that shape, so getting it wrong here shows up as red squiggles across a two-thousand-file suite
 * rather than as a failing test.
 *
 * The rule these follow, as elsewhere in this directory: assert the type a *call site* sees.
 */
import { EMPTY, type Observable } from 'rxjs';
import { describe, expectTypeOf, it } from 'vitest';

import { type Spy, createFunctionSpy, createSpyFromClass, createSpyObj, jasmine, provideAutoSpy } from '../jasmine';

class AccountService {
  balance = 0;

  get owner(): string {
    return 'real';
  }

  load(id: number): string {
    return `real-${id}`;
  }

  save(id: number): Promise<string> {
    return Promise.resolve(`real-${id}`);
  }

  watch(_id: number): Observable<string> {
    return EMPTY;
  }
}

describe('Spy<T> under the jasmine surface', () => {
  it('is what createSpyFromClass returns, so the imported alias means the same thing', () => {
    expectTypeOf(createSpyFromClass(AccountService)).toEqualTypeOf<Spy<AccountService>>();
  });

  it('keeps the class’s own call signatures on every method', () => {
    const service = createSpyFromClass(AccountService);

    expectTypeOf(service.load).parameters.toEqualTypeOf<[number]>();
    expectTypeOf(service.load).returns.toEqualTypeOf<string>();
    expectTypeOf(service.save).returns.toEqualTypeOf<Promise<string>>();
  });

  it('leaves non-method members alone', () => {
    expectTypeOf(createSpyFromClass(AccountService).balance).toEqualTypeOf<number>();
  });
});

describe('.and', () => {
  it('types returnValue against the method’s own return type', () => {
    const service = createSpyFromClass(AccountService);

    expectTypeOf(service.load.and.returnValue).parameter(0).toEqualTypeOf<string>();
    expectTypeOf(service.load.and.identity).toEqualTypeOf<string>();
  });

  it('carries the promise helpers only on a promise-returning method', () => {
    const service = createSpyFromClass(AccountService);

    expectTypeOf(service.save.and.resolveWith).parameter(0).toEqualTypeOf<string | undefined>();
    expectTypeOf(service.save.and).toHaveProperty('rejectWith');
    expectTypeOf(service.save.and).toHaveProperty('resolveWithPerCall');
    // A sync method gets the strategies and nothing else — the same split upstream types.
    expectTypeOf(service.load.and).not.toHaveProperty('resolveWith');
    expectTypeOf(service.load.and).not.toHaveProperty('nextWith');
  });

  it('carries the observable helpers only on an observable-returning method', () => {
    const service = createSpyFromClass(AccountService);

    expectTypeOf(service.watch.and.nextWith).parameter(0).toEqualTypeOf<string | undefined>();
    expectTypeOf(service.watch.and).toHaveProperty('returnSubject');
    expectTypeOf(service.watch.and).toHaveProperty('nextWithValues');
    expectTypeOf(service.save.and).not.toHaveProperty('nextWith');
  });

  it('hands the spy back, so a strategy call can be read as jasmine’s is', () => {
    const service = createSpyFromClass(AccountService);

    // The spy's own surface, not `void` — what upstream returns, and what makes the call readable
    // in an expression. The namespaces are not re-attached to the returned type, deliberately:
    // `JasmineAnd` is defined in terms of the spy, so typing the return as the *jasmine* spy would
    // be a circular alias.
    expectTypeOf(service.load.and.returnValue('x')).toHaveProperty('mockReturnValue');
    expectTypeOf(service.load.and.callThrough()).toHaveProperty('mockImplementation');
  });
});

describe('.calls', () => {
  it('reports jasmine’s CallInfo shape', () => {
    const service = createSpyFromClass(AccountService);

    expectTypeOf(service.load.calls.count()).toEqualTypeOf<number>();
    expectTypeOf(service.load.calls.any()).toEqualTypeOf<boolean>();
    expectTypeOf(service.load.calls.allArgs()).toEqualTypeOf<unknown[][]>();
    expectTypeOf(service.load.calls.first()).toEqualTypeOf<{ object: unknown; args: unknown[]; returnValue: unknown } | undefined>();
  });
});

describe('.withArgs', () => {
  it('checks the arguments against the method, and resolves to the right terminal', () => {
    const service = createSpyFromClass(AccountService);

    expectTypeOf(service.load.withArgs).parameters.toEqualTypeOf<[number]>();
    expectTypeOf(service.load.withArgs(1).and.returnValue).parameter(0).toEqualTypeOf<string>();
    expectTypeOf(service.save.withArgs(1).and).toHaveProperty('resolveWith');
    expectTypeOf(service.watch.withArgs(1).and).toHaveProperty('nextWith');
  });
});

describe('accessor spies', () => {
  it('carries the namespaces, which is how a jasmine suite configures a getter', () => {
    const service = createSpyFromClass(AccountService, { gettersToSpyOn: ['owner'] });

    expectTypeOf(service.accessorSpies.getters.owner.and).toHaveProperty('returnValue');
    expectTypeOf(service.accessorSpies.setters.owner.calls.count()).toEqualTypeOf<number>();
  });
});

describe('the other factories', () => {
  it('types createFunctionSpy against the signature it is given', () => {
    const add = createFunctionSpy<(a: number, b: number) => number>('add');

    expectTypeOf(add).parameters.toEqualTypeOf<[number, number]>();
    expectTypeOf(add.and.returnValue).parameter(0).toEqualTypeOf<number>();
  });

  it('types provideAutoSpy’s useValue as the jasmine Spy, not the core one', () => {
    expectTypeOf(provideAutoSpy(AccountService).useValue).toEqualTypeOf<Spy<AccountService>>();
    // `provide` is the DI token — `ClassType<T>`, which is deliberately wider than `typeof Class`
    // so an abstract class needs no cast, the thing upstream makes you write `as any` for.
    expectTypeOf(provideAutoSpy(AccountService)).toHaveProperty('provide');
  });

  it('gives createSpyObj a key per name, in both of its shapes', () => {
    const store = createSpyObj('store', ['load', 'save']);
    const clock = createSpyObj('clock', { now: 1 });
    const user = createSpyObj('user', ['save'], { id: 7 });

    expectTypeOf(store).toHaveProperty('load');
    expectTypeOf(store).toHaveProperty('save');
    expectTypeOf(clock).toHaveProperty('now');
    expectTypeOf(user).toHaveProperty('id');
    expectTypeOf(store.load.and).toHaveProperty('returnValue');
  });

  it('accepts both configuration forms, and the deprecated key beside them', () => {
    expectTypeOf(createSpyFromClass(AccountService, ['load'])).toEqualTypeOf<Spy<AccountService>>();
    expectTypeOf(createSpyFromClass(AccountService, { methodsToSpyOn: ['load'] })).toEqualTypeOf<Spy<AccountService>>();
    // The deprecated key still compiles, which is the point: a migrated configuration object needs no edit.
    expectTypeOf(createSpyFromClass(AccountService, { providedMethodNames: ['load'] })).toEqualTypeOf<Spy<AccountService>>();
  });
});

describe('the jasmine namespace', () => {
  it('is callable where a jasmine spec calls it', () => {
    expectTypeOf(jasmine.any).toBeCallableWith(Number);
    expectTypeOf(jasmine.objectContaining).toBeCallableWith({ id: 1 });
    expectTypeOf(jasmine.truthy).toBeCallableWith();
    expectTypeOf(jasmine.arrayWithExactContents).toBeCallableWith(['a']);
    expectTypeOf(jasmine.clock().tick).toBeCallableWith(100);
    expectTypeOf(jasmine.DEFAULT_TIMEOUT_INTERVAL).toEqualTypeOf<number>();
  });
});
