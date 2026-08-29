/**
 * The `mock*Prop` helpers over the two Proxy-backed doubles.
 *
 * Every one of them is built on `Object.defineProperty`, and neither Proxy trapped it: the patch
 * landed on the Proxy's own target, `get` never looked there, nothing threw, and the test carried
 * on reading the old value. These specs pin each helper against each double — the composition the
 * library recommends in two places at once (`no-object-define-property` → `mock*Prop`, the factory
 * tree → `createAutoMock`) and did not support.
 */
import { from, isObservable, of } from 'rxjs';
import { beforeAll, describe, expect, it } from 'vitest';

import { autoMocked, createAutoMock } from './auto-mock';
import { registerMockAdapter } from './mock-adapter';
import { mockDeep } from './mock-deep';
import { mockAccessorsProp, mockReadonlyProp, mockReadonlyPropGetter, mockValueProp, restoreMockedProps } from './prop-mock';
import { NOT_STORED, createProxyPropStore, readStoredAccessor } from './proxy-props';
import { asInstance } from './spy-typing';
import { vitestMockAdapter } from './vitest-adapter';

beforeAll(() => {
  registerMockAdapter(vitestMockAdapter);
});

/** An abstract-class shape: half the useful members are getters, which is why the double is a proxy. */
interface PlatformLocation {
  pathname: string;
  href: string;
  reload(): void;
}

/** The same double built by each factory, so every case below runs against both proxies. */
type BuildLocation = (seed?: Partial<PlatformLocation>) => PlatformLocation;

const factories: [string, BuildLocation][] = [
  ['createAutoMock', (seed): PlatformLocation => asInstance(createAutoMock<PlatformLocation>(seed))],
  ['mockDeep', (seed): PlatformLocation => asInstance(mockDeep<PlatformLocation>(seed))],
];

describe.each(factories)('mock*Prop over %s', (_name, build) => {
  it('mockValueProp replaces the value the double answers with', () => {
    const location = build({ pathname: '/' });

    mockValueProp(location, 'pathname', '/movies');

    expect(location.pathname).toBe('/movies');
  });

  it('mockReadonlyProp installs a getter, and the getter is called rather than returned', () => {
    const location = build({ pathname: '/' });

    mockReadonlyProp(location, 'pathname', '/series');

    // The failure this pins: a value store would hand back `() => '/series'`.
    expect(location.pathname).toBe('/series');
  });

  it('mockReadonlyPropGetter re-reads on every access', () => {
    const location = build({ pathname: '/' });
    let current = '/a';

    mockReadonlyPropGetter(location, 'pathname', () => current);

    expect(location.pathname).toBe('/a');
    current = '/b';
    expect(location.pathname).toBe('/b');
  });

  it('mockAccessorsProp records reads and writes, and the setter takes the assignment', () => {
    const location = build({ href: '' });
    const written: unknown[] = [];

    mockAccessorsProp(location, 'href', { set: (value) => written.push(value) });

    location.href = 'https://kion.ru';

    // Straight through the setter — not into the value store, which would shadow the getter and
    // turn the pair into a plain field from the next read on.
    expect(written).toEqual(['https://kion.ru']);
  });

  it('restoreMockedProps puts the seeded value back', () => {
    const location = build({ pathname: '/' });

    mockReadonlyProp(location, 'pathname', '/patched');
    expect(location.pathname).toBe('/patched');

    restoreMockedProps();

    expect(location.pathname).toBe('/');
  });

  it('a single patch can be undone on its own', () => {
    const location = build({ pathname: '/' });
    const restore = mockValueProp(location, 'pathname', '/patched');

    restore();

    expect(location.pathname).toBe('/');
  });
});

describe('what the traps must not break', () => {
  it('leaves methods spied after a property patch and a restore', () => {
    const location = createAutoMock<PlatformLocation>({ pathname: '/' });

    mockValueProp(location, 'pathname', '/x');
    restoreMockedProps();

    location.reload();

    expect(location.reload).toHaveBeenCalled();
  });

  it('restores a key the double had never materialised by deleting it again', () => {
    const location = createAutoMock<PlatformLocation>();

    // Nothing seeded `href`, so `rememberProp` recorded absence and the undo is a delete.
    mockValueProp(location, 'href', '/patched');
    expect(location.href).toBe('/patched');

    restoreMockedProps();

    // "It was never there" is what the recorded absence means, and the double now says so rather
    // than handing back a brand-new spy — the same answer `delete` gives.
    expect(location.href).toBeUndefined();
  });

  it('reports a patched accessor through getOwnPropertyDescriptor, unflattened', () => {
    const location = createAutoMock<PlatformLocation>();

    mockReadonlyProp(location, 'pathname', '/described');

    const descriptor = Object.getOwnPropertyDescriptor(location, 'pathname');

    // Flattening it to `{ value }` here is what would make `restoreMockedProps` turn a restored
    // getter into a frozen field.
    expect(descriptor?.get).toBeTypeOf('function');
    expect(descriptor?.configurable).toBe(true);
  });

  it('drops a patch on a mockDeep node the seed never mentioned', () => {
    const api = mockDeep<PlatformLocation>();

    // Nothing seeded `href`, so the undo is a delete rather than a restore — and a node without a
    // `deleteProperty` trap would keep the patch for the rest of the file.
    mockValueProp(api, 'href', '/patched');
    expect(api.href).toBe('/patched');

    restoreMockedProps();

    expect(api.href).toBeUndefined();
  });

  it('keeps a mockDeep node enumerable through the function surface it wraps', () => {
    // The `getOwnPropertyDescriptor` trap must fall through to the spy: `prototype` and `length`
    // are the function's own properties, and hiding a non-configurable one makes `Object.keys`
    // throw a Proxy invariant error.
    const api = mockDeep<{ load(): void }>();

    expect(() => Object.keys(api)).not.toThrow();
    expect(Object.getOwnPropertyDescriptor(api, 'length')).toBeDefined();
  });

  it('lists a patched accessor among the own keys of an auto-mock', () => {
    const location = createAutoMock<PlatformLocation>();

    mockReadonlyProp(location, 'pathname', '/listed');

    expect(Object.keys(location)).toContain('pathname');
    expect('pathname' in location).toBe(true);
  });
});

describe('the store itself', () => {
  it('answers NOT_STORED for a key with no patched accessor', () => {
    const store = createProxyPropStore({ seeded: 1 });

    // A sentinel, because a getter is allowed to return `undefined` and must not read as "absent".
    expect(readStoredAccessor(store, 'seeded', undefined)).toBe(NOT_STORED);
  });

  it('answers `undefined` for a write-only accessor pair', () => {
    const store = createProxyPropStore({});

    store.accessors.set('writeOnly', { set: () => undefined, configurable: true });

    expect(readStoredAccessor(store, 'writeOnly', undefined)).toBeUndefined();
  });
});

describe('`delete` on a double that makes members on demand', () => {
  interface PlayerEngine {
    play(): void;
    /** The member a guarded call site checks for — `if (engine.setPlaybackRate) …`. */
    setPlaybackRate?(rate: number): void;
  }

  it.each([
    ['createAutoMock', (): PlayerEngine => asInstance(createAutoMock<PlayerEngine>())],
    ['mockDeep', (): PlayerEngine => mockDeep<PlayerEngine>()],
  ])('makes the member absent on %s, instead of remaking it on the next read', (_name, build) => {
    const engine = build();

    // Materialise it first, so the delete has something to remove as well as something to record.
    expect(engine.setPlaybackRate).toBeDefined();

    delete engine.setPlaybackRate;

    // Without the tombstone this read makes a fresh spy, the member is truthy again, and a test
    // named "the optional method is missing and we do not crash" exercises the branch where it is
    // present — green, and asserting nothing.
    expect(engine.setPlaybackRate).toBeUndefined();
    expect('setPlaybackRate' in engine).toBe(false);
  });

  it.each([
    ['createAutoMock', (): PlayerEngine => asInstance(createAutoMock<PlayerEngine>())],
    ['mockDeep', (): PlayerEngine => mockDeep<PlayerEngine>()],
  ])('revives the member on the next write, as a real object would (%s)', (_name, build) => {
    const engine = build();

    delete engine.setPlaybackRate;
    engine.setPlaybackRate = (): void => undefined;

    expect(engine.setPlaybackRate).toBeDefined();
  });
});

describe('a proxy double must not impersonate a protocol', () => {
  interface AnimationItem {
    play(): void;
    destroy(): void;
  }

  it('survives `of(mock)` — the reported case, and the worst of the family', () => {
    // `of(...)` calls `popScheduler(args)`, which takes the LAST argument for a scheduler when
    // `typeof x.schedule === 'function'`. A double that answers every property answered that too,
    // so the whole double was eaten as the scheduler, `of()` was left with no arguments, and the
    // emission was scheduled onto a spy that does nothing — a stream that never emits, failing an
    // assertion three concerns away with nothing pointing back at `of`.
    const emitted: AnimationItem[] = [];
    const animation = autoMocked<AnimationItem>();

    of(animation).subscribe((value) => emitted.push(value));

    expect(emitted).toEqual([animation]);
  });

  it('is not mistaken for an Observable', () => {
    // `isObservable` is `lift` and `subscribe` both being functions.
    expect(isObservable(createAutoMock<AnimationItem>())).toBe(false);
  });

  it("fails loudly, in rxjs's own words, when handed to `from`", () => {
    // Not silence, and not a `TypeError` from three frames inside rxjs either.
    expect(() => from(createAutoMock<AnimationItem>() as never)).toThrow(/invalid object where a stream was expected/);
  });

  it('is not thenable, so `await` hands the double back unchanged', async () => {
    const animation = createAutoMock<AnimationItem>();

    // A truthy `then` is the classic trap of any answer-to-everything proxy, and it breaks in the
    // code under test rather than in the spec.
    expect(await animation).toBe(animation);
  });

  it.each(['schedule', 'lift', '@@observable', 'getReader'])('answers `%s` with undefined on both doubles', (key) => {
    const auto: Record<string, unknown> = createAutoMock<AnimationItem>();
    const deep: Record<string, unknown> = mockDeep<AnimationItem>();

    expect(auto[key]).toBeUndefined();
    expect(deep[key]).toBeUndefined();
  });

  it('leaves `subscribe` alone — an ordinary method name, and an ordinary assertion', () => {
    // Denying `lift` and `@@observable` is enough to stop the impersonation, so this one does not
    // have to be sacrificed: a store, an `OutputEmitterRef` or an event bus is a normal thing to
    // mock, and `expect(store.subscribe).toHaveBeenCalledWith(cb)` is why.
    const store = createAutoMock<{ subscribe(listener: () => void): void }>();
    const listener = (): void => undefined;

    store.subscribe(listener);

    expect(store.subscribe).toHaveBeenCalledWith(listener);
  });

  it('hands a seeded protocol member back, which is the way out', () => {
    // The deny-list is consulted after the store, so a type that genuinely has one of these members
    // is mocked by saying so once.
    const scheduler = createAutoMock<{ schedule(work: () => void): void }>({ schedule: () => undefined });

    expect(scheduler.schedule).toBeTypeOf('function');
  });

  it('takes an assignment as a seed too', () => {
    const scheduler: Record<string, unknown> = createAutoMock<{ schedule(work: () => void): void }>();

    scheduler['schedule'] = (): void => undefined;

    expect(scheduler['schedule']).toBeTypeOf('function');
  });
});
