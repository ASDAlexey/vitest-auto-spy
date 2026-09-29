---
title: Migrating from jasmine-auto-spies
description: Move a Jasmine or Karma test project that uses jasmine-auto-spies to Vitest. Swap one import so the specs run unchanged, then let the codemod rewrite them, with mapping tables for the auto-spies API and the jasmine globals.
---

# Migrating from jasmine-auto-spies

This page moves a Jasmine test project (often Angular on Karma) that uses `jasmine-auto-spies` or the
`jasmine.*` globals to Vitest and `vitest-auto-spy`. You do it in two steps. First you swap an
import, and the specs run unchanged. Then the codemod rewrites them into plain Vitest:

```diff
- import { createSpyFromClass, provideAutoSpy, type Spy } from 'jasmine-auto-spies';
+ import { createSpyFromClass, provideAutoSpy, type Spy } from 'vitest-auto-spy/jasmine';
```

```bash
npx vitest-auto-spy codemod --from jasmine --write
```

`vitest-auto-spy/jasmine` is called **the bridge** on this page. It brings back jasmine's `.and`,
`.calls` and `.withArgs` on every spy, so `spy.load.and.returnValue(x)` keeps working.

One rename is dangerous: jasmine's `spyOn` replaces the method, Vitest's `vi.spyOn` calls the real
one. See [`spyOn` means the opposite thing](#spyon-means-the-opposite-thing-on-the-two-sides).

## Step by step

1. **Install the package and remove the old one.**

   ```bash
   npm i -D vitest-auto-spy
   npm rm jasmine-auto-spies
   ```

   Swapping Karma for Vitest in an Angular project is covered in
   [If the suite is Angular's](#if-the-suite-is-angular-s).

2. **Point the imports at the bridge.** Change the import path and nothing else.

   ```diff
   - import { createSpyFromClass, provideAutoSpy, type Spy } from 'jasmine-auto-spies';
   + import { createSpyFromClass, provideAutoSpy, type Spy } from 'vitest-auto-spy/jasmine';
   ```

   A file that uses `jasmine.createSpyObj`, `jasmine.clock()` or another `jasmine.*` global gets one
   more line:

   ```ts
   import { jasmine } from 'vitest-auto-spy/jasmine';
   ```

   Jasmine specs use `describe`, `it` and `expect` without importing them, and the codemod writes
   `vi` the same way. Turn on Vitest globals so all four resolve:

   ```ts
   // vitest.config.ts
   export default defineConfig({ test: { globals: true } });
   ```

3. **Run the tests** (`npx vitest run`). Your spies behave as they did under jasmine. Whatever fails now is a real
   difference between the runners, not a missed rename. Fix it before the next step, so that a red
   run has only one possible cause.

4. **Run the [codemod](/utilities/codemod).** Without `--write` it only prints a diff:

   ```bash
   npx vitest-auto-spy codemod --from jasmine            # dry run: prints a diff, writes nothing
   npx vitest-auto-spy codemod --from jasmine --write    # apply
   npx vitest-auto-spy codemod --from jasmine --verify   # exit 1 if jasmine code is left
   ```

   It removes `.and`, turns jasmine strategies into `mock*` calls, and rewrites the `jasmine.*`
   globals. It names every spot it cannot rewrite with `file:line`.

   Always pass `--from jasmine` (or its long form, `--from jasmine-auto-spies`). The default,
   `--from auto`, skips a file whose only jasmine code is a bare `spyOn(`, and a skipped `spyOn`
   turns into a [silent call-through](#spyon-means-the-opposite-thing-on-the-two-sides).

5. **Run the tests again**, then fix the rows marked **✎** in [the auto-spies table](#the-auto-spies-api):
   no transform touches them.

6. **Remove `vitest-auto-spy/jasmine` imports** that are left. Keep only
   `import { createSpyObj } from 'vitest-auto-spy/jasmine'` in files that still call it. See [What the codemod leaves on the jasmine entry](#what-the-codemod-leaves-on-the-jasmine-entry).

7. **Optional:** turn on the [lint rules for the migration](#lint-rules-while-you-are-on-the-bridge).

## Example: one spec, before and after

A `UserService` spec with `jasmine.createSpyObj`, `and.returnValue` and `jasmine.clock()`:

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

**On the bridge** (step 2), the file gains one import and runs under Vitest as it is:

```ts
import { jasmine } from 'vitest-auto-spy/jasmine';
```

**After the codemod** (step 4), this is the diff it prints for the original Jasmine file:

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

Two things to check in the result:

- `vi.useFakeTimers()` fakes `Date` as well, while `jasmine.clock().install()` did not. A spec that
  called `mockDate()` and checks `Date.now()` against the fake clock keeps passing. A spec that needs the real time must be
  changed. See [`clock().install()` leaves `Date` real](#clock-install-leaves-date-real).
- `createSpyObj` still comes from the bridge. Where the class exists, a typed spy is better, and
  it checks every method name:

  ```ts
  import { createSpyFromClass } from 'vitest-auto-spy';

  const api = createSpyFromClass(ApiService);
  api.get.resolveWith({ name: 'Ann' });
  ```

## `spyOn` means the opposite thing on the two sides

::: danger This rename is silent, green and wrong
jasmine's `spyOn(obj, 'm')` installs a **stub**: the real method does not run. Vitest's
`vi.spyOn(obj, 'm')` **calls through**: the real method runs.

```diff
- spyOn(analytics, 'track');            // jasmine: track() never runs
+ vi.spyOn(analytics, 'track');         // Vitest: track() runs on every call
+ vi.spyOn(analytics, 'track').mockImplementation(() => undefined); // what the jasmine line meant
```

Nothing catches the middle line. It compiles, and every assertion about the spy still passes. But
the real `track()` now runs in every spec that meant to stop it. The failure shows up later, in
another file, when the real method writes to a store, sends a request or throws.

`spyOnProperty(obj, 'p', 'get')` has the same inverted default. It has one more difference: in
jasmine the third argument is optional and defaults to the getter. `vi.spyOn(obj, 'p')` with two
arguments spies on a method and throws "can only spy on a function". So a bare
`spyOnProperty(obj, 'p')` needs `'get'` written out.

The codemod's `jasmine-spy-on` transform does both for you. It adds
`.mockImplementation(() => undefined)`, and `'get'` where the third argument is missing. It skips
the stub where the line already sets an implementation (`.and.…`, or a `mock…` from a half-done
hand migration). This is why the migration needs a codemod and not a `sed` line.
:::

### `mockReset()` brings the call-through back

jasmine has no `mockReset`. `spy.calls.reset()` forgets the calls and keeps the stub, so the table
below maps it to `mockClear()`. The Jest 29 docs say `mockReset()` leaves an implementation that
returns `undefined`. On Vitest 3 and later it does something else:

| Before `mockReset()`                                | After it, on Vitest                         | After it, per the Jest 29 docs |
| --------------------------------------------------- | ------------------------------------------- | ------------------------------ |
| `vi.fn(() => 'impl').mockReturnValue('x')`          | `'impl'`, the implementation passed to `fn` | `undefined`                    |
| `vi.fn().mockReturnValue('x')`                      | `undefined`                                 | `undefined`                    |
| `vi.spyOn(api, 'load').mockImplementation(() => …)` | **the real `load`**, still spied            | `undefined`                    |

The last row is the `spyOn` trap again. The codemod turned `spyOn(api, 'load')` into
`vi.spyOn(api, 'load').mockImplementation(() => undefined)`. A `mockReset()` in `afterEach` removes
that stub, and the real method runs in every later test. To forget calls, use `mockClear()`. If the
stub must survive, set `mockImplementation(() => undefined)` again.

Spies from this library have two layers of configuration, and `mockReset()` clears only one. On `createSpyFromClass(Api)`, `spy.load.mockReset()`
drops `mockReturnValue` and `mockImplementation`, and the method answers `undefined` again. A
`calledWith(…)`, `resolveWith(…)` or `nextWith(…)` setup survives it. `resetAutoSpy(spy)` resets
both halves. `clearAutoSpy(spy)` is `calls.reset()` for the whole object. See
[Control helpers](/core/control-helpers#resetting-spies-—-clearautospy-resetautospy).

## The auto-spies API

`jasmine-auto-spies` and [`jest-auto-spies`](/migrating) are built on the same core. They share
every configuration key (`methodsToSpyOn`, `observablePropsToSpyOn`, `gettersToSpyOn`,
`settersToSpyOn`) and every helper (`calledWith`, `resolveWith`, `nextWith`, `nextWithValues`,
`accessorSpies`). The difference is where the async helpers live:

```ts
spy.load.and.nextWith(user); // jasmine-auto-spies
spy.load.nextWith(user); // jest-auto-spies and vitest-auto-spy
```

How to read the table: the middle column is the bridge, and "identical" means the line behaves as
before. The right column is the end state after the codemod. **✎** marks rows
that no transform touches: search for them by hand.

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

The `.calls` rows are the easiest to miss. The bridge adds `.calls` at run time, so a spec that
still reads `spy.m.calls.count()` after the codemod compiles and passes. The lint rule
[`prefer-native-spy-api`](/utilities/eslint-plugin) reports each one.

`.and` offers the helpers that fit the method's **return type**. A method
that returns a `Promise` gets `resolveWith` / `rejectWith`. A method that returns an `Observable`
gets `nextWith` and the rest, once the setup file has `import 'vitest-auto-spy/rxjs'`.

The `@hirez_io/observer-spy` table is in [its own section](#hirez-io-observer-spy-comes-along-too).

### Three `withArgs` strategies have no argument-scoped form

`.withArgs(…)` limits a setup to one list of arguments. `stub()`, `throwError(e)` and `resolveTo(v)`
set an answer, so they can be limited that way. `callFake(fn)`, `callThrough()` and
`returnValues(a, b)` install an _implementation_, and an implementation answers every call. So on a
`withArgs` chain these three throw, and the error says what to write instead:

```text
[vitest-auto-spy] load.withArgs(…).and.callFake() is not supported: it installs an implementation,
and an implementation answers every call rather than one argument list. Configure the value for
these arguments — `.withArgs(…).and.returnValue(v)`, `.throwError(e)`, `.resolveTo(v)` — or take
the whole spy with `load.and.callFake(…)`, which is what jasmine's own strategy does to every call
anyway.
Docs: https://asdalexey.github.io/vitest-auto-spy/migrating-jasmine#three-withargs-strategies-have-no-argument-scoped-form
```

`withArgs` exists only on this library's spies, on the bridge and after it. A `vi.spyOn(obj, 'm')`
has no `calledWith`, so rewrite `spyOn(obj, 'm').withArgs(1)` by hand. Either branch on the
arguments inside one `mockImplementation`, or build the spy with `createSpyFromClass` /
`createAutoMock`, whose methods have `calledWith`.

## jasmine's own globals

Specs use `jasmine.*`, `spyOn` and friends without importing them. Under Vitest, each one fails with
`ReferenceError: jasmine is not defined`. One import brings the whole namespace back, so the spec
runs before you rewrite anything:

```ts
import { jasmine } from 'vitest-auto-spy/jasmine';
```

Nothing is added to `globalThis`: you import `jasmine` explicitly in each file, and the codemod
removes that line at the end.

| jasmine                                                           | under Vitest                                           | notes                                                                                                     |
| ----------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `spyOn(o, 'm')`                                                   | `vi.spyOn(o, 'm').mockImplementation(() => undefined)` | ⚠️ [the default is inverted](#spyon-means-the-opposite-thing-on-the-two-sides)                            |
| `spyOnProperty(o, 'p', 'get')`                                    | same, with the accessor kind                           | same inverted default                                                                                     |
| `jasmine.createSpy('load')`                                       | `vi.fn()`                                              | the name goes; Vitest reports the variable                                                                |
| `jasmine.createSpy('load', original)`                             | `vi.fn(original)`                                      | the original function is kept                                                                             |
| `jasmine.createSpyObj(…)`                                         | `createSpyObj` from `vitest-auto-spy/jasmine`          | all of upstream's forms; prefer a class or a type where there is one                                      |
| `jasmine.any` / `anything` / `objectContaining`                   | `expect.any` / `expect.anything` / …                   | named the same on both sides                                                                              |
| `jasmine.arrayContaining` / `stringMatching` / `stringContaining` | `expect.arrayContaining` / …                           | named the same on both sides                                                                              |
| `jasmine.truthy` / `falsy` / `empty` / `notEmpty`                 | **no `expect.*` twin**                                 | `registerJasmineMatchers()`, below                                                                        |
| `jasmine.is` / `mapContaining` / `setContaining`                  | **no `expect.*` twin**                                 | `registerJasmineMatchers()`, below                                                                        |
| `jasmine.arrayWithExactContents`                                  | **no `expect.*` twin**                                 | `registerJasmineMatchers()`, below                                                                        |
| `jasmine.clock().install()` / `.uninstall()`                      | `vi.useFakeTimers()` / `vi.useRealTimers()`            | ⚠️ on the bridge, `install()` keeps `Date` real, as jasmine; see below                                    |
| `jasmine.clock().tick(n)`                                         | `vi.advanceTimersByTime(n)`                            | `tick` and `advanceTimersByTime` do not wait for promises; [`advanceTimers`](/utilities/fake-timers) does |
| `jasmine.clock().mockDate(d)`                                     | `vi.setSystemTime(d)`                                  | this is what fakes `Date`; see below                                                                      |
| `jasmine.clock().withMock(fn)`                                    | on the namespace; **no `vi` twin**                     | the codemod reports it and leaves it                                                                      |
| `jasmine.addMatchers(m)`                                          | `expect.extend(m)`                                     |                                                                                                           |
| `jasmine.addCustomEqualityTester(t)`                              | `expect.addEqualityTesters([t])`                       | one tester, wrapped in the array Vitest takes                                                             |
| `jasmine.DEFAULT_TIMEOUT_INTERVAL = n`                            | **a config setting, not a statement**                  | `vi.setConfig({ testTimeout: n, hookTimeout: n })`; [both](#the-timeout-is-two-numbers-here)              |
| `jasmine.getEnv()`                                                | **none**                                               | ordering and bail are `vitest.config.ts`, not a runtime environment                                       |
| `jasmine.addSpyStrategy` / `setDefaultSpyStrategy`                | **none**                                               | write the behaviour as a `mockImplementation` where the spy is built                                      |
| `jasmine.Spy` (the type)                                          | `Mock` from `vitest`                                   | a single mock function                                                                                    |
| `jasmine.SpyObj<T>` (the type)                                    | `Spy<T>` from this package                             | the whole object; one word apart, two different things                                                    |
| `fdescribe` / `fit`                                               | `describe.only` / `it.only`                            |                                                                                                           |
| `xdescribe` / `xit` / `xtest`                                     | `describe.skip` / `it.skip`                            | the bare rename fails as `TS2304: Cannot find name 'xit'`                                                 |
| `expect(x).toBeTrue()` / `.toBeFalse()`                           | `.toBe(true)` / `.toBe(false)`                         | ⚠️ **not** `toBeTruthy` / `toBeFalsy`, which Vitest's own error suggests                                  |
| `expect(x).toHaveSize(n)`                                         | `.toHaveLength(n)`                                     |                                                                                                           |
| `expect(spy).toHaveBeenCalledOnceWith(a)`                         | `.toHaveBeenCalledExactlyOnceWith(a)`                  | one matcher, not `toHaveBeenCalledTimes(1)` plus `toHaveBeenCalledWith(a)`                                |
| `expect(el).toHaveClass(c)`                                       | **none**                                               | outside browser mode; `expect(el.classList.contains(c)).toBe(true)`                                       |
| `expect(x).withContext(msg).toBe(y)`                              | `expect(x, msg).toBe(y)`                               | ⚠️ [the message vanishes without failing](#withcontext-does-not-throw-it-loses-the-message)               |
| `fail(msg)`                                                       | `expect.fail(msg)`                                     | there is no `vi.fail`                                                                                     |
| `it('x', (done) => …)`                                            | `async` + `await`                                      | **not rewritten**: Vitest passes a `TestContext`, not a `done`                                            |

The codemod leaves `done` callbacks alone on purpose. To turn one into `async`, someone has to
decide what the test awaits. A guess there gives a test that passes without waiting for anything.
The [`await-emission`](/utilities/eslint-plugin) family of lint rules finds those tests.

### The eight matchers with no `expect.*` twin

`jasmine.truthy`, `falsy`, `empty`, `notEmpty`, `is`, `mapContaining`, `setContaining` and
`arrayWithExactContents` are asymmetric matchers: they go **inside** `toEqual(…)`,
`objectContaining({ … })` or `toHaveBeenCalledWith(…)`. Vitest has none of them, so the library
implements them:

```ts
import { registerJasmineMatchers } from 'vitest-auto-spy/jasmine';

registerJasmineMatchers(); // once, in the setup file

expect({ tags: [] }).toEqual({ tags: expect.jasmineEmpty() });
```

On `expect` they carry a `jasmine` prefix: `expect.jasmineEmpty()`, `expect.jasmineIs()` and so on.
The `jasmine` namespace also has them under their own names, so `jasmine.empty()` keeps working in a
spec you have not rewritten. The prefix is needed: chai already uses `.empty` and `.is` on Vitest's
assertion object, and `expect.extend({ empty })` throws
`Cannot set property empty of #<Assertion> which has only a getter`.

The first use of any `jasmine.*` member registers them. A spec that only uses `jasmine.truthy()` and
the like needs no setup call.

`jasmine.mapContaining` matches **keys** by equality, as jasmine does, not by `Map.has`. So a matcher
in key position works, and so does an object key that is equal but not the same reference:

```ts
expect(byUser).toEqual(jasmine.mapContaining(new Map([[{ id: 7 }, 'ada']])));
expect(byName).toEqual(jasmine.mapContaining(new Map([[jasmine.any(String), 'ada']])));
```

### `withContext` does not throw, it loses the message

::: danger Quieter than `spyOn`
Jasmine specs label assertions with `expect(x).withContext('why this matters').toBe(y)`. You would
expect Vitest to fail loudly on an unknown method. It does not. Vitest has an internal method of the
same name. It accepts the string, ignores it, and the assertion runs. The failure reads:

```
AssertionError: expected 2 to be 3
```

The label is gone, with no error and no warning. A find-and-replace migration that misses one keeps
passing.

Vitest takes the label as the second argument of `expect`, and prints it before the failure:

```diff
- expect(sum).withContext('the sum of one and one must be three').toBe(3);
+ expect(sum, 'the sum of one and one must be three').toBe(3);
```

```
AssertionError: the sum of one and one must be three: expected 2 to be 3
```

The codemod's `jasmine-matchers` transform moves it. `--verify` then checks that none is left. That
is the only check you get, because the runner never complains. Why it is silent:
[In depth](#why-withcontext-is-silent).
:::

### The timeout is two numbers here

In jasmine, `jasmine.DEFAULT_TIMEOUT_INTERVAL` covers both a spec and its hooks. Vitest has two
settings with different defaults: `testTimeout` is **5000 ms**, `hookTimeout` is **10 000 ms**. Set
both, or a slow `beforeAll` runs on a different budget from its tests:

```ts
// vitest.config.ts
test: {
  testTimeout: 30_000,
  hookTimeout: 30_000, // jasmine had one number; Vitest defaults this one separately
}
```

On the bridge, assigning `jasmine.DEFAULT_TIMEOUT_INTERVAL` changes nothing. It warns once and names
both settings, so the spec does not silently keep the old timeout.
`vi.setConfig({ testTimeout: n, hookTimeout: n })` sets them for one file.

A timeout in a hook is easy to misread. When a `beforeEach` overruns, Vitest blames the **test**. The
log reads `× should create 10045ms`, but the test body never ran.

### `clock().install()` leaves `Date` real

In jasmine, `clock().install()` fakes timers only. `Date` is faked separately, with `mockDate()`.
Vitest's `useFakeTimers()` fakes `Date` too. A spec that installs the clock and then measures real
elapsed time sees `Date.now()` frozen: a cache that never expires, or `Date.now() - start` that is
`0`.

So on the bridge, `jasmine.clock().install()` leaves `Date` real, as jasmine does. Apart from
`Date`, `install()` fakes the same timers as a plain `vi.useFakeTimers()`. To fake `Date`, call `mockDate()`.
From then on, `tick(ms)` moves `Date.now()` forward too:

```ts
jasmine.clock().install();
jasmine.clock().mockDate(new Date('2026-01-01')); // this fakes Date
```

After the codemod, `install()` becomes `vi.useFakeTimers()`, which fakes `Date` as well, and
`vi.advanceTimersByTime(ms)` moves it. If a spec relies on a real `Date`, check it after the
rewrite.

Call `mockDate()` right after `install()`, before anything schedules a timer. `mockDate()` re-installs
the fake clock to take `Date` over, and that drops timers already scheduled. jasmine's own `mockDate` keeps them, so the bridge tells you:

```text
[vitest-auto-spy] jasmine.clock().mockDate() took Date over after 2 callbacks had already been
scheduled, and re-installing the fake clock dropped them. Call mockDate() right after install(),
before anything schedules a timer.
Docs: https://asdalexey.github.io/vitest-auto-spy/migrating-jasmine#clock-install-leaves-date-real
```

`mockDate()` without `install()` fakes `Date` only and leaves timers real. jasmine throws there
(`Mock clock is not installed`); the bridge warns once instead. Call `install()` first, or use
[`mockSystemTime()`](/utilities/fake-timers) when only the date should be fake.

## Two helpers that behave differently on the bridge

### `.and.callThrough()` restores this library's dispatch

In jasmine, `callThrough` calls the real method that `spyOn` replaced. A spy from `createSpyFromClass`
never wraps a real method, so in `jasmine-auto-spies` it just answered `undefined`. On the bridge it
does something useful: it removes a strategy you set and lets `calledWith` / `withArgs` decide the
value again.

```ts
service.load.withArgs(7).and.returnValue('seven');
service.load(7); // 'seven'

service.load.and.returnValue('flat'); // a strategy replaces the implementation
service.load(7); // 'flat'

service.load.and.callThrough(); // and this is the way back
service.load(7); // 'seven'
```

The codemod cannot rewrite `.and.callThrough()`, so it leaves the line and reports it with
`file:line`. On a spy from this library, delete it or replace it with the `calledWith` chain you
meant. On a `vi.spyOn` of a real object, delete it: `vi.spyOn` already calls through.

### `.calls.saveArgumentsByValue()` is a no-op

jasmine can copy call arguments, so a spec can check an object as it was at call time, even if the
code changes it afterwards. Vitest, Bun and `node:test` keep a reference to the live object. On the
bridge, `saveArgumentsByValue()` exists so the spec still runs, but it does nothing.

That is a trap. **A spec that relied on it now checks the object after the change.** It stays green,
and the line looks the same.

When you cannot write the argument out in the test, [`captureArg`](/core/control-helpers) captures
it with its type, and you read it in the assertion:

```ts
import { captureArg } from 'vitest-auto-spy';

const payload = captureArg<Payload>();

expect(service.save).toHaveBeenCalledWith(payload);
expect(payload.value.id).toBe(7);
```

`captureArg` holds the same live reference. When the code **changes the object after the call**, take
a copy during the call:

```ts
const seen: Payload[] = [];

service.save.mockImplementation((payload: Payload) => {
  seen.push(structuredClone(payload));
});
```

The lint rule [`no-save-arguments-by-value`](/utilities/eslint-plugin) reports every remaining call.
It is the only reliable way to find them.

## On Bun and `node:test`

`vitest-auto-spy/jasmine` imports `vitest`, which `bun test` and `node --test` cannot load. On these
runners, turn the `.and` / `.calls` / `.withArgs` layer on with a call instead:

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

One name: **`createSpyObj`**. This library has no other export like it. So the codemod rewrites
`jasmine.createSpyObj(…)` to `createSpyObj(…)` and imports it from `vitest-auto-spy/jasmine`.

That end state is fine, but consider replacing it. `createSpyObj` cannot check a method name against
a type, because it has no type. Where a class exists, use
[`createSpyFromClass(C)`](/core/create-spy-from-class). Where only an interface exists, use
[`createAutoMock<T>()`](/core/auto-mock-by-type). Both fail at compile time on a misspelled member.

The third argument builds **spied properties**, as in jasmine, not plain values. Reading the property
returns the value you passed, so a migrated spec sees no change. As in jasmine, the getter and
setter spies are reachable only through the property descriptor:

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

A `jasmine-auto-spies` project usually uses `@hirez_io/observer-spy` as well. Rewriting every stream
assertion together with everything else is what makes such migrations stall. So
`vitest-auto-spy/observer-spy` offers the same API:

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

The middle column is the bridge. The right column is where to go next: a different **kind** of
assertion, not a rename, so the codemod does not do it.

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
| `queueForAutoUnsubscribe(sub)`              | **not implemented**                        | the same, or nothing: the emission helpers unsubscribe themselves                   |
| `fakeTime(fn)`                              | **not implemented**                        | `setupFakeTimers()` + `await advanceTimers(ms)`, or rxjs's `TestScheduler` directly |

Four differences from `@hirez_io/observer-spy`, each fixing a defect:

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

::: tip A bridge, not the destination
With observer-spy you subscribe, let things happen, then read the spy. If the stream never emits,
`getValues()` returns `[]`, and a spec can pass having seen nothing.
[`expectEmission` and friends](/core/observable-assertions) await the value instead, and fail when it
does not come. Get the tests green on `subscribeSpyTo` first, then move the assertions over.
:::

## Lint rules while you are on the bridge

Four rules in [`vitest-auto-spy/eslint-plugin`](/utilities/eslint-plugin) cover the time between
step 2 and step 6:

| Rule                              | Level   | Reports                                                                                                      |
| --------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------ |
| `jasmine-namespace-without-entry` | `error` | `.and` / `.calls` / `.withArgs` on a library spy, in a file that installs the layer nowhere                  |
| `no-jasmine-globals`              | `error` | `jasmine.*`, bare `spyOn(` / `spyOnProperty(` / `spyOnAllFunctions(` / `fail(` / `pending(`, `.withContext(` |
| `no-save-arguments-by-value`      | `error` | the no-op above                                                                                              |
| `prefer-native-spy-api`           | `error` | `.and` / `.calls` where the spy's own API says the same thing; **`--fix`** where it can trace the receiver   |

All four ship at `error`. Set `prefer-native-spy-api` to `'off'` until the codemod has run: before
that, it reports every bridge call, and those are correct during the migration.

- **`jasmine-namespace-without-entry`** catches a spy built before `enableJasmineCompat()` ran. That
  spec otherwise fails with `Cannot read properties of undefined (reading 'returnValue')`, which
  names neither the import nor the spy. The rule reads one file at a time. If a setup file that no
  spec imports installs the layer, name it: `{ setupModules: ['./test-setup'] }`.
- **`prefer-native-spy-api`** applies its fix only where the spy clearly comes from this library's
  factories. Elsewhere it offers a suggestion, because `.calls` on another object may be that
  object's own method. It skips chains with `?.`: `spy?.and.returnValue(1)` would lose its guard. It
  has no rewrite for `.and.callThrough`, `.and.returnValues`, `.and.stub`, `.and.throwError`,
  `.and.resolveTo`, `.calls.all()` or `.calls.mostRecent()`; the codemod handles those.
- **`no-done-callback`**, on at `error` in the recommended config, also helps. Besides `(done) =>` it
  reports `done.fail(…)`. That call throws `done.fail is not a function`, usually inside an `error`
  callback or a `.catch()` nobody awaits. The test has already finished, so the run stays **green on
  the path that should fail it**.

## If the suite is Angular's

Most `jasmine-auto-spies` projects are Angular projects on Karma. Angular's own
migration switches the **runner** from Karma to Vitest (the command is below); the codemod above
changes the spies. Run both.

What exists in which Angular version:

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

Where the schematic and this page rewrite differently, the schematic is more conservative:

- `fail(msg)` becomes `throw new Error(msg)` in v21, and `expect.fail(msg)` in v22.
- `toHaveBeenCalledOnceWith(args)` becomes `toHaveBeenCalledTimes(1)` plus
  `toHaveBeenCalledWith(args)`. Here it becomes `toHaveBeenCalledExactlyOnceWith(args)`. Both are
  correct; the single matcher gives a better failure message.

For `jasmine.createSpyObj` the schematic writes an object of `vi.fn()` and three TODO comments. See
[its own page](/migrating-angular-schematic) for the real output.

If the tests also run in a real browser (the `browsers` option of `@angular/build:unit-test`), one
more difference appears. `vi.spyOn` on a module export throws there, because the browser seals ES
module exports. Spies on classes and prototypes, including every spy from this library, are not
affected. See [Vitest → Browser mode](/runtimes/vitest#browser-mode-module-exports-are-read-only).

## What else you gain

Everything [the jest migration page](/migrating#what-you-gain-by-moving) lists: the type-driven
factories, [fixtures](/utilities/fixtures), [observable assertions](/core/observable-assertions),
[console spies](/utilities/console), Bun and `node:test`, and Angular's `TestBed`
[under `bun test`](/runtimes/bun-angular). A jasmine project has most likely been running under
Karma, too. [`npx vitest-auto-spy doctor`](/utilities/cli) reports the `karma.conf.*` left behind and
the setup files only Karma used.

## Did the migration lose a test?

Check it as on [the jest page](/migrating#did-the-migration-lose-a-test). `compareTestRuns` compares
the **names** of the tests in two JSON reports, not only the totals: two runs with the same totals can
differ by a lost `describe` and a fixed flaky test. Karma does not give you that JSON report. So take
the baseline from the first green Vitest run on the bridge: step 3 produces exactly that run.

## In depth

### Why the bridge exists

Doing both jobs in one commit (deleting `.and.` across thousands of specs and swapping the runner)
means the first red run has two possible causes and no way to tell them apart. The bridge splits
them: step 3 checks the runner, step 4 checks the rewrite.

### Why `withContext` is silent

Vitest's chai layer has an `@internal` method named `withContext`, meant for a flags object:

```js
// @vitest/expect
withContext(context) { for (const key in context) utils.flag(this, key, context[key]); return this; }
```

Given a string, the `for…in` walks the string's character indices, sets a few meaningless chai flags,
and returns the assertion. So the chain continues and the message is lost. Measured on Vitest 4.1.9.

### Why `saveArgumentsByValue()` does nothing

Copying every argument of every call would slow down every spy in every project, for a helper that
appears in a handful of specs.

### A project that never imports the entry carries none of it

The core looks up the jasmine layer lazily, as it does for the rxjs layer. A project that never
imports a jasmine entry pays one `undefined` check per spy and bundles none of the compatibility code.

### How `mapContaining` finds keys

A `Map.has` lookup answers on identity, so it misses a matcher key and an equal-but-different object
key. `jasmine.mapContaining` searches for a pair whose key and value both match, as jasmine's own
`MapContaining` does. A direct lookup is still tried first, for the common case where the sample key
is the same reference.

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

`jasmine-auto-spies@8.0.1` was last published in **August 2023**. It is CJS-only with no `exports`
map, pinned to `rxjs <8` and `jasmine-core <6`, and has a dozen open issues, the oldest from February 2021. Vitest support was asked for in 2022 (issue #66). A community `vitest-auto-spies` package was
offered as PR #90 and is still unmerged. That is what a stable package that stopped moving looks
like. It also means the following will not come upstream, and a migrated project gets each of them
on day one:

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

Upstream finds methods by checking only `descriptor.get`. So a **write-only** setter on the prototype
looks like a method: a function spy replaces it and overwrites the setter spy that `settersToSpyOn`
had just built. The setter then records nothing, and a spec that asserts on it fails with an empty
call list and no explanation. This library had the same bug, inherited the same way. It is fixed
here.

### Angular versions at the time of writing

`@angular/core` dist-tags on 2026-09-26: `latest` **22.2.0**, `v21-lts` **21.2.24**, `v20-lts`
**20.3.32**. The `[EXPERIMENTAL]` label on `@angular/build:unit-test` was dropped in angular-cli PR
#34095. `refactor-jasmine-vitest` is `"hidden": true` in its schematic collection, and
`migrate-karma-to-vitest` is `"optional": true`.
