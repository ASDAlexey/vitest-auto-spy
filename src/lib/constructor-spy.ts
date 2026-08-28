/**
 * A test double the code under test can call with `new`.
 *
 * This is the single most expensive mistake of a Jest → Vitest move, and it is invisible at the
 * line where it is made. Under Jest, `jest.fn().mockImplementation(() => instance)` served `new`,
 * so every suite old enough to have mocked a global constructor — `new Image()` for a tracking
 * pixel, `new Worker()`, `new WebSocket()`, a payment or player SDK published as a global class —
 * carries that shape. Vitest only forwards `new` to an implementation that is itself constructible,
 * and an arrow function is not: the call is recorded, the body never runs, and `new` hands back an
 * empty object. Vitest says so on stderr ("the mock did not use 'function' or 'class'"), but that
 * line is nowhere near the failure, which arrives later as `TypeError: (cb) => {…} is not a
 * constructor` with a stack pointing into production code — or as a green test for the wrong
 * reason, when the resulting `undefined` is swallowed by a `catch` the assertion is happy with.
 *
 * The helpers here cannot be written wrongly. {@link mockConstructor} builds the `function`
 * implementation for you and still returns a real runner mock, so `toHaveBeenCalledWith`,
 * `mockClear` and the rest keep working; {@link stubConstructor} additionally puts it on a global
 * (or any object) through {@link mockValueProp}, so `restoreMockedProps()` takes it off again.
 */
import type { Mock } from 'vitest';

import { DOCS_LINKS, withDocs } from './docs-links';
import { getMockAdapter } from './mock-adapter';
import { mockValueProp } from './prop-mock';

/**
 * A runner mock that is also a constructor.
 *
 * It is the runner's own mock object, so every matcher and every `mock*` method applies. The two
 * additions are the `new` signature — which is the whole point — and {@link instances}, the objects
 * the factory produced, in construction order.
 */
export interface ConstructorMock<T, TArgs extends unknown[] = unknown[]> extends Mock<(...args: TArgs) => T> {
  new (...args: TArgs): T;
  /**
   * Everything `new` handed back, in construction order.
   *
   * Owned by this helper rather than read off the runner, so it is *not* emptied by `mockClear()` —
   * clearing the call record and forgetting the objects a spec still holds assertions against are
   * different wishes, and the runner's own `mock.instances` is there for the first one.
   */
  readonly instances: T[];
}

/** The instance list is owned here rather than read off the runner, so it clears with the mock. */
interface MutableConstructorMock<T, TArgs extends unknown[]> extends ConstructorMock<T, TArgs> {
  instances: T[];
}

function calledWithoutNew(name: string): Error {
  return new Error(
    withDocs(
      `[vitest-auto-spy] ${name} is a constructor double and was called without \`new\`. ` +
        'Either the code under test lost the `new`, or the double stands in for something that is ' +
        'also callable as a plain function — in which case use a plain runner mock instead.',
      DOCS_LINKS.constructorSpy,
    ),
  );
}

function factoryReturnedNonObject(name: string, produced: unknown): Error {
  return new Error(
    `[vitest-auto-spy] ${name}: the factory returned ${produced === null ? 'null' : typeof produced}, but a constructor ` +
      'double has to produce an object — JavaScript discards a primitive returned from `new` and hands back the ' +
      'freshly created instance instead, so the object a spec configured would never reach the code under test.',
  );
}

/**
 * Build a constructible runner mock whose instances come from `factory`.
 *
 * ```ts
 * const Syslog = mockConstructor<SyslogClient>(() => ({ log: vi.fn(), close: vi.fn() }));
 *
 * mockValueProp(globalThis, 'Syslog', Syslog);
 * service.start();
 *
 * expect(Syslog).toHaveBeenCalledWith({ host: 'logs.test' });
 * expect(Syslog.instances[0].log).toHaveBeenCalledTimes(1);
 * ```
 *
 * @param factory Produces the instance for one construction; it receives the `new` arguments and
 *   must return an object (see {@link ConstructorMock}).
 * @param name Shown in assertion output and in this helper's own error messages.
 */
export function mockConstructor<T, TArgs extends unknown[] = unknown[]>(
  factory: (...args: TArgs) => T,
  name = 'mockConstructor',
): ConstructorMock<T, TArgs> {
  const instances: T[] = [];

  // A `function` expression, deliberately not an arrow: this one keyword is what makes the runner
  // forward `new` to the body at all, and getting it wrong is the failure this module exists for.
  const implementation = function (this: unknown, ...args: TArgs): T {
    // `this` rather than `new.target`: the module is strict ESM, so a plain call has no receiver,
    // while `new` always supplies one. `new.target` would read better and does not survive every
    // runner — Bun's `mock()` forwards the receiver but not the construct target.
    if (this === undefined) {
      throw calledWithoutNew(name);
    }

    const instance = factory(...args);

    if (typeof instance !== 'object' || instance === null) {
      throw factoryReturnedNonObject(name, instance);
    }

    instances.push(instance);

    // Returning an object from a constructor is what makes `new` hand that object back, which is
    // how the factory's result — not a bare instance of the mock — reaches the code under test.
    return instance;
  };

  const mock = getMockAdapter().createMockFn(implementation, name);

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the adapter is runtime-agnostic and hands back a bare callable; this narrows it to the constructor surface that the `function` implementation above, and this module's tests, guarantee.
  const constructorMock = mock as MutableConstructorMock<T, TArgs>;

  constructorMock.instances = instances;

  return constructorMock;
}

/**
 * Replace a constructor on a global (or on any object) with a {@link mockConstructor}.
 *
 * The generalisation of `stubIntersectionObserver` & friends to everything else the platform
 * publishes as a class and production code reaches for directly: `Image`, `Worker`, `WebSocket`,
 * `Audio`, `EventSource`, a vendor SDK on `window`.
 *
 * ```ts
 * const Image = stubConstructor(globalThis, 'Image', () => ({ src: '' }));
 *
 * tracker.ping();
 *
 * expect(Image).toHaveBeenCalledTimes(1);
 * expect(Image.instances[0].src).toBe('https://tns.example/hit');
 * ```
 *
 * Installation goes through {@link mockValueProp}, so `restoreMockedProps()` — which
 * `setupAutoSpy()` already runs after every test — puts the real constructor back. That matters
 * under `isolate: false`, where a hand-assigned global survives into the next file and fails there.
 *
 * @param target The object owning the constructor — usually `globalThis`.
 * @param property Its key.
 * @param factory Produces the instance for one construction.
 */
export function stubConstructor<T, TArgs extends unknown[] = unknown[]>(
  target: object,
  property: PropertyKey,
  factory: (...args: TArgs) => T,
): ConstructorMock<T, TArgs> {
  const constructorMock = mockConstructor<T, TArgs>(factory, String(property));

  mockValueProp(target, property, constructorMock);

  return constructorMock;
}
