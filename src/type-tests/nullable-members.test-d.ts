/**
 * Members that may be absent — `m?: F`, `m: F | undefined`, `onclick: F | null` — are still methods
 * and observables: they become spies, they are nameable in the configuration lists, and `returns`
 * agrees with the spy it configures.
 */
import type { HttpClient } from '@angular/common/http';
import type { WritableSignal } from '@angular/core';
import type { Observable } from 'rxjs';
import { describe, expectTypeOf, it } from 'vitest';

import {
  type ClassSpyConfiguration,
  type DeepMockProxy,
  type DeepPartial,
  type OnlyMethodKeysOf,
  type OnlyObservablePropsOf,
  type Overload,
  type Overloads,
  type Spy,
  createAutoMock,
  createMock,
  createSpyFromClass,
} from '../auto-spy';

interface MapOptions {
  getMinZoom?: (() => number) | undefined;
  onClose: ((reason: string) => void) | undefined;
  onOpen: (() => number) | null;
  nothing: undefined;
  label: string | undefined;
}

interface Repo {
  find(id: number): string;
}

interface Service {
  repo?: Repo;
  backup: Repo | null;
  optM?: () => string;
}

declare const deep: DeepMockProxy<Service>;
declare const unreachable: never;

class Dialog {
  onClose: ((reason: string) => void) | undefined = undefined;
  data$?: Observable<string>;
  selected$: Observable<number> | null = null;
  cb = (x: number): number => x;
}

describe('nullable function members', () => {
  it('are spies, keeping the nullish half', () => {
    const options = createAutoMock<MapOptions>({}, { returns: { getMinZoom: 1, onOpen: 2 } });

    options.getMinZoom?.mockReturnValue(1);
    options.onOpen?.mockReturnValue(2);
    options.onClose?.calledWith('x').mockReturnValue(undefined);
    expectTypeOf(options.onOpen).extract<null>().toEqualTypeOf<null>();

    // @ts-expect-error the stub is checked against the member's return type
    options.getMinZoom?.mockReturnValue('1');
    // @ts-expect-error `null` is still possible, so the member needs a guard
    options.onOpen.mockReturnValue(2);
    // @ts-expect-error `returns` is checked against the same return type
    createAutoMock<MapOptions>({}, { returns: { getMinZoom: 'one' } });
  });

  it('are method keys, a member typed only `undefined` or a plain value is not', () => {
    expectTypeOf<OnlyMethodKeysOf<MapOptions>>().toEqualTypeOf<'getMinZoom' | 'onClose' | 'onOpen'>();
    expectTypeOf<Spy<MapOptions>['nothing']>().toEqualTypeOf<undefined>();
    expectTypeOf<Spy<MapOptions>['label']>().toEqualTypeOf<string | undefined>();
  });

  it('can be named in instanceMethodsToSpyOn', () => {
    createSpyFromClass(Dialog, { instanceMethodsToSpyOn: ['onClose', 'cb'] });

    // @ts-expect-error an observable is not a method
    createSpyFromClass(Dialog, { instanceMethodsToSpyOn: ['selected$'] });
  });

  it('make a DOM handler property a spy', () => {
    const element = createAutoMock<HTMLElement>();

    element.onclick?.mockReturnValue(undefined);
    expectTypeOf(element.onclick).extract<null>().toEqualTypeOf<null>();
  });
});

describe('nullable observable members', () => {
  it('get nextWith and are nameable in observablePropsToSpyOn', () => {
    const config: ClassSpyConfiguration<Dialog> = { observablePropsToSpyOn: ['data$', 'selected$'] };
    const dialog = createSpyFromClass(Dialog, config);

    dialog.data$?.nextWith('a');
    dialog.selected$?.nextWith(1);
    expectTypeOf<OnlyObservablePropsOf<Dialog>>().toEqualTypeOf<'data$' | 'selected$'>();

    // @ts-expect-error the value is checked against the element type
    dialog.selected$?.nextWith('1');
    // @ts-expect-error a method is not an observable property
    createSpyFromClass(Dialog, { observablePropsToSpyOn: ['cb'] });
  });
});

describe('a method that never returns', () => {
  interface Guard {
    fail(message: string): never;
  }

  it('is a plain spy, not a promise spy', () => {
    const guard = createAutoMock<Guard>();

    guard.fail.calledWith('x').failWith(new Error('x'));

    // @ts-expect-error `never` is not a promise
    guard.fail.resolveWith(unreachable);
    // @ts-expect-error nor on the calledWith chain
    guard.fail.calledWith('x').resolveWith(unreachable);
  });
});

describe("overload: 'first'", () => {
  interface Store {
    count: WritableSignal<number>;
    load(id: string): Promise<string>;
    load(id: number): Promise<number>;
  }

  interface Five {
    pick(a: 1): 'a';
    pick(a: 2): 'b';
    pick(a: 3): 'c';
    pick(a: 4): 'd';
    pick(a: 5): 'e';
  }

  it('keeps the properties of a callable member', () => {
    const store = createAutoMock<Store, { overload: 'first' }>();

    expectTypeOf(store.count).toExtend<WritableSignal<number>>();
    store.count.set(1);
    store.load.resolveWith('x');

    // @ts-expect-error the first overload resolves a string
    store.load.resolveWith(1);
    // @ts-expect-error `set` stays typed
    store.count.set('1');
  });

  it('reads the first of five or more overloads', () => {
    expectTypeOf<Overload<Five['pick'], 0>>().toEqualTypeOf<(a: 1) => 'a'>();
    expectTypeOf<Overload<Five['pick'], 4>>().toEqualTypeOf<(a: 5) => 'e'>();
    expectTypeOf<Overloads<Five['pick']>>().toHaveProperty('length').toEqualTypeOf<5>();
    expectTypeOf<ReturnType<Spy<Five, { overload: 'first' }>['pick']>>().toEqualTypeOf<'a'>();

    // @ts-expect-error the first overload takes `1`
    createAutoMock<Five, { overload: 'first' }>().pick.calledWith(5);
  });

  it("reads HttpClient.get's first overload", () => {
    type Get = Spy<HttpClient, { overload: { get: 'first' } }>['get'];

    expectTypeOf<Parameters<Get>[1]>().exclude<undefined>().toHaveProperty('observe').toEqualTypeOf<'body' | undefined>();
  });
});

describe('DeepPartial arrays', () => {
  interface State {
    ids: readonly number[];
    pair: [string, number];
    rows: { id: number; name: string }[];
  }

  it('keeps readonly arrays readonly and tuples at their arity', () => {
    const ids: readonly number[] = [1];

    createMock<State>({ ids, pair: ['x', 1], rows: [{ id: 1 }] });
    expectTypeOf<DeepPartial<readonly number[]>>().toExtend<readonly number[]>();

    // @ts-expect-error a tuple keeps its arity
    createMock<State>({ pair: ['x', 1, 2] });
    // @ts-expect-error and its element types
    createMock<State>({ pair: [1, 'x'] });
    // @ts-expect-error unknown keys are still rejected inside an array element
    createMock<State>({ rows: [{ nope: 1 }] });
  });
});

describe('DeepMockProxy through optional and nullable members', () => {
  it('deepens into them', () => {
    deep.repo?.find.mockReturnValue('x');
    deep.backup?.find.calledWith(1).mockReturnValue('y');
    deep.optM?.mockReturnValue('z');

    // @ts-expect-error the stub is checked
    deep.backup?.find.mockReturnValue(1);
    // @ts-expect-error `null` is still possible
    deep.backup.find.mockReturnValue('y');
  });
});
