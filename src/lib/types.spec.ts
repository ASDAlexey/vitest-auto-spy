/**
 * Type-level regressions.
 *
 * Everything here is checked by `tsc --noEmit` over `src/**`, which is the only place these can
 * fail: each one is a shape that compiled to something *wrong* rather than to an error — a spy
 * member silently becoming `never`, a getter list whose element type collapsed, an overloaded
 * method read against the signature nobody calls. The runtime assertions are incidental; they exist
 * so the file is a suite rather than a comment.
 */
import { type Observable, Subject, of } from 'rxjs';
import { describe, expect, it } from 'vitest';

import '../index';
import '../rxjs';
import { createAutoMock } from './auto-mock';
import { createMock } from './create-mock';
import { createSpyFromClass } from './create-spy-from-class';
import type { DeepPartial, Overload, Spy } from './types';

/** The shape of an Angular signal, without depending on Angular: callable *and* a property. */
type SignalLike<T> = (() => T) & { brand: 'signal' };

interface Stringified<T> {
  raw: string;
  parsed: T;
}

class ConfigService {
  /** The generic-with-conditional-return-type method that used to collapse the whole spy. */
  getJSONValue<K extends keyof this>(key: K): this[K] extends Stringified<infer R> ? R : never {
    throw new Error(`not implemented for ${String(key)}`);
  }

  dispose(): void {
    /* nothing to release in the double */
  }

  load(): Promise<number> {
    return Promise.resolve(1);
  }

  watch(): Observable<number> {
    return of(1);
  }

  get isReady(): SignalLike<boolean> {
    return Object.assign(() => true, { brand: 'signal' } as const);
  }
}

interface CinemasClient {
  list(city: string): Observable<string[]>;
  list(city: string, options: { observe: 'response' }): Observable<Response>;
  list(city: string, options: { observe: 'events' }): Observable<Event>;
}

interface AccountToken {
  profiles: { active: { id: string; name: string }; all: { id: string }[] };
  issuedAt: Date;
  refresh(): Promise<void>;
}

/**
 * An `Observable`-shaped type that is *not* rxjs's `Observable` — a second copy of rxjs in the tree
 * produces exactly this, and so does a hand-rolled stream.
 */
declare class DuplicateObservable<T> {
  subscribe(observerOrNext?: Partial<{ next: (value: T) => void }> | ((value: T) => void)): { unsubscribe(): void };
  forEach(next: (value: T) => void): Promise<void>;
}

class DuplicatedRxjs {
  watch(): DuplicateObservable<number> {
    throw new Error('never called — the spy replaces it');
  }
}

describe('Spy<T> return-type helpers', () => {
  it('keeps its helpers on a method whose return type is `never`', () => {
    const config = createSpyFromClass(ConfigService);

    // The regression: a distributive conditional over `never` produced `never` for the whole
    // member, and the failure read `Property 'mockReturnValue' does not exist on type 'never'`.
    config.getJSONValue.mockReturnValue(undefined as never);

    expect(config.getJSONValue).toHaveBeenCalledTimes(0);
  });

  it('lets a void method be stubbed with no argument at all', () => {
    const config = createSpyFromClass(ConfigService);

    config.dispose.mockReturnValue();
    config.dispose();

    expect(config.dispose).toHaveBeenCalled();
  });

  it('still picks the promise and observable bundles', async () => {
    const config = createSpyFromClass(ConfigService);

    config.load.resolveWith(7);
    config.watch.nextWith(9);

    await expect(config.load()).resolves.toBe(7);
    expect(config.watch).toBeDefined();
  });
});

describe('accessor lists', () => {
  it('accepts a getter whose value is callable, which is every signal-based service', () => {
    // `OnlyPropsOf` subtracted everything callable, so a service whose readonly state is all
    // signals had no nameable getter at all and the element type collapsed to `never`.
    const config = createSpyFromClass(ConfigService, { gettersToSpyOn: ['isReady'] });

    expect(config.accessorSpies.getters.isReady).toBeDefined();
  });
});

describe('overload selection', () => {
  it('types the helpers against the first signature when asked', () => {
    const byLastOverload = createAutoMock<CinemasClient>();
    const byFirstOverload: Spy<CinemasClient, { overload: 'first' }> = createAutoMock<CinemasClient, { overload: 'first' }>();

    // The default reads the last overload — `observe: 'events'`, whose body is an `Event`.
    byLastOverload.list.nextWith(new Event('progress'));
    // With `overload: 'first'` the same method is typed against the signature anybody calls.
    byFirstOverload.list.nextWith(['Odeon']);

    expect(byFirstOverload.list).toBeDefined();
  });

  it('names one signature on its own, for a plain `vi.fn()` declaration', () => {
    const first: Overload<CinemasClient['list'], 0> = (city: string): Observable<string[]> => of([city]);

    expect(first('Berlin')).toBeDefined();
  });
});

describe('deep partial fixtures', () => {
  it('takes a nested literal without a call per level', () => {
    const token = createMock<AccountToken>({ profiles: { active: { id: '1' } } });

    expect(token.profiles.active.id).toBe('1');
  });

  it('still rejects a key the model does not have', () => {
    // @ts-expect-error `nickname` is not on the active profile — the check a plain `as` throws away.
    const wrong = createMock<AccountToken>({ profiles: { active: { nickname: 'ada' } } });

    expect(wrong).toBeDefined();
  });

  it('hands built-in values through untouched', () => {
    const partial: DeepPartial<AccountToken> = { issuedAt: new Date(0), refresh: () => Promise.resolve() };

    expect(partial.issuedAt).toBeInstanceOf(Date);
  });

  it('accepts a real host object where the field is typed as one', () => {
    const fragment = document.createDocumentFragment();
    fragment.append(document.createElement('span'));

    // `BuiltIn` cannot name `Node` or `NodeList` — that would put `lib: ["DOM"]` into the published
    // `.d.ts`, and this package is imported from `/node`, `/nestjs` and `/bun` too. So host objects
    // were mapped over, and a deep partial stopped accepting the object it is a partial of:
    // `Type 'NodeList' is not assignable to type '{ readonly baseURI?: … }'`, followed by ten
    // screens of a recursive type ending on `parentElement.shadowRoot.adoptedStyleSheets`.
    const record = createMock<MutationRecord>({ addedNodes: fragment.childNodes, target: document.body });

    expect(record.addedNodes).toHaveLength(1);
    expect(record.target).toBe(document.body);
  });

  it('still rejects a key the model does not have inside a host-typed branch', () => {
    // The union added for the case above must not cost the check that makes a deep partial worth
    // having: excess-property checking against a union accepts a key present in *some* member, and
    // both members carry exactly the keys of `T`.
    // @ts-expect-error `nodeTypo` is not on `Node`.
    const wrong = createMock<MutationRecord>({ target: { nodeTypo: 1 } });

    expect(wrong).toBeDefined();
  });
});

describe('the rxjs seam', () => {
  // The other half of `type-tests/rxjs-seam.test-d.ts`. Nothing in the published declarations names
  // an rxjs type any more — `dist/types-*.d.ts` opened with `import { Observable, Subject } from
  // 'rxjs'` and pulled 189 rxjs `.d.ts` files into every consumer's program — so `returnSubject()`
  // is typed `SubjectOf<T>`, which is structural until something augments `AutoSpyRxjsTypes`. The
  // `import '../rxjs'` at the top of this file is that something, and this program is therefore the
  // one an rxjs suite has. These assertions are compiled by `npm run typecheck`; the type tests run
  // in a program without the import and assert the fallback instead.

  it("hands back rxjs's own `Subject` once the observable layer is imported", () => {
    const config = createSpyFromClass(ConfigService);

    // The assignment is the assertion: `Subject` is nominal, so nothing structural satisfies it.
    const subject: Subject<number> = config.watch.returnSubject();
    const perCall: Subject<number>[] = config.watch.nextWithPerCall([{ value: 1 }]);

    subject.next(2);

    expect(subject).toBeInstanceOf(Subject);
    expect(perCall).toHaveLength(1);
  });

  it('detects an observable structurally, so a second copy of rxjs no longer falls through', () => {
    // `Observable` has no private members but `Subject` does, so a service typed against a
    // *duplicated* rxjs used to miss the observable bundle with nothing to explain why. The check
    // is now shape-based and this compiles without either side importing the other's rxjs.
    const stream = createSpyFromClass(DuplicatedRxjs);

    stream.watch.nextWith(1);

    expect(stream.watch).toBeDefined();
  });
});
