# vitest-auto-spy — Migrating off jasmine-auto-spies

Part of the agent reference [`AGENTS.md`](../AGENTS.md): the entry points, the factories and the checklist live there. Section numbers are shared with it.

## 20. Migrating a suite off `jasmine-auto-spies`

`jasmine-auto-spies` and `jest-auto-spies` are the same library twice — both thin layers over
`@hirez_io/auto-spies-core`, with identical configuration keys (`methodsToSpyOn`,
`observablePropsToSpyOn`, `gettersToSpyOn`, `settersToSpyOn`) and identical helper names.
**Exactly one thing differs**: upstream parks its async helpers behind `.and`, because that is where
jasmine keeps its own spy strategies.

```ts
spy.load.and.nextWith(account); // jasmine-auto-spies
spy.load.nextWith(account); // jest-auto-spies, and this library
```

**Land it green first, rewrite second.** `vitest-auto-spy/jasmine` puts `.and`, `.calls` and
`.withArgs` back on every spy, so the import specifier is the only edit needed to get the suite
running — and the first red run then has one candidate cause instead of two:

```diff
- import { createSpyFromClass, provideAutoSpy, type Spy } from 'jasmine-auto-spies';
+ import { createSpyFromClass, provideAutoSpy, type Spy } from 'vitest-auto-spy/jasmine';
```

```bash
npx vitest-auto-spy codemod --from jasmine            # dry run
npx vitest-auto-spy codemod --from jasmine --write    # apply, then drop the import
npx vitest-auto-spy codemod --from jasmine --verify   # match the result, not the diff
```

`import { jasmine } from 'vitest-auto-spy/jasmine'` restores the whole `jasmine` namespace
(`objectContaining`, `any`, `createSpyObj`, `clock()`, `addMatchers`, and the eight asymmetric
matchers Vitest has no twin for) for the specs that never touched auto-spies. Nothing is installed
on `globalThis` — it is one explicit line per file, which the codemod later deletes.

Four places where that surface now matches jasmine's rather than approximating it:

- **`spy.withArgs(…).and` carries the strategies that describe one argument list** — `stub()`,
  `throwError(…)`, `resolveTo(…)` and `returnValue(…)`, plus this library's own `resolveWith` /
  `nextWith` / `returnSubject` family. The three that install an _implementation_ —
  `callFake`, `callThrough`, `returnValues` — are present and **throw** a message naming the
  alternative, rather than arriving as `… is not a function`: an implementation answers every call,
  which is the opposite of configuring one argument list. Take the whole spy with `spy.and.callFake(…)`
  if that is what the line meant.
- **`jasmine.mapContaining` compares keys with the runner's equality**, as jasmine does, so an
  asymmetric matcher as a key and an object key compared deeply both work. `Map.has` alone answered
  on reference identity and missed both.
- **`jasmine.clock().install()` leaves `Date` real**, exactly as jasmine's does — the timers are
  faked, the clock is not. `jasmine.clock().mockDate()` is what takes `Date` over, and because that
  re-installs the fake clock it reports when callbacks were already scheduled and have just been
  dropped. Call `mockDate()` right after `install()`, before anything schedules a timer.
- **`jasmine.createSpyObj`'s third argument builds spied accessors**, reachable through
  `Object.getOwnPropertyDescriptor(obj, name).get`. Reading still answers the seed, so nothing about
  a migrated spec changes; what is gained is moving the value mid-test and asserting that the code
  under test wrote it.

### The renames, once the suite is green

| jasmine | here |
| --- | --- |
| `spy.m.and.returnValue(v)` | `spy.m.mockReturnValue(v)` |
| `spy.m.and.callFake(fn)` | `spy.m.mockImplementation(fn)` |
| `spy.m.and.stub()` | `spy.m.mockImplementation(() => undefined)` |
| `spy.m.and.returnValues(a, b)` | `.mockReturnValueOnce(a).mockReturnValueOnce(b)` |
| `spy.m.and.throwError('boom')` | `.mockImplementation(() => { throw new Error('boom'); })` |
| `spy.m.and.resolveTo(v)` | `spy.m.mockResolvedValue(v)` |
| `spy.m.and.nextWith(v)` / `resolveWith(v)` | `spy.m.nextWith(v)` / `spy.m.resolveWith(v)` — drop `.and` |
| `spy.m.withArgs(a).and.returnValue(v)` | `spy.m.calledWith(a).mockReturnValue(v)` |
| `spy.m.calls.count()` / `argsFor(i)` | `spy.m.mock.calls.length` / `spy.m.mock.calls[i]` |
| `spy.m.calls.reset()` | `spy.m.mockClear()` |
| `jasmine.createSpy('n')` | `vi.fn()` — or `createFunctionSpy<F>('n')`, which is typed |
| `jasmine.any(X)` / `objectContaining({…})` | `expect.any(X)` / `expect.objectContaining({…})` |
| `jasmine.clock().tick(n)` | `vi.advanceTimersByTime(n)` — or `await advanceTimers(n)` |
| `jasmine.SpyObj<T>` / `jasmine.Spy` | `Spy<T>` from this package / `Mock` from `vitest` |
| `expect(x).toBeTrue()` / `toHaveSize(n)` | `.toBe(true)` / `.toHaveLength(n)` |
| `expect(spy).toHaveBeenCalledOnceWith(a)` | `.toHaveBeenCalledExactlyOnceWith(a)` |
| `fail(msg)` | `expect.fail(msg)` — there is no `vi.fail` |

### Four traps, all of them silent

1. **`spyOn(o, 'm')` inverts.** jasmine's `spyOn` installs a **stub**; `vi.spyOn` **calls through**.
   A bare rename compiles, passes, and starts running the real implementation inside every spec that
   installed the spy in order to stop it. Write
   `vi.spyOn(o, 'm').mockImplementation(() => undefined)` — the codemod appends exactly that, and a
   file whose only jasmine construct is `spyOn(` is deliberately **not** auto-detected: that suite
   has to say `--from jasmine` out loud.
2. **`.withContext('msg')` does not throw — it loses the message.** Vitest's chai layer ships an
   `@internal` method of that name expecting a _flags object_; handed a string it walks the string's
   character indices, sets nonsense flags and returns the assertion. The chain runs, the failure
   reads `AssertionError: expected 2 to be 3`, and the label is gone. Write
   `expect(actual, 'msg').toBe(expected)`.
3. **`.calls.saveArgumentsByValue()` is a no-op here.** No runner in this family copies call
   arguments. The call still runs, nothing fails, and a spec that relied on it silently starts
   asserting on post-mutation state. Take the copy at call time, inside a `mockImplementation`.
4. **`.and.callThrough()` means something different.** Upstream had no original to call through to
   and silently answered `undefined`; here it restores **this library's own dispatch**, so a
   `calledWith` chain decides the value again. The codemod leaves it byte-for-byte and names the
   line, because there is no expression it could become.

`jasmine.DEFAULT_TIMEOUT_INTERVAL` is a config setting, not a statement: set **both**
`testTimeout` (default 5 000 ms) and `hookTimeout` (default 10 000 ms), or
`vi.setConfig({ testTimeout: n, hookTimeout: n })` per file. Assigning to it on the namespace warns
once naming both rather than silently swallowing the write.

`it('x', (done) => …)` is **not** rewritten by anything — a callback signature is a control-flow
shape, not a name. Use `async` + `await`; `no-done-callback` reports the parameter and any
`done.fail(…)`. It reports the parameter that is _called_, handed on as an argument, or never used —
not every named first parameter: `it('x', (ctx) => ctx.skip())` is Vitest's own `TestContext` read
without destructuring, which is legal, and used to be reported as a `done` callback.

On Bun and `node:test` the entry cannot be imported (it registers the Vitest adapter, which means
importing `vitest`). Call `enableJasmineCompat()` from `vitest-auto-spy/jasmine-compat` once, in a
setup file — spies built **before** the call do not get the namespaces. Observables still come from
`vitest-auto-spy/rxjs`. A project that never imports the entry pays one `undefined` check per spy
and ships none of the code.

### `@hirez_io/observer-spy` comes with it

That package sits beside `jasmine-auto-spies` in almost every suite that has one, and is the larger
of the two by an order of magnitude. `vitest-auto-spy/rxjs` exports the same surface —
`subscribeSpyTo(source$, config?)`, `SubscriberSpy<T>`, `ObserverSpy<T>`, `ObserverSpyConfig` — so a
migration does not have to rewrite every stream assertion in the same commit:

```ts
import { subscribeSpyTo } from 'vitest-auto-spy/observer-spy';

const spy = subscribeSpyTo(service.load());

expect(spy.getValues()).toEqual(['a', 'b']);
expect(spy.receivedComplete()).toBe(true);
```

Four departures from upstream, each closing a defect: `getValues()` returns a **copy** (upstream
hands back its live array) and is typed `T[]` (upstream: `any[]`); `getFirstValue()` /
`getValueAt(i)` **throw** on an empty spy rather than returning `undefined` from a `T` signature;
and an **unexpected** error is thrown by the value readers, carrying the original as `cause`, rather
than rethrown out of the observer — under rxjs 7 that rethrow goes through `reportUnhandledError`
and never reaches the subscribing line. `{ expectErrors: true }` keeps the readers open, as upstream.

`autoUnsubscribe()`, `queueForAutoUnsubscribe()` and `fakeTime()` are **not implemented**. Use
`using spy = subscribeSpyTo(source$)` — `SubscriberSpy` is disposable — and `setupFakeTimers()` with
`await advanceTimers(ms)`, or rxjs's `TestScheduler` directly.

**It is a bridge, and the destination differs in kind.** observer-spy is synchronous inspection:
subscribe, let things happen, then read. A stream that never emits leaves a spy with no values, so a
spec reading `getValues()` gets `[]`, asserts about it, and passes having observed nothing. §8's
`expectEmission` / `expectEmissions` invert that — the assertion _is_ the await, and silence is a
failure with a watchdog. Land the suite green on `subscribeSpyTo`, then move the assertions over.

Full mapping, including what upstream cannot do at all:
<https://asdalexey.github.io/vitest-auto-spy/migrating-jasmine>.

An Angular suite that came through `ng generate @schematics/angular:refactor-jasmine-vitest` rather
than through `jasmine-auto-spies` is a different input — a `MockedObject<T>` literal per double and
`// TODO: vitest-migration:` comments on the `createSpyObj` calls it could not expand. That diff is
covered at <https://asdalexey.github.io/vitest-auto-spy/migrating-angular-schematic>; the answer to
all three TODO categories is `createSpyFromClass(Api)`, which reads the prototype, not the call site.
