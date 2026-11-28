---
title: Migrating from jasmine-auto-spies
description: Move Jasmine tests to Vitest. Keep existing spies working with the compatibility import, then rewrite them with the codemod.
---

# Migrating from jasmine-auto-spies

Use this guide to move tests that use `jasmine-auto-spies` or `jasmine.*` to Vitest. First, get the
suite running with the compatibility import. Then run the codemod to switch to Vitest's spy API.
This Vitest test still uses Jasmine's spy syntax:

```ts
import { expect, it } from 'vitest';
import { jasmine } from 'vitest-auto-spy/jasmine';

it('returns the saved name', () => {
  const api = jasmine.createSpyObj('ApiService', ['load']);
  api.load.and.returnValue('Ann');
  expect(api.load()).toBe('Ann');
});
```

`vitest-auto-spy/jasmine` is the **bridge**. It keeps `.and`, `.calls`, and `.withArgs` working on
spies created by this library.

Don't replace `spyOn` with `vi.spyOn` by hand: the Vitest spy calls the real method by default.
See [how to keep the stub](#spyon-means-the-opposite-thing-on-the-two-sides).

## Step by step

1. **Install the package and remove the old one.**

   ```bash
   npm i -D vitest-auto-spy
   npm rm jasmine-auto-spies
   ```

   If your Angular suite uses Karma, [switch the test runner](#if-the-suite-is-angular-s) before running the suite.

2. **Switch to the bridge.** Change the import path and keep the imported names.

   ```diff
   - import { createSpyFromClass, provideAutoSpy, type Spy } from 'jasmine-auto-spies';
   + import { createSpyFromClass, provideAutoSpy, type Spy } from 'vitest-auto-spy/jasmine';
   ```

   If a file uses `jasmine.createSpyObj`, `jasmine.clock()`, or another `jasmine.*` member, add this import:

   ```ts
   import { jasmine } from 'vitest-auto-spy/jasmine';
   ```

   Enable Vitest globals so existing calls to `describe`, `it`, and `expect` still work without
   imports. The codemod also writes `vi` without an import:

   ```ts
   // vitest.config.ts
   export default defineConfig({ test: { globals: true } });
   ```

   The namespace import does not define bare globals such as `spyOn`. Use the equivalents in the
   Jasmine globals table below for those calls.

3. **Run `npx vitest run`.** Fix failures before rewriting the specs. This gives you a passing
   baseline on the new runner, separate from the codemod changes.

4. **Run the [codemod](/utilities/codemod).** Preview the diff, apply it, then check for leftovers:

   ```bash
   npx vitest-auto-spy codemod --from jasmine            # dry run: prints a diff, writes nothing
   npx vitest-auto-spy codemod --from jasmine --write    # apply
   npx vitest-auto-spy codemod --from jasmine --verify   # exit 1 if jasmine code is left
   ```

   The codemod removes `.and` where it can, turns Jasmine strategies into `mock*` calls, and
   rewrites `jasmine.*` calls. It reports anything it cannot rewrite as `file:line`.

   Pass `--from jasmine` or `--from jasmine-auto-spies`. The default, `--from auto`, skips files
   where a bare `spyOn(` is the only Jasmine code. A manual rename can then
   [call the real method without warning](#spyon-means-the-opposite-thing-on-the-two-sides).

5. **Run the tests again.** Fix the rows marked **✎** in the [auto-spies table](#the-auto-spies-api)
   by hand; the codemod leaves them alone.

6. **Remove bridge imports you no longer need.** Keep `createSpyObj` in files that still use it.
   See [what stays on the bridge](#what-the-codemod-leaves-on-the-jasmine-entry).

7. **Optional:** turn on the [lint rules for the migration](#lint-rules-while-you-are-on-the-bridge).

## Example: one spec, before and after

This Jasmine spec checks that `UserService` polls once a minute:

```ts
// user.service.spec.ts, under Jasmine
import { UserService } from './user.service';

describe('UserService', () => {
  afterEach(() => jasmine.clock().uninstall());

  it('reloads the user every minute', () => {
    jasmine.clock().install();
    const api = jasmine.createSpyObj('ApiService', ['get']);
    api.get.and.returnValue(Promise.resolve({ name: 'Ann' }));
    const users = new UserService(api);

    users.startPolling();
    jasmine.clock().tick(60_000);

    expect(api.get).toHaveBeenCalledTimes(2);
  });
});
```

**On the bridge** (step 2), add this import to keep the polling test unchanged:

```ts
import { jasmine } from 'vitest-auto-spy/jasmine';
```

**After the codemod** (step 4), the original Jasmine spec gets this diff:

```diff
+import { createSpyObj } from 'vitest-auto-spy/jasmine';
+
 import { UserService } from './user.service';

 describe('UserService', () => {
-  afterEach(() => jasmine.clock().uninstall());
+  afterEach(() => vi.useRealTimers());

   it('reloads the user every minute', () => {
-    jasmine.clock().install();
-    const api = jasmine.createSpyObj('ApiService', ['get']);
-    api.get.and.returnValue(Promise.resolve({ name: 'Ann' }));
+    vi.useFakeTimers();
+    const api = createSpyObj('ApiService', ['get']);
+    api.get.mockReturnValue(Promise.resolve({ name: 'Ann' }));
     const users = new UserService(api);

     users.startPolling();
-    jasmine.clock().tick(60_000);
+    vi.advanceTimersByTime(60_000);
```

Check the clock and the spy after the rewrite:

- `vi.useFakeTimers()` also fakes `Date`; `jasmine.clock().install()` does not. Tests that set
  `mockDate()` and check the fake `Date.now()` keep working. Update tests that need real time.
  See [how the fake clock handles `Date`](#clock-install-leaves-date-real).
- `createSpyObj` still comes from the bridge. If you have the class, use a typed spy to check
  method names at compile time:

  ```ts
  import { createSpyFromClass } from 'vitest-auto-spy';

  const api = createSpyFromClass(ApiService);
  api.get.resolveWith({ name: 'Ann' });
  ```

## `spyOn` means the opposite thing on the two sides

::: danger A passing test can still run the real method
Jasmine's `spyOn(obj, 'm')` replaces the method with a stub. Vitest's `vi.spyOn(obj, 'm')` calls the
real method unless you give it a different implementation.

```diff
- spyOn(analytics, 'track');            // jasmine: track() never runs
+ vi.spyOn(analytics, 'track');         // Vitest: track() runs on every call
+ vi.spyOn(analytics, 'track').mockImplementation(() => undefined); // what the jasmine line meant
```

The middle line compiles and the spy assertions can still pass. Check for side effects: `track()`
can write to a store, send a request, or throw, and a failure may appear in another spec.

The same default applies to property spies. Jasmine defaults to the getter when you omit the third
argument to `spyOnProperty`. Use an explicit `'get'` in Vitest: the two-argument `vi.spyOn(obj, 'p')`
expects a method and can throw `can only spy on a function`.

The `jasmine-spy-on` transform adds `.mockImplementation(() => undefined)` and fills in a missing
`'get'`. It skips the stub if the line already sets behavior with `.and.…` or a `mock…` call.
:::

### `mockReset()` brings the call-through back

Use `mockClear()` to replace Jasmine's `spy.calls.reset()`: it clears call history and keeps the
stub. Jasmine has no `mockReset()`. Vitest 3 and later reset implementations differently from
what the Jest 29 docs describe:

| Before `mockReset()`                                | After it, on Vitest                         | After it, per the Jest 29 docs |
| --------------------------------------------------- | ------------------------------------------- | ------------------------------ |
| `vi.fn(() => 'impl').mockReturnValue('x')`          | `'impl'`, the implementation passed to `fn` | `undefined`                    |
| `vi.fn().mockReturnValue('x')`                      | `undefined`                                 | `undefined`                    |
| `vi.spyOn(api, 'load').mockImplementation(() => …)` | **the real `load`**, still spied            | `undefined`                    |

If you call `mockReset()` in `afterEach`, it removes the stub the codemod added to `vi.spyOn`.
Later tests call the real method. Use `mockClear()` to forget calls, or reapply
`.mockImplementation(() => undefined)` after the reset.

On a spy from `createSpyFromClass(Api)`, `spy.load.mockReset()` removes `mockReturnValue` and
`mockImplementation`. The method returns `undefined` unless it still has a `calledWith(…)`,
`resolveWith(…)`, or `nextWith(…)` setup. `resetAutoSpy(spy)` clears both kinds of setup.
`clearAutoSpy(spy)` clears just the call history for the whole object. See
[control helpers](/core/control-helpers#resetting-spies-—-clearautospy-resetautospy).

## The auto-spies API

`jasmine-auto-spies` and [`jest-auto-spies`](/migrating) share a core. They use the same options
(`methodsToSpyOn`, `observablePropsToSpyOn`, `gettersToSpyOn`, `settersToSpyOn`) and helpers
(`calledWith`, `resolveWith`, `nextWith`, `nextWithValues`, `accessorSpies`). Drop `.and` when
moving async helpers to the native API:

```ts
spy.load.and.nextWith(user); // jasmine-auto-spies
spy.load.nextWith(user); // jest-auto-spies and vitest-auto-spy
```

The middle column shows what works on the bridge. The last column shows what to use after the
codemod. Fix rows marked **✎** by hand.

| `jasmine-auto-spies`                                               | on `vitest-auto-spy/jasmine`                                         | the end state                                               |
| ------------------------------------------------------------------ | -------------------------------------------------------------------- | ----------------------------------------------------------- |
| `createSpyFromClass(C)`                                            | identical                                                            | `createSpyFromClass` from `vitest-auto-spy`                 |
| `createSpyFromClass(C, ['load', 'save'])`                          | identical                                                            | unchanged                                                   |
| `methodsToSpyOn` / `observablePropsToSpyOn`                        | identical: adds to the methods found                                 | unchanged                                                   |
| `gettersToSpyOn` / `settersToSpyOn`                                | identical                                                            | unchanged                                                   |
| `providedMethodNames`                                              | accepted, merged into `methodsToSpyOn`, warns once per call          | ✎ rename it to `methodsToSpyOn`                             |
| `createFunctionSpy<F>('name')`                                     | identical                                                            | `createFunctionSpy` from `vitest-auto-spy`                  |
| `provideAutoSpy(C)`                                                | identical `{ provide, useValue }`                                    | `provideAutoSpy` from `/angular` (or `/nestjs`, `/vue`)     |
| `createSpyObj(base, names, props?)`                                | identical, all four argument forms                                   | **stays on `/jasmine`**; nothing else exports it            |
| `type Spy<T>`                                                      | the same shape, **without** `@types/jasmine`                         | `Spy<T>` from `vitest-auto-spy`                             |
| `createObservableWithValues`                                       | from `vitest-auto-spy/rxjs`, unchanged                               | unchanged                                                   |
| `spy.m.and.returnValue(v)`                                         | identical                                                            | `spy.m.mockReturnValue(v)`                                  |
| `spy.m.and.returnValues(a, b)`                                     | identical                                                            | `.mockReturnValueOnce(a).mockReturnValueOnce(b)`            |
| `spy.m.and.callFake(fn)`                                           | identical                                                            | `spy.m.mockImplementation(fn)`                              |
| `spy.m.and.stub()`                                                 | identical                                                            | `spy.m.mockImplementation(() => undefined)`                 |
| `spy.m.and.throwError('boom')`                                     | identical                                                            | `.mockImplementation(() => { throw new Error('boom'); })`   |
| `spy.m.and.resolveTo(v)`                                           | identical                                                            | `spy.m.mockResolvedValue(v)`                                |
| `spy.m.and.callThrough()`                                          | **goes back to the answers configured with this library**; see below | reported, left as written                                   |
| `spy.m.and.identity`                                               | the spy's name                                                       | ✎ Vitest has no spy name to read; delete the line           |
| `spy.m.and.resolveWith / rejectWith / resolveWithPerCall`          | identical                                                            | drop `.and`: `spy.m.resolveWith(v)`                         |
| `spy.m.and.nextWith / nextOneTimeWith / nextWithValues`            | identical                                                            | drop `.and`                                                 |
| `spy.m.and.nextWithPerCall / throwWith / complete / returnSubject` | identical                                                            | drop `.and`                                                 |
| `spy.m.withArgs(1).and.returnValue(v)`                             | identical                                                            | `spy.m.calledWith(1).mockReturnValue(v)`                    |
| `spy.m.withArgs(1).and.stub / throwError / resolveTo`              | identical                                                            | `spy.m.calledWith(1)` + `failWith` / `resolveWith`          |
| `spy.m.withArgs(1).and.callFake / callThrough / returnValues`      | **throws, naming the alternative**; see below                        | ✎ configure the whole spy, or the value for those arguments |
| `expect(spy.m.withArgs(1)).toHaveBeenCalled()`                     | **no counterpart**: `withArgs` returns a chain, not a spy            | ✎ `expect(spy.m).toHaveBeenCalledWith(1)`                   |
| `spy.m.calls.count()` / `any()`                                    | identical                                                            | ✎ `spy.m.mock.calls.length`                                 |
| `spy.m.calls.argsFor(i)` / `allArgs()`                             | identical                                                            | ✎ `spy.m.mock.calls[i]` / `spy.m.mock.calls`                |
| `spy.m.calls.all()` / `first()` / `mostRecent()`                   | identical                                                            | ✎ `spy.m.mock.calls` beside `spy.m.mock.results`            |
| `spy.m.calls.thisFor(i)`                                           | identical                                                            | ✎ `spy.m.mock.instances[i]`                                 |
| `spy.m.calls.reset()`                                              | identical                                                            | ✎ `spy.m.mockClear()`                                       |
| `spy.m.calls.saveArgumentsByValue()`                               | **does nothing**; see below                                          | ✎ take the copy in a `mockImplementation`                   |
| `spy.accessorSpies.getters.x.and.returnValue(v)`                   | identical                                                            | `spy.accessorSpies.getters.x.mockReturnValue(v)`            |

Tests that use `.calls` can still compile and pass on the bridge after the codemod. Use
[`prefer-native-spy-api`](/utilities/eslint-plugin) to find those calls.

The helpers on `.and` depend on the method's return type. Promise methods get `resolveWith` and
`rejectWith`. Observable methods get `nextWith` and related helpers after you add
`import 'vitest-auto-spy/rxjs'` to your setup file.

The `@hirez_io/observer-spy` table is in [its own section](#hirez-io-observer-spy-comes-along-too).

### Three `withArgs` strategies have no argument-scoped form

Use `.withArgs(…)` to set a response for one argument list. `stub()`, `throwError(e)`, and
`resolveTo(v)` work there. `callFake(fn)`, `callThrough()`, and `returnValues(a, b)` set an
implementation for the whole spy, so they throw on a `withArgs` chain. The error suggests a
replacement:

```text
[vitest-auto-spy] load.withArgs(…).and.callFake() is not supported: it installs an implementation,
and an implementation answers every call rather than one argument list. Configure the value for
these arguments — `.withArgs(…).and.returnValue(v)`, `.throwError(e)`, `.resolveTo(v)` — or take
the whole spy with `load.and.callFake(…)`, which is what jasmine's own strategy does to every call
anyway.
Docs: https://asdalexey.github.io/vitest-auto-spy/migrating-jasmine#three-withargs-strategies-have-no-argument-scoped-form
```

This library's spies support `withArgs` on the bridge and `calledWith` after migration.
`vi.spyOn(obj, 'm')` has no `calledWith`, so rewrite `spyOn(obj, 'm').withArgs(1)` by hand.
Branch on the arguments inside `mockImplementation`, or use `createSpyFromClass` or
`createAutoMock` to get a spy with `calledWith`.

## jasmine's own globals

If `jasmine.*` fails with `ReferenceError: jasmine is not defined`, import the namespace in that
spec. For bare calls such as `spyOn`, see the table below.

```ts
import { jasmine } from 'vitest-auto-spy/jasmine';
```

The bridge adds nothing to `globalThis`. Import `jasmine` in each file that uses it. The codemod
removes that import when the file no longer needs it.

| jasmine                                                           | under Vitest                                                                   | notes                                                                                                                     |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `spyOn(o, 'm')`                                                   | `vi.spyOn(o, 'm').mockImplementation(() => undefined)`                         | ⚠️ [Vitest calls the real method by default](#spyon-means-the-opposite-thing-on-the-two-sides)                            |
| `spyOnProperty(o, 'p', 'get')`                                    | same stub, with the accessor kind as the third argument                        | Vitest calls the original accessor by default                                                                             |
| `jasmine.createSpy('load')`                                       | `vi.fn()`                                                                      | the name goes; Vitest reports the variable                                                                                |
| `jasmine.createSpy('load', original)`                             | `vi.fn(original)`                                                              | the original function is kept                                                                                             |
| `jasmine.createSpyObj(…)`                                         | `createSpyObj` from `vitest-auto-spy/jasmine`                                  | all of upstream's forms; prefer a class or a type where there is one                                                      |
| `jasmine.any` / `anything` / `objectContaining`                   | `expect.any` / `expect.anything` / …                                           | named the same on both sides                                                                                              |
| `jasmine.arrayContaining` / `stringMatching` / `stringContaining` | `expect.arrayContaining` / …                                                   | named the same on both sides                                                                                              |
| `jasmine.truthy` / `falsy` / `empty` / `notEmpty`                 | **no `expect.*` twin**                                                         | `registerJasmineMatchers()`, below                                                                                        |
| `jasmine.is` / `mapContaining` / `setContaining`                  | **no `expect.*` twin**                                                         | `registerJasmineMatchers()`, below                                                                                        |
| `jasmine.arrayWithExactContents`                                  | **no `expect.*` twin**                                                         | `registerJasmineMatchers()`, below                                                                                        |
| `jasmine.clock().install()` / `.uninstall()`                      | `vi.useFakeTimers()` / `vi.useRealTimers()`                                    | ⚠️ on the bridge, `install()` keeps `Date` real, as jasmine; see below                                                    |
| `jasmine.clock().tick(n)`                                         | `vi.advanceTimersByTime(n)`                                                    | `tick` and `advanceTimersByTime` do not wait for promises; [`advanceTimers`](/utilities/fake-timers) does                 |
| `jasmine.clock().mockDate(d)`                                     | `vi.setSystemTime(d)`                                                          | this is what fakes `Date`; see below                                                                                      |
| `jasmine.clock().withMock(fn)`                                    | on the namespace; **no `vi` twin**                                             | the codemod reports it and leaves it                                                                                      |
| `jasmine.addMatchers(m)`                                          | `expect.extend(m)`                                                             | on the bridge, jasmine's own factory shape runs directly; [see below](#addmatchers-takes-jasmine-s-factories-as-they-are) |
| `jasmine.addCustomEqualityTester(t)`                              | `expect.addEqualityTesters([t])`                                               | one tester, wrapped in the array Vitest takes                                                                             |
| `jasmine.DEFAULT_TIMEOUT_INTERVAL = n`                            | **set `testTimeout` and `hookTimeout`**                                        | `vi.setConfig({ testTimeout: n, hookTimeout: n })`; [both](#the-timeout-is-two-numbers-here)                              |
| `jasmine.getEnv()`                                                | **none**                                                                       | ordering and bail are `vitest.config.ts`, not a runtime environment                                                       |
| `jasmine.addSpyStrategy` / `setDefaultSpyStrategy`                | **none**                                                                       | write the behaviour as a `mockImplementation` where the spy is built                                                      |
| `jasmine.Spy` (the type)                                          | `Mock` from `vitest`                                                           | a single mock function                                                                                                    |
| `jasmine.SpyObj<T>` (the type)                                    | `Spy<T>` from this package                                                     | the whole object, not a single function                                                                                   |
| `fdescribe` / `fit`                                               | `describe.only` / `it.only`                                                    |                                                                                                                           |
| `xdescribe` / `xit` / `xtest`                                     | `describe.skip` / `it.skip`                                                    | a leftover `xit` fails with `TS2304: Cannot find name 'xit'`                                                              |
| `expect(x).toBeTrue()` / `.toBeFalse()`                           | `.toBe(true)` / `.toBe(false)`                                                 | ⚠️ **not** `toBeTruthy` / `toBeFalsy`, which Vitest's own error suggests                                                  |
| `expect(x).toHaveSize(n)`                                         | `.toHaveLength(n)`                                                             |                                                                                                                           |
| `expect(spy).toHaveBeenCalledOnceWith(a)`                         | `expect(spy).toHaveBeenCalledTimes(1)` + `expect(spy).toHaveBeenCalledWith(a)` | compatible with the Vitest 2.1 peer floor                                                                                 |
| `expect(el).toHaveClass(c)`                                       | **none**                                                                       | outside browser mode; `expect(el.classList.contains(c)).toBe(true)`                                                       |
| `expect(x).withContext(msg).toBe(y)`                              | `expect(x, msg).toBe(y)`                                                       | ⚠️ [Vitest drops the message without warning](#withcontext-does-not-throw-it-loses-the-message)                           |
| `fail(msg)`                                                       | `expect.fail(msg)`                                                             | there is no `vi.fail`                                                                                                     |
| `it('x', (done) => …)`                                            | `async` + `await`                                                              | **not rewritten**: Vitest passes a `TestContext`, not a `done`                                                            |

Rewrite `done` callbacks by hand: decide what the test must await, or it could pass before the
assertion runs. The [`await-emission`](/utilities/eslint-plugin) lint rules help find those tests.

### The eight matchers with no `expect.*` twin

Vitest has no built-in replacements for `jasmine.truthy`, `falsy`, `empty`, `notEmpty`, `is`,
`mapContaining`, `setContaining`, or `arrayWithExactContents`. These are asymmetric matchers: pass
them as expected values inside `toEqual(…)`, `objectContaining({ … })`, or `toHaveBeenCalledWith(…)`.
Register the replacements once in your setup file:

```ts
import { registerJasmineMatchers } from 'vitest-auto-spy/jasmine';

registerJasmineMatchers(); // once, in the setup file

expect({ tags: [] }).toEqual({ tags: expect.jasmineEmpty() });
```

On `expect`, use the `jasmine` prefix: `expect.jasmineEmpty()`, `expect.jasmineIs()`, and so on.
Chai already uses `.empty` and `.is`, so `expect.extend({ empty })` throws
`Cannot set property empty of #<Assertion> which has only a getter`. On the `jasmine` namespace,
keep the original names, such as `jasmine.empty()`.

The first access to any `jasmine.*` member registers the matchers. If your spec only uses the
matchers from the namespace, skip the setup call.

`jasmine.mapContaining` matches **keys** by equality, as jasmine does, not by `Map.has`. So a matcher
in key position works, and so does an object key that is equal but not the same reference:

```ts
expect(byUser).toEqual(jasmine.mapContaining(new Map([[{ id: 7 }, 'ada']])));
expect(byName).toEqual(jasmine.mapContaining(new Map([[jasmine.any(String), 'ada']])));
```

### `addMatchers` takes jasmine's factories as they are

On the bridge, keep your Jasmine matcher factories. Jasmine passes `matchersUtil` to each factory,
which returns `{ compare, negativeCompare? }`. If you switch to Vitest's `expect.extend`, pass the
comparison function itself instead.

```ts
import { jasmine } from 'vitest-auto-spy/jasmine';

jasmine.addMatchers({
  toBeWithin: (matchersUtil, customTesters) => ({
    compare(actual: number, floor: number, ceiling: number) {
      return {
        pass: actual >= floor && actual <= ceiling,
        message: () => `expected ${actual} to be within ${floor}..${ceiling}`,
      };
    },
  }),
});

expect(7).toBeWithin(5, 10);
expect(3).not.toBeWithin(5, 10);
```

For `.not`, the bridge uses `negativeCompare` if the factory supplies it and flips its `pass`
for Vitest. Otherwise it runs `compare` and inverts the verdict. You can also pass native Vitest
matcher functions to `jasmine.addMatchers`. Use separate calls for the two formats: mixing a
factory and a Vitest matcher in one object fails to compile.

If a factory omits `message`, the bridge builds one from the matcher name, as Jasmine does:
`Expected 3 not to be within 5, 10.`. `matchersUtil.equals(a, b)` uses the runner's equality check,
including testers added with `jasmine.addCustomEqualityTester`. `pp` formats values for display.

If you declare matchers in a separate file, import the types:

```ts
import type { JasmineCustomMatcherFactories, JasmineMatchersUtil } from 'vitest-auto-spy/jasmine';

const matchers: JasmineCustomMatcherFactories = {
  toBeWithin: (util: JasmineMatchersUtil) => ({ compare: (actual, floor, ceiling) => ({ pass: true }) }),
};
```

`JasmineCustomMatcherFactories`, `JasmineCustomMatcherFactory`, `JasmineCustomMatcher`,
`JasmineCustomMatcherResult`, `JasmineMatchersUtil` and `JasmineCustomEqualityTester` mirror
jasmine's own interfaces one for one.

### `withContext` does not throw, it loses the message

::: danger Vitest drops the assertion message
Vitest has an internal `withContext` method. It accepts the Jasmine message string but ignores it.
The assertion still runs and a failure looks like this:

```
AssertionError: expected 2 to be 3
```

The runner gives no warning. Pass the message as the second argument to `expect` so Vitest prints
it before the failure:

Vitest takes the label as the second argument of `expect`, and prints it before the failure:

```diff
- expect(sum).withContext('the sum of one and one must be three').toBe(3);
+ expect(sum, 'the sum of one and one must be three').toBe(3);
```

```
AssertionError: the sum of one and one must be three: expected 2 to be 3
```

The `jasmine-matchers` transform moves the message. Run `--verify` to find any remaining calls.
See [why Vitest gives no warning](#why-withcontext-is-silent).
:::

### The timeout is two numbers here

Jasmine's `jasmine.DEFAULT_TIMEOUT_INTERVAL` covers tests and hooks. Vitest defaults to **5000 ms**
for `testTimeout` and **10 000 ms** for `hookTimeout`. Set both to keep one limit:

```ts
// vitest.config.ts
test: {
  testTimeout: 30_000,
  hookTimeout: 30_000, // jasmine had one number; Vitest defaults this one separately
}
```

On the bridge, assigning `jasmine.DEFAULT_TIMEOUT_INTERVAL` has no effect. It warns once and names
both settings. To set them for one test file, use `vi.setConfig({ testTimeout: n, hookTimeout: n })`.

If `beforeEach` times out, Vitest reports the test as failed. A line like `× should create 10045ms`
can mean the hook timed out before the test body ran.

### `clock().install()` leaves `Date` real

Jasmine's `clock().install()` fakes timers, but leaves `Date` alone. Vitest's `useFakeTimers()`
also fakes `Date`: an elapsed-time check like `Date.now() - start` can stay at `0`, and a cache
that relies on real time may not expire.

On the bridge, `install()` fakes the same timers as `vi.useFakeTimers()` but leaves `Date` real.
Call `mockDate()` to fake `Date` too. After that, `tick(ms)` also advances `Date.now()`:

```ts
jasmine.clock().install();
jasmine.clock().mockDate(new Date('2026-01-01')); // this fakes Date
```

After the codemod, `vi.useFakeTimers()` fakes `Date` too, and `vi.advanceTimersByTime(ms)`
advances it. Check any test that relies on real time.

Call `mockDate()` right after `install()`, before any timers are scheduled. The bridge reinstalls
the fake clock to take over `Date`. Unlike Jasmine, this drops pending timers and produces a warning:

```text
[vitest-auto-spy] jasmine.clock().mockDate() took Date over after 2 callbacks had already been
scheduled, and re-installing the fake clock dropped them. Call mockDate() right after install(),
before anything schedules a timer.
Docs: https://asdalexey.github.io/vitest-auto-spy/migrating-jasmine#clock-install-leaves-date-real
```

Without `install()`, `mockDate()` fakes `Date` and leaves timers real. Jasmine throws
`Mock clock is not installed`; the bridge warns once instead. Call `install()` first, or use
[`mockSystemTime()`](/utilities/fake-timers) to fake just the date.

## Two helpers that behave differently on the bridge

### `.and.callThrough()` restores this library's dispatch

Jasmine's `callThrough` restores the real method behind `spyOn`. A `createSpyFromClass` spy has
no real method to call, so `jasmine-auto-spies` returned `undefined`. On the bridge,
`.and.callThrough()` removes the current strategy and lets `calledWith` or `withArgs` answer again:

```ts
service.load.withArgs(7).and.returnValue('seven');
service.load(7); // 'seven'

service.load.and.returnValue('flat'); // a strategy replaces the implementation
service.load(7); // 'flat'

service.load.and.callThrough(); // and this is the way back
service.load(7); // 'seven'
```

The codemod leaves `.and.callThrough()` and reports its `file:line`. On a library spy, remove the
call or replace it with the `calledWith` setup you intended. On a `vi.spyOn` of a real object,
remove it: `vi.spyOn` already calls the original method by default.

### `.calls.saveArgumentsByValue()` is a no-op

Jasmine can copy arguments so you can check an object as it was at call time. Vitest, Bun, and
`node:test` keep the reference. The bridge accepts `saveArgumentsByValue()` but does not copy anything.

A passing test can now check the object **after** it changed, even though the test code looks the same.

If you cannot spell out the expected argument, use [`captureArg`](/core/control-helpers) to read
it with its type in the assertion:

```ts
import { captureArg } from 'vitest-auto-spy';

const payload = captureArg<Payload>();

expect(service.save).toHaveBeenCalledWith(payload);
expect(payload.value.id).toBe(7);
```

`captureArg` still holds a reference. If the code changes the object after the call, copy it
inside `mockImplementation`:

```ts
const seen: Payload[] = [];

service.save.mockImplementation((payload: Payload) => {
  seen.push(structuredClone(payload));
});
```

Use [`no-save-arguments-by-value`](/utilities/eslint-plugin) to reliably find remaining calls.

## On Bun and `node:test`

`vitest-auto-spy/jasmine` imports Vitest, which `bun test` and `node --test` cannot load. Use
`enableJasmineCompat()` to add `.and`, `.calls`, and `.withArgs` on those runners:

```ts
// bun-test-setup.ts
import { enableJasmineCompat } from 'vitest-auto-spy/jasmine-compat';

enableJasmineCompat();
```

- The same entry works for `node --test`.
- It registers no runner, so keep importing your runner's entry (`vitest-auto-spy/bun`,
  `vitest-auto-spy/node`) for the spies.
- Spies built **before** the call do not get `.and`. Put the call in a setup file, not in a
  `beforeEach` that runs after the spies are built.
- Calling it twice is safe.

Observable spies still need `import 'vitest-auto-spy/rxjs'` once, as usual. The jasmine entries do
not import rxjs.

## What the codemod leaves on the jasmine entry

Only `vitest-auto-spy/jasmine` exports `createSpyObj`. The codemod rewrites `jasmine.createSpyObj(…)`
to `createSpyObj(…)` and imports it from there.

You can keep `createSpyObj`, but it cannot check method names against a type. If you have a class,
use [`createSpyFromClass(C)`](/core/create-spy-from-class). If you only have an interface, use
[`createAutoMock<T>()`](/core/auto-mock-by-type). Both catch misspelled names at compile time.

The third argument creates getter and setter spies, just like Jasmine. The getter starts out
returning the value you passed. To reach both spies, get the property descriptor:

```ts
import { type JasmineMethodSpy, createSpyObj } from 'vitest-auto-spy/jasmine';

const cart = createSpyObj('cart', ['checkout'], { total: 10 });

expect(cart.total).toBe(10); // the value passed in

const { get, set } = Object.getOwnPropertyDescriptor(cart, 'total')!;

(get as JasmineMethodSpy<() => number>).and.returnValue(7); // change the answer mid-test
cart.total = 3;

expect(cart.total).toBe(7);
expect(set).toHaveBeenCalledWith(3); // assert that the code under test wrote it
```

The cast is needed because a descriptor's `get` is typed as a plain function.

## `@hirez_io/observer-spy` comes along too

If your suite also uses `@hirez_io/observer-spy`, swap to `vitest-auto-spy/observer-spy` and keep
your stream assertions while you migrate the runner. The replacement uses the same API:

```ts
import { subscribeSpyTo } from 'vitest-auto-spy/observer-spy';

const spy = subscribeSpyTo(service.load());

expect(spy.getValues()).toEqual(['a', 'b']);
expect(spy.receivedComplete()).toBe(true);
```

`ObserverSpy<T>`, `SubscriberSpy<T>`, `subscribeSpyTo` and the `{ expectErrors: true }` config are
there, with the same method names: `getValues`, `getValuesLength`, `getValueAt`, `getFirstValue`,
`getLastValue`, `getError`, `receivedNext`, `receivedError`, `receivedComplete`, `onComplete`,
`onError`, `expectErrors`, `unsubscribe`.

The middle column shows what the replacement supports. The last column shows what to use when you
rewrite the asserts by hand. The codemod does not change them.

| `@hirez_io/observer-spy`                    | on `vitest-auto-spy/observer-spy`          | the end state                                                                       |
| ------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------- |
| `subscribeSpyTo(source$)`                   | identical                                  | `await expectEmission(source$)` where one value is the point                        |
| `subscribeSpyTo(source$, { expectErrors })` | identical                                  | `await expectError(source$)`                                                        |
| `spy.getFirstValue()`                       | identical, but **throws** on an empty spy  | `await expectEmission(source$)`                                                     |
| `spy.getValues()`                           | identical, but a **copy**, typed `T[]`     | `await expectEmissions(source$, n)`                                                 |
| `spy.getValueAt(i)` / `getLastValue()`      | identical (`getValueAt` throws when empty) | `await expectEmissions(source$, n)` then index                                      |
| `spy.receivedComplete()` / `onComplete()`   | identical                                  | `await expectCompletion(source$)`                                                   |
| `spy.receivedError()` / `getError()`        | identical                                  | `await expectError(source$)`; it resolves _with_ the error                          |
| `spy.receivedNext()`                        | identical                                  | `await expectNoEmission(source$)` for the negative                                  |
| `autoUnsubscribe()`                         | **not implemented**                        | `using spy = subscribeSpyTo(source$)`                                               |
| `queueForAutoUnsubscribe(sub)`              | **not implemented**                        | use `using`, or use assertion helpers that unsubscribe on their own                 |
| `fakeTime(fn)`                              | **not implemented**                        | `setupFakeTimers()` + `await advanceTimers(ms)`, or rxjs's `TestScheduler` directly |

Check these four differences from `@hirez_io/observer-spy`:

- **`getValues()` returns a copy.** The original returns its internal array, so sorting what you read
  corrupts the spy.
- **`getValues()` is typed `T[]`**, not `any[]`, so types flow into your assertions.
- **`getFirstValue()` and `getValueAt(i)` throw when there is no value.** The original returns
  `undefined` while typed `T`. The signature is the same, so migrated specs still compile.
- **An unexpected error is thrown by the value readers** (`getValues()` and the rest), with the
  original as `cause`. The original rethrows it from the observer, where rxjs 7 reports it
  asynchronously and `expect(…).toThrow()` never sees it. `{ expectErrors: true }`, or
  `.expectErrors()` after creation, lets the readers return values anyway, as in the original.

`autoUnsubscribe()`, `queueForAutoUnsubscribe()` and `fakeTime()` are **not implemented**, and will
not be. A `SubscriberSpy` has `[Symbol.dispose]`, so `using spy = subscribeSpyTo(source$)`
unsubscribes at the end of the block. For `fakeTime`, use `setupFakeTimers()` with
`await advanceTimers(ms)`, or rxjs's `TestScheduler` directly.

::: tip Migrate stream assertions after the runner
With observer-spy, you subscribe and later read what arrived. If the stream emits nothing,
`getValues()` returns `[]` and the test can still pass.
[`expectEmission` and related helpers](/core/observable-assertions) wait for a value and fail if
none arrives. Get the tests passing with `subscribeSpyTo`, then update the assertions.
:::

## Lint rules while you are on the bridge

Use these four [`vitest-auto-spy/eslint-plugin`](/utilities/eslint-plugin) rules while you migrate
from step 2 to step 6:

| Rule                              | Level   | Reports                                                                                                      |
| --------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------ |
| `jasmine-namespace-without-entry` | `error` | `.and` / `.calls` / `.withArgs` on a library spy, in a file that installs the layer nowhere                  |
| `no-jasmine-globals`              | `error` | `jasmine.*`, bare `spyOn(` / `spyOnProperty(` / `spyOnAllFunctions(` / `fail(` / `pending(`, `.withContext(` |
| `no-save-arguments-by-value`      | `error` | calls to `saveArgumentsByValue()`                                                                            |
| `prefer-native-spy-api`           | `error` | `.and` / `.calls` where the spy's own API says the same thing; **`--fix`** where it can trace the receiver   |

All four rules ship at `error`. Keep `prefer-native-spy-api` set to `'off'` until you run the
codemod: the bridge calls it flags are expected before the rewrite.

- **`jasmine-namespace-without-entry`** catches a spy built before `enableJasmineCompat()` ran. That
  spec otherwise fails with `Cannot read properties of undefined (reading 'returnValue')`, which
  names neither the import nor the spy. The rule reads one file at a time. If a setup file that no
  spec imports installs the layer, name it: `{ setupModules: ['./test-setup'] }`.
- **`prefer-native-spy-api`** applies its fix only where the spy clearly comes from this library's
  factories. Elsewhere it offers a suggestion, because `.calls` on another object may be that
  object's own method. It skips chains with `?.`: `spy?.and.returnValue(1)` would lose its guard. It
  has no rewrite for `.and.callThrough`, `.and.returnValues`, `.and.stub`, `.and.throwError`,
  `.and.resolveTo`, `.calls.all()` or `.calls.mostRecent()`. Check the codemod report and fix what remains by hand.
- **`no-done-callback`**, on at `error` in the recommended config, also helps. Besides `(done) =>` it
  reports `done.fail(…)`. That call throws `done.fail is not a function`, usually inside an `error`
  callback or a `.catch()` nobody awaits. The test has already finished, so the run stays **green on
  the path that should fail it**.

## If the suite is Angular's

If your Angular suite uses Karma, run Angular's migration to switch the runner to Vitest. Use the
codemod above to migrate the spies. The two commands change different things, so run both.

Choose the command and settings for your Angular version:

- **`@angular/build:unit-test`** is marked `[EXPERIMENTAL]` up to 22.1.x and stable from **22.2.0**.
  The label does not stop it working. It means the builder options are not covered by Angular's
  deprecation policy.
- **`runner`** has no default in v20, so you must set it. From **v21** it defaults to `"vitest"`.
- **`ng generate @schematics/angular:refactor-jasmine-vitest`** exists from **v21**. It is hidden from
  `ng generate --help`, so type the full name.
- **There is no `karma-to-vitest` generate schematic.** From **v22** there is an optional
  `ng update` migration. A plain `ng update` does not run it; name it:

  ```bash
  ng update @angular/cli --migrate-only --name migrate-karma-to-vitest
  ```

The Angular schematic rewrites some calls differently:

- `fail(msg)` becomes `throw new Error(msg)` in v21, and `expect.fail(msg)` in v22.
- `toHaveBeenCalledOnceWith(args)` becomes `toHaveBeenCalledTimes(1)` plus
  `toHaveBeenCalledWith(args)`. Use the same pair here to support the Vitest 2.1 peer floor.

For `jasmine.createSpyObj`, the schematic creates an object of `vi.fn()` calls and adds three TODO
comments. See [the schematic's output](/migrating-angular-schematic).

If you set the builder's `browsers` option, `vi.spyOn` throws on module exports because ES module
exports are read-only in the browser. Spies on classes and prototypes, including those from this
library, still work. See [Vitest browser mode](/runtimes/vitest#browser-mode-module-exports-are-read-only).

## What else you gain

The [Jest migration guide](/migrating#what-you-gain-by-moving) lists benefits that also apply here:
type-driven factories, [fixtures](/utilities/fixtures), [observable assertions](/core/observable-assertions),
[console spies](/utilities/console), Bun, `node:test`, and Angular's `TestBed`
[under `bun test`](/runtimes/bun-angular). If you used Karma, run
[`npx vitest-auto-spy doctor`](/utilities/cli) to find leftover `karma.conf.*` and Karma-only setup files.

## Did the migration lose a test?

Follow the [Jest migration check](/migrating#did-the-migration-lose-a-test). `compareTestRuns`
compares test names in two JSON reports, not just totals. Equal totals can hide a missing
`describe` and a flaky test that started passing. Karma does not produce that report, so use the
first passing Vitest run on the bridge (step 3) as your baseline.

## In depth

### Why the bridge exists

If you switch runners and remove `.and` from the specs at the same time, a failing test can come
from either change. The bridge lets you check the runner in step 3 before rewriting specs in step 4.

### Why `withContext` is silent

Vitest's chai layer has an `@internal` method named `withContext`, meant for a flags object:

```js
// @vitest/expect
withContext(context) { for (const key in context) utils.flag(this, key, context[key]); return this; }
```

With a string, `for…in` treats character indices as Chai flag names and returns the assertion.
The assertion still runs, but it has no message. Verified on Vitest 4.1.9.

### Why `saveArgumentsByValue()` does nothing

Copying every argument would slow down all spies, even in projects that never use this helper.

### A project that never imports the entry carries none of it

The core checks for the Jasmine layer only when it needs it, as it does for RxJS. Without a
Jasmine import, the compatibility code stays out of the bundle. Each spy makes one `undefined` check.

### How `mapContaining` finds keys

`Map.has` compares object keys by reference. That misses matcher keys and separate objects with
equal values. Like Jasmine's `MapContaining`, `jasmine.mapContaining` looks for a pair whose key
and value both match. It tries a direct lookup first in case the key is the same reference.

### Where observer-spy's defects came from

`@hirez_io/observer-spy` is by far the larger of the two packages: roughly **112k downloads a week
against 11k** for `jasmine-auto-spies`. It was last published in 2022.

- `getValues()` is typed `any[]` upstream (its own issue #69), which turns every inference in the
  assertion into `any`.
- Upstream rethrows an unexpected error from the observer's `error()`. That reached the subscriber
  under rxjs 6. Under rxjs 7, anything thrown from an observer callback goes through
  `reportUnhandledError` and is reported asynchronously. So `expect(() => subscribeSpyTo(failing$)).toThrow()`
  does not see it, and Vitest reports an unattributed failure against the file. Throwing from the
  value readers keeps the error loud and puts it where the spec can read it.
- `autoUnsubscribe` is a global `afterEach` plus a registry; `using` replaces both with a block
  scope. `fakeTime` is built on rxjs's `TestScheduler` virtual time and on the `done` callback, and
  neither survives the move as it is.

### What upstream cannot do

`jasmine-auto-spies@8.0.1` was published in **August 2023**. It ships only CommonJS, has no `exports`
map, and requires `rxjs <8` and `jasmine-core <6`. It has about a dozen open issues, the oldest
from February 2021. The 2022 request for Vitest support (issue #66) and the community
`vitest-auto-spies` proposal (PR #90) did not make it into that package. Here's what the migration adds:

- **`Spy<T>` without `@types/jasmine`.** Upstream's types start with
  `/// <reference types="jasmine" />`. Importing `Spy<T>` pulls the global jasmine namespace into
  your type check, and needs that package installed. This library's `Spy<T>` uses Vitest's
  `MockInstance` and references nothing global.
- **Asymmetric matchers inside `calledWith`.** Upstream compares arguments as strings
  (`javascript-stringify`), so `jasmine.any(String)` and `objectContaining(…)` inside a `calledWith`
  **never** match (issue #61, closed unfixed). Here `calledWith` runs the matcher.
- **Falsy values in `nextWithValues`.** Upstream checks `if ('value' in cfg && cfg.value)`, so
  `{ value: 0 }`, `{ value: null }` and `{ value: '' }` are silently dropped (issue #81, still open).
  This library checks `'value' in config`, so a stream of zeroes emits zeroes.
- **Abstract classes without a cast.** Upstream needs `createSpyFromClass(MyAbstractToken as any)`.
  Here an `abstract class` DI token is accepted as it is.
- **Reading the spy back out typed.** Upstream needs `TestBed.inject<any>(X)`, which loses the type
  where the spec needs it most (issue #86, never implemented). Here
  [`injectSpy(X)`](/adapters/angular) returns `Spy<X>`, and [`asSpy`](/core/spy-typing) does the same
  for a container this package has no adapter for.
- **Overload selection**, so `nextWith` on a generated API client stops demanding `HttpEvent<T>`
  from the last overload (issue #83): `asSpy<Client, { overload: 'first' }>(…)`.
- **[Strict spies](/core/strict-mode)** that fail on a method nobody configured, and
  **`onlyMethodsToSpyOn`** for an exact list of methods. Neither exists upstream.

#### A defect the two libraries shared

The original library checks only `descriptor.get` when looking for methods. It mistakes a
write-only prototype setter for a method and overwrites the spy made by `settersToSpyOn`. The
setter records no calls, so assertions fail with an empty call list. This library inherited the
same bug and now keeps the setter spy.

### Angular versions at the time of writing

`@angular/core` dist-tags on 2026-09-26: `latest` **22.2.0**, `v21-lts` **21.2.24**, `v20-lts`
**20.3.32**. The `[EXPERIMENTAL]` label on `@angular/build:unit-test` was dropped in angular-cli PR
#34095. `refactor-jasmine-vitest` is `"hidden": true` in its schematic collection, and
`migrate-karma-to-vitest` is `"optional": true`.
