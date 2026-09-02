---
title: Migrating from jasmine-auto-spies
description: jasmine-auto-spies and jest-auto-spies are siblings over the same core, and exactly one thing differs — the .and namespace. The vitest-auto-spy/jasmine entry puts it back, so the suite runs green before anything is rewritten; the codemod then takes it away again. Includes the full mapping table for both the auto-spies API and jasmine's own globals.
---

# Migrating from jasmine-auto-spies

`jasmine-auto-spies` and [`jest-auto-spies`](/migrating) are the same library twice. Both are thin
layers over `@hirez_io/auto-spies-core`, every configuration key is spelled identically
(`methodsToSpyOn`, `observablePropsToSpyOn`, `gettersToSpyOn`, `settersToSpyOn`), and so is every
helper — `calledWith`, `resolveWith`, `nextWith`, `nextWithValues`, `accessorSpies`.

**Exactly one thing differs.** Upstream parks its async helpers on the spy's `.and` namespace,
because that is where jasmine keeps its own spy strategies:

```ts
spy.load.and.nextWith(account); // jasmine-auto-spies
spy.load.nextWith(account); // jest-auto-spies, and here
```

So the jasmine migration is [the jest migration](/migrating) plus deleting `.and.` — and
`vitest-auto-spy/jasmine` exists so that you do not have to do that first.

## The two-step path

Deleting `.and.` across two thousand specs and swapping the runner in the same commit means the
first red run has two candidate causes and no way to tell them apart. So the shim comes first:

1. **Land it green on the shim.** Change the import specifier and nothing else.

   ```diff
   - import { createSpyFromClass, provideAutoSpy, type Spy } from 'jasmine-auto-spies';
   + import { createSpyFromClass, provideAutoSpy, type Spy } from 'vitest-auto-spy/jasmine';
   ```

   The entry registers the Vitest adapter and installs `.and`, `.calls` and `.withArgs` on every
   spy built afterwards, so `spy.load.and.returnValue(x)` and `spy.load.calls.count()` keep meaning
   what they meant. Anything that fails now is a real difference between the runners, not a rename.

2. **Run the codemod**, which rewrites the `.and` namespace away along with jasmine's own globals:

   ```bash
   npx vitest-auto-spy codemod --from jasmine            # dry run: prints a diff, writes nothing
   npx vitest-auto-spy codemod --from jasmine --write    # apply
   npx vitest-auto-spy codemod --from jasmine --verify   # match the result, not the diff
   ```

   `--from jasmine-auto-spies` is the same thing spelled out. `--from auto` is the default and reads
   each file: a file carrying a `jasmine.` member, a legacy import, a `vitest-auto-spy/jasmine`
   import or a `.and.` gets the jasmine transforms, and a file with none of those does not. A suite
   whose only jasmine construct is a bare `spyOn(` needs `--from jasmine` said out loud — see the
   warning below for why guessing there would be the worst possible outcome.

3. **Drop the import.** Once the codemod has run, `vitest-auto-spy/jasmine` exports nothing the
   suite still uses — except `createSpyObj`, which has no counterpart anywhere else. See
   [what the codemod leaves behind](#what-the-codemod-leaves-on-the-jasmine-entry).

## `spyOn` means the opposite thing on the two sides

::: danger This is the one rename that is silent, green, and wrong
jasmine's `spyOn(obj, 'm')` installs a **stub** — the real method does not run. Vitest's
`vi.spyOn(obj, 'm')` **calls through** — it does.

```diff
- spyOn(analytics, 'track');            // jasmine: track() never runs
+ vi.spyOn(analytics, 'track');         // Vitest: track() runs on every call
+ vi.spyOn(analytics, 'track').mockImplementation(() => undefined); // what the jasmine line meant
```

Nothing catches the middle line. It compiles, it type-checks, and the spec still passes every
assertion it makes about the spy — the only thing that changed is that the real implementation
started running inside every spec that installed the spy in order to stop it. It fails later, in a
different file, if the real method happens to write to a store, fire a request or throw.

`spyOnProperty(obj, 'p', 'get')` has the same default and goes the same way.

The `jasmine-spy-on` transform appends the no-op jasmine installed for free, and skips it only where
the expression already chains a strategy that replaces the implementation anyway (`.and.…`, or a
`mock…` from a half-finished hand migration). It is the reason this migration has a codemod rather
than a `sed` line.
:::

## The auto-spies API

Nothing in this table is a behaviour change on the shim — the middle column is what the same line
does once the import specifier changed. The right-hand column is the end state; **✎** marks the rows
no transform touches, which are the ones to search for by hand once the codemod has run.

| `jasmine-auto-spies`                                               | on `vitest-auto-spy/jasmine`                                | the end state                                              |
| ------------------------------------------------------------------ | ----------------------------------------------------------- | ---------------------------------------------------------- |
| `createSpyFromClass(C)`                                            | identical                                                   | `createSpyFromClass` from `vitest-auto-spy`                |
| `createSpyFromClass(C, ['load', 'save'])`                          | identical                                                   | unchanged                                                  |
| `methodsToSpyOn` / `observablePropsToSpyOn`                        | identical, same additive meaning                            | unchanged                                                  |
| `gettersToSpyOn` / `settersToSpyOn`                                | identical                                                   | unchanged                                                  |
| `providedMethodNames`                                              | accepted, merged into `methodsToSpyOn`, warns once per call | ✎ rename it to `methodsToSpyOn`                            |
| `createFunctionSpy<F>('name')`                                     | identical                                                   | `createFunctionSpy` from `vitest-auto-spy`                 |
| `provideAutoSpy(C)`                                                | identical `{ provide, useValue }`                           | `provideAutoSpy` from `/angular` (or `/nestjs`, `/vue`)    |
| `createSpyObj(base, names, props?)`                                | identical, all four argument forms                          | **stays on `/jasmine`** — nothing else exports it          |
| `type Spy<T>`                                                      | the same shape, **without** `@types/jasmine`                | `Spy<T>` from `vitest-auto-spy`                            |
| `createObservableWithValues`                                       | from `vitest-auto-spy/rxjs`, unchanged                      | unchanged                                                  |
| `spy.m.and.returnValue(v)`                                         | identical                                                   | `spy.m.mockReturnValue(v)`                                 |
| `spy.m.and.returnValues(a, b)`                                     | identical                                                   | `.mockReturnValueOnce(a).mockReturnValueOnce(b)`           |
| `spy.m.and.callFake(fn)`                                           | identical                                                   | `spy.m.mockImplementation(fn)`                             |
| `spy.m.and.stub()`                                                 | identical                                                   | `spy.m.mockImplementation(() => undefined)`                |
| `spy.m.and.throwError('boom')`                                     | identical                                                   | `.mockImplementation(() => { throw new Error('boom'); })`  |
| `spy.m.and.resolveTo(v)`                                           | identical                                                   | `spy.m.mockResolvedValue(v)`                               |
| `spy.m.and.callThrough()`                                          | **restores this library's dispatch** — see below            | reported, left byte-for-byte                               |
| `spy.m.and.identity`                                               | the spy's name                                              | ✎ Vitest names the variable, not the spy — delete the read |
| `spy.m.and.resolveWith / rejectWith / resolveWithPerCall`          | identical                                                   | drop `.and` — `spy.m.resolveWith(v)`                       |
| `spy.m.and.nextWith / nextOneTimeWith / nextWithValues`            | identical                                                   | drop `.and`                                                |
| `spy.m.and.nextWithPerCall / throwWith / complete / returnSubject` | identical                                                   | drop `.and`                                                |
| `spy.m.withArgs(1).and.returnValue(v)`                             | identical                                                   | `spy.m.calledWith(1).mockReturnValue(v)`                   |
| `expect(spy.m.withArgs(1)).toHaveBeenCalled()`                     | **no counterpart** — `withArgs` returns a chain, not a spy  | ✎ `expect(spy.m).toHaveBeenCalledWith(1)`                  |
| `spy.m.calls.count()` / `any()`                                    | identical                                                   | ✎ `spy.m.mock.calls.length`                                |
| `spy.m.calls.argsFor(i)` / `allArgs()`                             | identical                                                   | ✎ `spy.m.mock.calls[i]` / `spy.m.mock.calls`               |
| `spy.m.calls.all()` / `first()` / `mostRecent()`                   | identical                                                   | ✎ `spy.m.mock.calls` beside `spy.m.mock.results`           |
| `spy.m.calls.thisFor(i)`                                           | identical                                                   | ✎ `spy.m.mock.instances[i]`                                |
| `spy.m.calls.reset()`                                              | identical                                                   | ✎ `spy.m.mockClear()`                                      |
| `spy.m.calls.saveArgumentsByValue()`                               | **a documented no-op** — see below                          | ✎ take the copy in a `mockImplementation`                  |
| `spy.accessorSpies.getters.x.and.returnValue(v)`                   | identical                                                   | `spy.accessorSpies.getters.x.mockReturnValue(v)`           |

And the `@hirez_io/observer-spy` beside it, which the same entry replaces — see
[below](#hirez-io-observer-spy-comes-along-too). The end state is a different **kind** of assertion,
not a rename, so none of these rows is a codemod's business:

| `@hirez_io/observer-spy`                    | on `vitest-auto-spy/observer-spy`          | the end state                                                                       |
| ------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------- |
| `subscribeSpyTo(source$)`                   | identical                                  | `await expectEmission(source$)` where one value is the point                        |
| `subscribeSpyTo(source$, { expectErrors })` | identical                                  | `await expectError(source$)`                                                        |
| `spy.getFirstValue()`                       | identical, but **throws** on an empty spy  | `await expectEmission(source$)`                                                     |
| `spy.getValues()`                           | identical, but a **copy**, typed `T[]`     | `await expectEmissions(source$, n)`                                                 |
| `spy.getValueAt(i)` / `getLastValue()`      | identical (`getValueAt` throws when empty) | `await expectEmissions(source$, n)` then index                                      |
| `spy.receivedComplete()` / `onComplete()`   | identical                                  | `await expectCompletion(source$)`                                                   |
| `spy.receivedError()` / `getError()`        | identical                                  | `await expectError(source$)` — it resolves _with_ the error                         |
| `spy.receivedNext()`                        | identical                                  | `await expectNoEmission(source$)` for the negative                                  |
| `autoUnsubscribe()`                         | **not implemented**                        | `using spy = subscribeSpyTo(source$)`                                               |
| `queueForAutoUnsubscribe(sub)`              | **not implemented**                        | the same — or nothing, since the emission helpers unsubscribe themselves            |
| `fakeTime(fn)`                              | **not implemented**                        | `setupFakeTimers()` + `await advanceTimers(ms)`, or rxjs's `TestScheduler` directly |

The last three are absent on purpose rather than pending. `fakeTime` is built on rxjs's
`TestScheduler` virtual time _and_ on the `done` callback protocol, neither of which survives the
move intact; `autoUnsubscribe` is a global `afterEach` plus a registry, which `using` replaces with
a block scope that cannot be wrong.

The `.calls` rows are the long tail of this migration: the namespace is a **runtime** shim, so a
spec that still reads `spy.m.calls.count()` after the codemod compiles, runs and passes. Nothing
forces the rewrite — which is the argument for
[`prefer-native-spy-api`](/utilities/eslint-plugin), the rule that reports each one.

`.and` on a method spy carries whichever helper bundle the **return type** earns, exactly as the
method itself does: a `Promise`-returning method gets `resolveWith` / `rejectWith`, an
`Observable`-returning one gets `nextWith` and the rest — and those only once
`import 'vitest-auto-spy/rxjs'` has run somewhere, as on every other entry.

## jasmine's own globals

These appear in files that have nothing to do with auto-spies, nothing imports them, and after the
runner swap each one fails as `ReferenceError: jasmine is not defined` at the first line that reads
it. One import restores the whole namespace, so the suite runs before any of it is rewritten:

```ts
import { jasmine } from 'vitest-auto-spy/jasmine';
```

Nothing is installed on `globalThis`. A global that appears because something imported a library is
the kind of action-at-a-distance that makes a migration impossible to reason about — and an explicit
import is one line per file that the codemod deletes at the end.

| jasmine                                                           | under Vitest                                           | notes                                                                                         |
| ----------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `spyOn(o, 'm')`                                                   | `vi.spyOn(o, 'm').mockImplementation(() => undefined)` | ⚠️ [the default is inverted](#spyon-means-the-opposite-thing-on-the-two-sides)                |
| `spyOnProperty(o, 'p', 'get')`                                    | same, with the accessor kind                           | same inverted default                                                                         |
| `jasmine.createSpy('load')`                                       | `vi.fn()`                                              | the name goes — Vitest reports the variable                                                   |
| `jasmine.createSpy('load', original)`                             | `vi.fn(original)`                                      | the original is the argument that still means something                                       |
| `jasmine.createSpyObj(…)`                                         | `createSpyObj` from `vitest-auto-spy/jasmine`          | all of upstream's forms; prefer a class or a type where there is one                          |
| `jasmine.any` / `anything` / `objectContaining`                   | `expect.any` / `expect.anything` / …                   | named the same on both sides                                                                  |
| `jasmine.arrayContaining` / `stringMatching` / `stringContaining` | `expect.arrayContaining` / …                           | named the same on both sides                                                                  |
| `jasmine.truthy` / `falsy` / `empty` / `notEmpty`                 | **no `expect.*` twin**                                 | `registerJasmineMatchers()`, below                                                            |
| `jasmine.is` / `mapContaining` / `setContaining`                  | **no `expect.*` twin**                                 | `registerJasmineMatchers()`, below                                                            |
| `jasmine.arrayWithExactContents`                                  | **no `expect.*` twin**                                 | `registerJasmineMatchers()`, below                                                            |
| `jasmine.clock().install()` / `.uninstall()`                      | `vi.useFakeTimers()` / `vi.useRealTimers()`            |                                                                                               |
| `jasmine.clock().tick(n)`                                         | `vi.advanceTimersByTime(n)`                            | neither settles a promise — [`advanceTimers`](/utilities/fake-timers) does                    |
| `jasmine.clock().mockDate(d)`                                     | `vi.setSystemTime(d)`                                  |                                                                                               |
| `jasmine.clock().withMock(fn)`                                    | on the namespace; **no `vi` twin**                     | the codemod reports it and leaves it                                                          |
| `jasmine.addMatchers(m)`                                          | `expect.extend(m)`                                     |                                                                                               |
| `jasmine.addCustomEqualityTester(t)`                              | `expect.addEqualityTesters([t])`                       | one tester, wrapped in the array Vitest takes                                                 |
| `jasmine.DEFAULT_TIMEOUT_INTERVAL = n`                            | **a config setting, not a statement**                  | `vi.setConfig({ testTimeout: n, hookTimeout: n })` — [both](#the-timeout-is-two-numbers-here) |
| `jasmine.getEnv()`                                                | **none**                                               | ordering and bail are `vitest.config.ts`, not a runtime environment                           |
| `jasmine.addSpyStrategy` / `setDefaultSpyStrategy`                | **none**                                               | write the behaviour as a `mockImplementation` where the double is built                       |
| `jasmine.Spy` (the type)                                          | `Mock` from `vitest`                                   | a bare mock                                                                                   |
| `jasmine.SpyObj<T>` (the type)                                    | `Spy<T>` from this package                             | the whole double — one word apart, two different things                                       |
| `fdescribe` / `fit`                                               | `describe.only` / `it.only`                            |                                                                                               |
| `xdescribe` / `xit` / `xtest`                                     | `describe.skip` / `it.skip`                            | the bare rename fails as `TS2304: Cannot find name 'xit'`                                     |
| `expect(x).toBeTrue()` / `.toBeFalse()`                           | `.toBe(true)` / `.toBe(false)`                         | ⚠️ **not** `toBeTruthy` / `toBeFalsy`, which Vitest's own error suggests                      |
| `expect(x).toHaveSize(n)`                                         | `.toHaveLength(n)`                                     |                                                                                               |
| `expect(spy).toHaveBeenCalledOnceWith(a)`                         | `.toHaveBeenCalledExactlyOnceWith(a)`                  | one matcher, not `toHaveBeenCalledTimes(1)` plus `toHaveBeenCalledWith(a)`                    |
| `expect(el).toHaveClass(c)`                                       | **none**                                               | outside browser mode; `expect(el.classList.contains(c)).toBe(true)`                           |
| `expect(x).withContext(msg).toBe(y)`                              | `expect(x, msg).toBe(y)`                               | ⚠️ [the message vanishes without failing](#withcontext-does-not-throw-it-loses-the-message)   |
| `fail(msg)`                                                       | `expect.fail(msg)`                                     | there is no `vi.fail`                                                                         |
| `it('x', (done) => …)`                                            | `async` + `await`                                      | **not rewritten** — Vitest passes a `TestContext`, not a `done`                               |

The `done` row is the one the codemod refuses on purpose. A callback signature is a control-flow
shape, not a name: turning it into `async` means deciding what the test awaits, and a plausible
guess there is a test that passes without having waited for anything. The
[`await-emission`](/utilities/eslint-plugin) family of lint rules is what finds those.

### The eight matchers with no `expect.*` twin

An asymmetric matcher is the only thing that can stand **inside** `objectContaining({ … })` or
`toHaveBeenCalledWith(…)`; `expect(x).toBeTruthy()` cannot go there. So these eight are implemented
rather than mapped away:

```ts
import { registerJasmineMatchers } from 'vitest-auto-spy/jasmine';

registerJasmineMatchers(); // once, in the setup file

expect({ tags: [] }).toEqual({ tags: expect.jasmineEmpty() });
```

They are registered under `jasmine`-prefixed names — `expect.jasmineEmpty()`, `expect.jasmineIs()`
and so on — and republished under jasmine's own names on the `jasmine` namespace, so
`jasmine.empty()` reads normally in a spec that has not been rewritten yet. The prefix is not
cosmetic: chai publishes `.empty` as a getter and `.is` as a language chain on Vitest's assertion
object, so `expect.extend({ empty })` throws
`Cannot set property empty of #<Assertion> which has only a getter` outright.

Anything on the `jasmine` namespace registers them on first use, so a suite that only touches them
through `jasmine.truthy()` needs no setup call at all.

### `withContext` does not throw, it loses the message

::: danger The second silent one, and it is quieter than `spyOn`
`expect(x).withContext('why this matters').toBe(y)` is the shape a jasmine suite labels its
assertions with, and the reasonable expectation is that Vitest has no such method and the line dies
loudly. It does not. Vitest's chai layer ships an `@internal` method of exactly that name, meant for
a **flags object**:

```js
// @vitest/expect
withContext(context) { for (const key in context) utils.flag(this, key, context[key]); return this; }
```

Handed a **string**, the `for…in` walks the string's own character indices, sets a handful of
nonsense chai flags, and returns the assertion — so the chain continues and the assertion runs. The
failure then reads:

```
AssertionError: expected 2 to be 3
```

The message is gone. No error, no warning, no `is not a function`. A find-and-replace migration that
misses one of these keeps passing, and the label that explained _why_ the assertion mattered is
simply not in the output any more. Measured on Vitest 4.1.9.

Vitest takes the label as the second argument of `expect` instead, where it prefixes the failure:

```diff
- expect(sum).withContext('the sum of one and one must be three').toBe(3);
+ expect(sum, 'the sum of one and one must be three').toBe(3);
```

```
AssertionError: the sum of one and one must be three: expected 2 to be 3
```

The `jasmine-matchers` transform moves it, and `--verify` matches on what is left — which for this
one is the only mechanical check there is, since the runner will never tell you.
:::

### The timeout is two numbers here

`jasmine.DEFAULT_TIMEOUT_INTERVAL` is one budget for a spec and its hooks alike. Vitest resolves two,
and they do not default to the same number: `testTimeout` is **5000 ms**, `hookTimeout` is
**10 000 ms**. A one-to-one port of the jasmine number therefore leaves a slow `beforeAll` on a
different budget than the tests it feeds:

```ts
// vitest.config.ts
test: {
  testTimeout: 30_000,
  hookTimeout: 30_000, // jasmine had one number; Vitest defaults this one separately
}
```

Assigning to `jasmine.DEFAULT_TIMEOUT_INTERVAL` on the namespace warns once naming both settings
rather than throwing or silently swallowing the write — there is nothing at run time for it to
change, and a suite that believed it had raised its timeout is worse off than one that was told.
`vi.setConfig({ testTimeout: n, hookTimeout: n })` is the per-file form.

The failure this prevents is filed against the wrong thing: a `beforeEach` that overruns is
attributed to the **test**, with the test's duration pinned at the limit, so the log reads
`× should create 10045ms` and the body it names never ran.

## Two places where this is deliberately not upstream

### `.and.callThrough()` restores this library's dispatch

jasmine's `callThrough` calls the real method a `spyOn` replaced. An auto-spy never wrapped a real
method, so upstream had nothing to call through **to** and silently answered `undefined`. Here the
same word means the useful thing: it puts the library's own dispatch back, so a `calledWith` chain
decides the value again.

```ts
service.load.withArgs(7).and.returnValue('seven');
service.load(7); // 'seven'

service.load.and.returnValue('flat'); // a strategy replaces the implementation
service.load(7); // 'flat'

service.load.and.callThrough(); // and this is the way back
service.load(7); // 'seven'
```

The codemod leaves `.and.callThrough()` exactly as written and names it with a `file:line`, because
there is no expression it could become. On an auto-spy, delete it or replace it with the
`calledWith` chain you meant; on a `vi.spyOn` of a real object, delete it — `vi.spyOn` already calls
through.

### `.calls.saveArgumentsByValue()` is a no-op

jasmine copies call arguments defensively, so a spec can assert on an object the code under test
mutated afterwards. Vitest, Bun and `node:test` all keep the live reference, and snapshotting every
argument of every call to match would slow down every spy in the suite for a helper that appears in
a handful of specs.

It stays callable so a migrated spec still runs — which is the trap. **A suite that relied on it
silently starts asserting on post-mutation state**: the call is still there, still green, and the
object it reads is the one the code has since edited. An assertion about the state at call time has
quietly become one about the state at assertion time, and nothing about the line looks wrong.

Where the argument is one the test could not write down, [`captureArg`](/core/control-helpers) is
the way to reach it — typed, and read at the assertion rather than through `mock.calls`:

```ts
import { captureArg } from 'vitest-auto-spy';

const payload = captureArg<Payload>();

expect(service.save).toHaveBeenCalledWith(payload);
expect(payload.value.id).toBe(7);
```

Where it is genuinely **mutated after the call**, no captor helps either — it holds the same live
reference the runner does. The copy has to be taken while the call is happening:

```ts
const seen: Payload[] = [];

service.save.mockImplementation((payload: Payload) => {
  seen.push(structuredClone(payload));
});
```

[`no-save-arguments-by-value`](/utilities/eslint-plugin) reports every remaining call, which is the
only reliable way to find them.

## On Bun and `node:test`

`vitest-auto-spy/jasmine` registers the Vitest adapter, and registering it means importing `vitest`,
which neither `bun test` nor `node --test` can load. The namespaces themselves are written against
the `MockAdapter` rather than against Vitest, so they work unchanged on all three — they are just
turned on by a call instead of by an import:

```ts
// bun-test-setup.ts
import { enableJasmineCompat } from 'vitest-auto-spy/jasmine-compat';

enableJasmineCompat();
```

The same entry serves `node --test`; it registers no adapter, so it composes with whichever
runtime entry the suite already imports. Order matters in one
direction only: spies built **before** the call do not get the namespaces, so it belongs in a setup
file, not in a `beforeEach` that runs after the double is created. It is idempotent.

Observables still come from `vitest-auto-spy/rxjs`, imported once as usual — the jasmine entry adds
no rxjs of its own.

::: tip A project that never imports the entry ships none of it
The core consults a registry lazily, the way the rxjs layer already does. A suite that has never
heard of jasmine pays one `undefined` check per spy and carries none of the compatibility code into
its bundle.
:::

## What the codemod leaves on the jasmine entry

One name: **`createSpyObj`**. It is a jasmine global with no counterpart in this library's own API,
so the codemod rewrites `jasmine.createSpyObj(…)` to a bare `createSpyObj(…)` and adds the import
from wherever the installed package exports it — which is `/jasmine` and nowhere else.

That is a fine end state, and it is also a smell worth acting on: `createSpyObj` cannot check a
single name against a type, because there is no type to check against. Where a class exists,
[`createSpyFromClass(C)`](/core/create-spy-from-class) reads it; where only an interface does,
[`createAutoMock<T>()`](/core/auto-mock-by-type) reads that. Both fail at compile time on a
misspelled member, and this one cannot.

## `@hirez_io/observer-spy` comes along too

A `jasmine-auto-spies` suite almost always has `@hirez_io/observer-spy` beside it — the two are by
the same author, and observer-spy is by far the larger of the two: roughly **112k downloads a week
against 11k**. It was last published in 2022. Without a bridge, migrating means rewriting every
stream assertion at the same moment as everything else, which is exactly what makes these migrations
stall. So `vitest-auto-spy/rxjs` exports the same surface.

```ts
import { subscribeSpyTo } from 'vitest-auto-spy/observer-spy';

const spy = subscribeSpyTo(service.load());

expect(spy.getValues()).toEqual(['a', 'b']);
expect(spy.receivedComplete()).toBe(true);
```

`ObserverSpy<T>`, `SubscriberSpy<T>`, `subscribeSpyTo` and the `{ expectErrors: true }` config are
all there, with the same method names — `getValues`, `getValuesLength`, `getValueAt`,
`getFirstValue`, `getLastValue`, `getError`, `receivedNext`, `receivedError`, `receivedComplete`,
`onComplete`, `onError`, `expectErrors`, `unsubscribe`.

Four deliberate departures, each closing a defect rather than adding a feature:

- **`getValues()` returns a copy.** Upstream hands back its live internal array, so a spec that
  sorts or splices what it read corrupts the spy it is still reading.
- **`getValues()` is typed `T[]`.** Upstream types it `any[]` (its own issue #69), which silently
  turns every downstream inference in the assertion into `any`.
- **`getFirstValue()` and `getValueAt(i)` throw when there is nothing there.** Upstream types them
  `T` and returns `undefined` — the same lie this library refuses everywhere else. The signature is
  unchanged, so a migrated spec still compiles; it just stops reading past the end of the stream in
  silence.
- **An unexpected error is thrown by the value readers** — naming it, and carrying the original as
  `cause` — rather than rethrown out of the observer. Upstream rethrows from `error()`, which reached
  the subscriber under rxjs 6 and does not under rxjs 7: anything thrown out of an observer callback
  now goes through `reportUnhandledError` and is reported _asynchronously_, so
  `expect(() => subscribeSpyTo(failing$)).toThrow()` does not see it and Vitest reports an
  unattributed failure against the file. Deferring it to the readers keeps the loudness and puts it
  back where it can be read. `{ expectErrors: true }` — or `.expectErrors()` after construction —
  keeps the readers open, exactly as upstream.

`autoUnsubscribe()`, `queueForAutoUnsubscribe()` and `fakeTime()` are **not implemented**, and are
not going to be. A `SubscriberSpy` carries `[Symbol.dispose]`, so
`using spy = subscribeSpyTo(source$)` tears down at the end of the block rather than through a global
`afterEach` and a registry that has to be right; and `fakeTime` is rxjs's `TestScheduler` virtual
time wrapped around a `done` callback, which is two things this runner does differently —
`setupFakeTimers()` with `await advanceTimers(ms)`, or `TestScheduler` used directly, is the
replacement.

::: tip This is a bridge, and the destination is different in kind
observer-spy is _synchronous inspection_: subscribe, let things happen, then read the spy. Its
failure mode is **silence** — a stream that never emits leaves a spy with no values, so a spec that
reads `getValues()` gets `[]`, asserts something about it, and passes having observed nothing.
[`expectEmission` and friends](/core/observable-assertions) invert that: the assertion _is_ the
await, and silence is a failure with a watchdog rather than an empty array. Land the suite green on
`subscribeSpyTo`, then move the assertions over.
:::

## Lint rules for a suite still on the shim

Four rules in [`vitest-auto-spy/eslint-plugin`](/utilities/eslint-plugin) cover the window between
step 1 and step 3:

| Rule                              | Level   | Reports                                                                                                      |
| --------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------ |
| `jasmine-namespace-without-entry` | `warn`  | `.and` / `.calls` / `.withArgs` on a library spy, in a file that installs the layer nowhere                  |
| `no-jasmine-globals`              | `error` | `jasmine.*`, bare `spyOn(` / `spyOnProperty(` / `spyOnAllFunctions(` / `fail(` / `pending(`, `.withContext(` |
| `no-save-arguments-by-value`      | `error` | the no-op above                                                                                              |
| `prefer-native-spy-api`           | `off`   | `.and` / `.calls` where the spy's own API says the same thing — **`--fix`** where it can trace the receiver  |

`no-done-callback`, which is on at `error` in the recommended config anyway, is the fifth one this
migration leans on: besides the `(done) =>` parameter it reports `done.fail(…)` at the call site.
That line throws `done.fail is not a function` where it sits — almost always inside an `error`
callback or a `.catch()` nobody awaits — so the rejection goes unhandled, the test body returned
long ago, and the run stays **green on the exact path that was supposed to fail it**.

The first one exists because the failure it prevents names nothing useful: a spy built before
`enableJasmineCompat()` ran has no `.and`, and the spec dies on
`Cannot read properties of undefined (reading 'returnValue')` — which points at neither the missing
import nor the spy. It reads one file, so a project that installs the layer from a setup file no
spec imports names that module: `{ setupModules: ['./test-setup'] }`.

`prefer-native-spy-api` is the one to turn on **after** step 2, not before: the layer is legitimate
for as long as the migration lasts, and a rule that reports every line of a suite that is doing the
right thing is a rule that gets disabled. Its fix is applied only where the receiver is traceable to
one of this library's factories; anywhere else the same edit is offered as a suggestion, because a
`.calls` on somebody else's object is somebody else's method. It also declines every chain with an
optional link in it — `spy?.and.returnValue(1)` would come back as `spy.mockReturnValue(1)`, the same
call with the guard silently removed — and it has no entry at all for `.and.callThrough`,
`.and.returnValues`, `.and.stub`, `.and.throwError`, `.and.resolveTo`, `.calls.all()` or
`.calls.mostRecent()`, because no rename says the same thing. The codemod handles those.

## What upstream cannot do

`jasmine-auto-spies@8.0.1` was last published in **August 2023**. It is CJS-only with no `exports`
map, pinned to `rxjs <8` and `jasmine-core <6`, and carries a dozen open issues, the oldest from
February 2021. Vitest support was asked for in 2022 (issue #66); a community `vitest-auto-spies`
package was offered as PR #90 and is still unmerged. None of that is a criticism of the library —
it is what a stable package that stopped moving looks like. It does mean the following are not
coming, and each of them is something a migrated suite gets on the day it lands:

- **`Spy<T>` without `@types/jasmine`.** Upstream's type entry opens with
  `/// <reference types="jasmine" />`, so importing `Spy<T>` drags the whole global jasmine
  namespace into your typecheck — and requires the package to be installed in a project with no
  other use for it. Ours carries Vitest's `MockInstance` instead and references nothing global.
- **Asymmetric matchers inside `calledWith`.** Upstream compares arguments by
  `javascript-stringify` string equality, so `jasmine.any(String)` and `objectContaining(…)` inside
  a `calledWith` **never** match (issue #61, closed unfixed). Here `calledWith` runs the matcher.
- **Falsy values in `nextWithValues`.** Upstream tests `if ('value' in cfg && cfg.value)` — a
  truthiness check — so `{ value: 0 }`, `{ value: null }` and `{ value: '' }` are silently dropped
  from the emission sequence (issue #81, still open). Ours tests presence, `'value' in config`, so
  a stream of zeroes emits zeroes.
- **Abstract classes without a cast.** `createSpyFromClass(MyAbstractToken as any)` is the upstream
  spelling. Here an `abstract class` DI token is accepted as it is.
- **Reading the double back out typed.** Upstream needs `TestBed.inject<any>(X)`, which throws the
  type away at the one point a spec most needs it (issue #86 asked for a typed helper; it was never
  implemented). Here [`injectSpy(X)`](/adapters/angular) returns `Spy<X>`, and
  [`asSpy`](/core/spy-typing) does the same for a container this package has no adapter for.
- **Overload selection**, so `nextWith` on a generated API client stops demanding `HttpEvent<T>`
  from the last overload (issue #83). `asSpy<Client, { overload: 'first' }>(…)`.
- **[Strict doubles](/core/strict-mode)** that fail on a method nobody configured, and
  **`onlyMethodsToSpyOn`** for the exhaustive whitelist — neither exists upstream.

### A defect the two libraries shared

Upstream's method discovery filters only on `descriptor.get`, so a **write-only** prototype setter
looks like a method: a function spy is installed over it, and it overwrites the setter spy that
`settersToSpyOn` had just built. The setter then records nothing, and the spec asserting on it fails
with an empty call list and no explanation.

This repository had the identical bug, inherited the same way. It is fixed here.

## If the suite is Angular's

Most `jasmine-auto-spies` suites are Angular suites on Karma, and Angular ships its own tooling for
the half of the move this page does not cover — the **runner** swap. The two are complementary: the
schematics change the builder and the syntax of the runner's own globals, and the codemod above
changes the doubles. Version numbers matter here, so they are stated rather than implied
(`@angular/core` dist-tags at the time of writing: `latest` **22.1.4**, `v21-lts` **21.2.22**,
`v20-lts` **20.3.30**):

- **`@angular/build:unit-test` is `[EXPERIMENTAL]` in every version**, 22 included. Nothing about
  that stops it working; it does mean the builder options are not covered by Angular's deprecation
  policy yet.
- **`runner` was required in v20** and had no default. From **v21** it defaults to `"vitest"`, so a
  v21+ config can omit it and a v20 one cannot.
- **`ng generate @schematics/angular:refactor-jasmine-vitest` exists from v21 only**, and it is
  `"hidden": true` — it does not appear in `ng generate --help`, so it has to be named in full.
- **There is no `karma-to-vitest` generate schematic in any version.** From **v22** the equivalent is
  an `ng update` migration, and it is `"optional": true`, so a plain `ng update` will not run it:

  ```bash
  ng update @angular/cli --migrate-only --name migrate-karma-to-vitest
  ```

Where the schematic and this page disagree on a rewrite, the schematic is the more conservative of
the two by design: it emits `throw new Error(msg)` for `fail(msg)` in v21 (and `expect.fail(msg)` in
v22), and two statements — `toHaveBeenCalledTimes(1)` plus `toHaveBeenCalledWith(args)` — where
`toHaveBeenCalledExactlyOnceWith(args)` says the same thing in one. Either is correct; the single
matcher fails with a better message. What the schematic makes of `jasmine.createSpyObj` — an object
literal of `vi.fn()`, and three TODO comments it cannot resolve — has
[its own page](/migrating-angular-schematic), with the real output beside the one-liner.

## What else you gain

Everything [the jest migration page](/migrating#what-you-gain-by-moving) lists — the type-driven
factories, [fixtures](/utilities/fixtures), [observable assertions](/core/observable-assertions),
[console spies](/utilities/console), Bun and `node:test`, Angular's `TestBed`
[under `bun test`](/runtimes/bun-angular) — plus one thing specific to a jasmine suite: it has
probably been running under Karma. [`npx vitest-auto-spy doctor`](/utilities/cli) reports the
`karma.conf.*` left behind for a runner that is gone, and the setup files only it referenced.

## Did the migration lose a test?

The same question, and the same answer, as on [the jest page](/migrating#did-the-migration-lose-a-test):
`compareTestRuns` on the two JSON reports compares the **set of test names**, because two runs with
identical totals can differ by a lost `describe` and a fixed flake. A jasmine run reported through
Karma will not hand you that JSON directly — take the baseline from the first green Vitest run on
the shim, which is exactly the run step 1 exists to produce.
