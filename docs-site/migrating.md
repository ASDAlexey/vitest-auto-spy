---
title: Migrating from jest-auto-spies
description: A step-by-step swap from jest-auto-spies or @bugsplat/vitest-auto-spies, plus the per-runner gotchas.
---

# Migrating from jest-auto-spies

This page moves a test project from [`jest-auto-spies`](https://www.npmjs.com/package/jest-auto-spies)
(or [`@bugsplat/vitest-auto-spies`](https://www.npmjs.com/package/@bugsplat/vitest-auto-spies)) to
`vitest-auto-spy`. The API is the same, so in most specs you only change the imports:

```diff
- import { createSpyFromClass, provideAutoSpy } from 'jest-auto-spies';
+ import { createSpyFromClass } from 'vitest-auto-spy';
+ import { provideAutoSpy } from 'vitest-auto-spy/angular';
+ import 'vitest-auto-spy/rxjs'; // once, if you use observable spies
```

What moves: Angular helpers (`provideAutoSpy`, `injectSpy`) come from `vitest-auto-spy/angular`, and
the observable helpers (`nextWith` and others) need `import 'vitest-auto-spy/rxjs'` once. The core,
`Spy<T>` and `asSpy` stay on `vitest-auto-spy`. The codemod rewrites the imports for you:

```bash
npx vitest-auto-spy codemod --write
```

The most common compile error after the swap is the `TestBed.inject(X) as Spy<X>` cast. Replace it with
`injectSpy(X)`; see [Reading a spy back out of the container](#reading-a-spy-back-out-of-the-container).

Moving from `jasmine-auto-spies` instead? See [Coming from jasmine-auto-spies](#coming-from-jasmine-auto-spies)
below, then the separate page [Migrating from jasmine-auto-spies](/migrating-jasmine).

## Step by step

1. **Install the package and remove the old one.**

   ```bash
   npm i -D vitest-auto-spy
   npm rm jest-auto-spies   # or @bugsplat/vitest-auto-spies
   ```

2. **Run the [codemod](/utilities/codemod).** It is a dry run by default: the first command prints a
   diff and writes nothing.

   ```bash
   npx vitest-auto-spy codemod            # read the diff
   npx vitest-auto-spy codemod --write    # apply it
   npx vitest-auto-spy codemod --verify   # then check the result, not the diff
   ```

   On a Jest file it runs seven transforms:
   - the import split from step 3;
   - `TestBed.inject(X) as Spy<X>` → `asSpy<X>(…)`;
   - `@jest/globals` → `vitest`;
   - `jest.*` calls that have a `vi.*` twin;
   - the `jest.Mock<R, [A]>` reorder from [The type names](#the-type-names);
   - the jasmine aliases;
   - `mockImplementation()` with no argument.

   Six more transforms handle the [jasmine dialect](/migrating-jasmine). `--from` picks the dialect
   per file and defaults to `auto`; pass `--from jest-auto-spies` to fix it.

   Calls that [have no `vi.*` twin](#the-jest-calls-that-have-no-vi-twin) stay as they are. The
   codemod names each with `path:line` and exits with code 1. That is expected: those spots need a
   decision, not a rename.

   The steps below are what the codemod does and what it leaves to you. Read them either way; the
   report refers to them.

3. **Rewrite the imports.** The core keeps its name. The Angular helpers and the observable helpers
   moved to their own import paths.

   ```diff
   - import { createSpyFromClass, provideAutoSpy } from 'jest-auto-spies';
   + import { createSpyFromClass } from 'vitest-auto-spy';
   + import { provideAutoSpy } from 'vitest-auto-spy/angular';
   ```

   The codemod reads which name lives where from the `exports` map of the installed package.
   `npx vitest-auto-spy codemod --list` prints the whole table.

   Importing a helper from the wrong entry is the most common miss, because `jest-auto-spies`
   exports `provideAutoSpy` from its root. `npx vitest-auto-spy doctor` finds every such import at
   once and reports it as `helper-from-wrong-entry` ([CLI → doctor](/utilities/cli)).

4. **Add the rxjs import once**, in the setup file, if any spy uses `nextWith`, `nextWithValues` or
   `observablePropsToSpyOn`:

   ```ts
   // vitest.setup.ts
   import 'vitest-auto-spy/rxjs';
   ```

   Vitest runs this file before each spec file when `vitest.config.ts` lists it:
   `test: { setupFiles: ['./vitest.setup.ts'] }`.

   If you forget it, the first observable helper throws an error that names this import.

5. **Check the entry for your test runner.** On Vitest you already import `vitest-auto-spy`, so
   there is nothing to do. On another runner, import its entry instead of the root:
   - `vitest-auto-spy` for Vitest;
   - `vitest-auto-spy/bun` for `bun:test`;
   - `vitest-auto-spy/node` for `node:test`.

6. **Type the variables as `Spy<T>`.** `let service: MyService = createSpyFromClass(...)` fails to
   compile when the class has `#private` or `private` members, because `Spy<T>` drops them. Write
   `let service: Spy<MyService>`. Where the spy must go to something typed as the class, use
   [`asInstance` / `asSpy`](/core/spy-typing).

7. **Run the tests.** The helper API is the same, so what fails now is real.

8. **Optional, once green:** add [`setupAutoSpy()`](/utilities/setup) to the setup file, and turn on
   the [ESLint rules](/utilities/eslint-plugin) that steer specs to the newer helpers.

## Mapping table

The same table applies to [`@bugsplat/vitest-auto-spies`](https://www.npmjs.com/package/@bugsplat/vitest-auto-spies),
which re-exports the `jest-auto-spies` API. On top you get Bun and `node:test`, `createAutoMock`,
framework helpers and console spies.

| jest-auto-spies                                                       | vitest-auto-spy                                           | Status       |
| --------------------------------------------------------------------- | --------------------------------------------------------- | ------------ |
| `createSpyFromClass`                                                  | `createSpyFromClass`                                      | ✅ identical |
| `methodsToSpyOn`                                                      | `methodsToSpyOn`: adds methods, in both libraries         | ✅ identical |
| `provideAutoSpy`                                                      | `provideAutoSpy` (from `/angular`)                        | ✅ identical |
| `calledWith` / `mustBeCalledWith`                                     | same                                                      | ✅ identical |
| `calledWith(...).returnValue(v)`                                      | same; `.returnValue` **and** `.mockReturnValue` both work | ✅ identical |
| `resolveWith` / `rejectWith` / `resolveWithPerCall`                   | same                                                      | ✅ identical |
| `nextWith` / `nextOneTimeWith` / `nextWithValues` / `nextWithPerCall` | same                                                      | ✅ identical |
| `throwWith` / `complete` / `returnSubject`                            | same                                                      | ✅ identical |
| `accessorSpies.getters/setters`                                       | same                                                      | ✅ identical |
| `createObservableWithValues`                                          | same (from `/rxjs`)                                       | ✅ identical |
| underlying mock                                                       | `jest.fn()` → `vi.fn()`                                   | 🔁 swapped   |

Your tests must run under Vitest (or Bun / `node:test` through the matching entry). For Angular,
`TestBed` must be set up.

If you want **only** the listed methods to be spies, use `onlyMethodsToSpyOn`. `methodsToSpyOn`
adds to the methods found on the class, as in `jest-auto-spies`. Versions of this library before 2.0
differed; see
[Upgrading to 2.0](/upgrading-2).

### Reading a spy back out of the container

`Spy<T>` is stricter here than in `jest-auto-spies`, so the usual cast stops compiling:

```ts
// jest-auto-spies
hardwareService = TestBed.inject(DeviceListService) as Spy<DeviceListService>;
// TS2352: Conversion of type 'DeviceListService' to type 'Spy<DeviceListService>'
//         may be a mistake because neither type sufficiently overlaps with the other.

// vitest-auto-spy
hardwareService = asSpy(TestBed.inject(DeviceListService));
// or, with TestBed.inject built in:
hardwareService = injectSpy(DeviceListService);
```

`asSpy` (from `vitest-auto-spy`) is only a typing helper: it returns its argument unchanged, typed as
`Spy<T>`. `injectSpy` (from `vitest-auto-spy/angular`) does the same with `TestBed.inject` built in. This is the most common compile error in a migrated Angular
project, one per injected spy, so search for the cast before the first run. In Angular specs prefer `injectSpy`. The ESLint rule
[`prefer-as-spy`](/utilities/eslint-plugin) finds every such cast and fixes it with `--fix`,
including the import.

### The type names

`vi` is a global when Vitest runs with `test: { globals: true }` (the Angular builder turns it on),
so a migrated spec imports only types from `vitest`. Three renames are simple. The
fourth one silently flips its meaning:

| Jest                  | Vitest              | Import                                         |
| --------------------- | ------------------- | ---------------------------------------------- |
| `jest.Mocked<T>`      | `Mocked<T>`         | `import type { Mocked } from 'vitest'`         |
| `jest.MockedFunction` | `MockedFunction`    | `import type { MockedFunction } from 'vitest'` |
| `jest.SpyInstance`    | `MockInstance`      | `import type { MockInstance } from 'vitest'`   |
| `jest.Mock<R, [A]>`   | `Mock<(a: A) => R>` | `import type { Mock } from 'vitest'`           |

::: warning `jest.Mock` reorders its own generics
Jest's `Mock` takes the **return type first and the arguments second**. Vitest's `Mock` takes one
function type. A plain rename to `Mock<void, [A]>` does not describe "returns void, takes A" any more.
Nothing fails until a call site disagrees:

```ts
// jest: returns void, takes one AdjustedPlanDetails
let callBack: jest.Mock<void, [AdjustedPlanDetails]>;

// vitest: the same intent, written as the call signature
let callBack: Mock<(details: AdjustedPlanDetails) => void>;
```

A bare `jest.Mock` with no generics is safe: plain `Mock` means the same thing.
:::

For anything this library creates, declare `Spy<T>`, not `Mocked<T>`. The rule
[`no-mocked-for-spy`](/utilities/eslint-plugin) explains why and fixes it automatically.

Put the `vitest` type import next to the other npm package imports (after `@angular/*`). If you put it
above the framework imports, `eslint-plugin-import` reports every spec:

```
error  There should be at least one empty line between import groups        import/order
error  `vitest` type import should occur after import of `@angular/router`  import/order
```

### The `jest.*` calls the codemod renames

The codemod renames these 26 members of `jest` to the same member of `vi`. Only one changes its
name: `jest.dontMock` becomes `vi.doUnmock`.

- mocks: `fn`, `spyOn`, `mocked`, `isMockFunction`, `clearAllMocks`, `resetAllMocks`,
  `restoreAllMocks`;
- modules: `mock`, `doMock`, `unmock`, `dontMock`, `resetModules`;
- timers: `useFakeTimers`, `useRealTimers`, `runAllTimers`, `runAllTimersAsync`,
  `runOnlyPendingTimers`, `runOnlyPendingTimersAsync`, `advanceTimersByTime`,
  `advanceTimersByTimeAsync`, `advanceTimersToNextTimer`, `advanceTimersToNextTimerAsync`,
  `clearAllTimers`, `getTimerCount`;
- clock: `setSystemTime`, `getRealSystemTime`.

Any other `jest.*` member stays as it is, and the report names it. The next section lists the ones
with no `vi.*` twin.

### The `jest.*` calls that have no `vi.*` twin

A plain `jest.` → `vi.` rename produces calls that do not exist, such as
`TypeError: vi.requireMock is not a function`. For each call below, the fix is a different approach,
not a different name.

| Jest                                                      | Vitest                        | What to do instead                                                                                                                              |
| --------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `jest.requireMock(id)`                                    | **none**                      | provide the spy through TestBed / the DI container, or pass it as an argument                                                                   |
| `jest.requireActual(id)`                                  | `vi.importActual(id)`         | `await` it, and only inside a `vi.mock` factory                                                                                                 |
| `jest.fn().mockImplementation(() => o)` used with `new`   | **not constructible**         | [`mockConstructor` / `stubConstructor`](/utilities/constructor-doubles)                                                                         |
| `jest.spyOn(global, 'Date')`                              | **throws**                    | `mockSystemTime(iso)`; fake timers already own `Date`                                                                                           |
| `jest.replaceProperty(obj, key, value)`                   | **none**                      | `mockValueProp(obj, key, value)`; it restores itself                                                                                            |
| `fakeTimers: { enableGlobally: true }`                    | **no setting**                | `setupAutoSpy({ globalFakeTimers: true })`                                                                                                      |
| `jest.mock('some-barrel')`                                | `vi.mock(…)`                  | does **nothing, silently**, once specs are bundled: the module it would replace no longer exists as a separate module                           |
| `jest.spyOn(barrel, 'exported')`                          | **throws**                    | `TypeError: Cannot redefine property`: a bundled export cannot be redefined; [provide a real seam](/utilities/module-mocks#provide-a-real-seam) |
| `jest.fn().mockImplementation()` with no argument         | **requires one**              | `mockImplementation(() => undefined)`; Jest added the no-op for you                                                                             |
| `xit` / `xdescribe`                                       | **none**                      | `it.skip` / `describe.skip`; a plain rename fails with `TS2304: Cannot find name 'xit'`                                                         |
| `testTimeout: 30000` (one budget)                         | **two fields**                | set `hookTimeout` to the same number; Vitest defaults it to 10 000 ms                                                                           |
| `expect(a).toHaveBeenCalledBefore(b)` across spy families | **a wrong verdict, no error** | compare two auto-spies, or `setSpyEngine('runner')`; see [call order](#call-order-across-spy-families) below                                    |
| `collectCoverageFrom: [...]`                              | `coverage.include`            | and **not** `coverage.all`: Vitest 4 removed that key; `include` alone now covers files no test imported                                        |

#### Timeouts

Jest has one `testTimeout` for hooks and test bodies. Vitest has a separate `hookTimeout` that
defaults to 10 000 ms. If you copy only the Jest number, every hook stays on 10 seconds.

The failure then points at the wrong place. A `beforeEach` timeout is reported against the **test**,
with the test's duration at the limit: `× should create 10045ms`, although the test body never ran.
[`setupAutoSpy()`](/utilities/setup) says so in the error. The fix is one line:

```ts
test: {
  testTimeout: 30_000,
  // Jest had one budget for both; Vitest defaults this to 10_000 on its own.
  hookTimeout: 30_000,
}
```

`slowTestThreshold` also changes units: `5` in Jest means **seconds**, `300` in Vitest means
**milliseconds**. A migrated project may start marking most files as slow; only the report changes.

#### Coverage

The coverage report changes in two ways:

- `coverage.all` no longer exists. A config that still has `all: true` sets nothing, and the report
  silently shrinks to the files the run imported. Declare `coverage.include`.
- Jest measures coverage with istanbul; Vitest's default provider is `v8`. `v8` counts every function
  the engine created, not the ones in the source map. So the function percentage moves on unchanged
  code, while lines and branches stay the same. Measure a function-coverage threshold again; do not
  copy the old number.

#### Module mocks under a bundling builder

This one costs the most, because nothing reports it. It happens:

- under a test builder that bundles specs;
- under `isolate: false`, where the module may already be loaded in the worker.

There, a `vi.mock()` of a workspace barrel, of `@angular/core`, or of a relative path does nothing,
or works only on some runs. If a mock "works in a narrow run but not in a wide one", this is why.
[Replace the mock with a real seam](/utilities/module-mocks#provide-a-real-seam): a provider, an
argument, or `vi.hoisted()` for a package that really must be replaced.

`vi.spyOn` on the barrel is the same problem, but loud: it throws `Cannot redefine property`. An
accessor spy made with this package re-throws that error and names the property, the target and the
fix.

#### Call order across spy families

This row gives a wrong answer instead of an error, so read it before you rename.
`toHaveBeenCalledBefore` and `toHaveBeenCalledAfter` compare `mock.invocationCallOrder`.

- This package's method spies are its own mock functions (the default "spy engine"), and they
  number their calls with their own counter.
- `vi.fn()` spies use a separate counter inside Vitest that nothing else can read or advance.

`jest-auto-spies` built its spies with `jest.fn()`, so both kinds shared one counter. Here they do
not, and the two counters drift apart as the test run goes on. In one converted project, an auto-spy
reported `[164, 165, 167, 168, 169]` next to a `vi.fn()` reporting `[28]` **in the same test**, and
the assertion still passed. Three earlier calls of one kind are enough to invert the answer.

Two one-line fixes:

- compare two spies of the same kind. Both sides of an order check are usually collaborators of the
  code under test anyway;
- or switch the whole run to the runner's spies:

```ts
import { setSpyEngine } from 'vitest-auto-spy/setup';

setSpyEngine('runner'); // method spies are vi.fn()s again, so both kinds share one counter
```

The call counter is the only thing the two engines do not share, and the only reason the switch
exists.

## Per-runner gotchas

**Vitest.** Nothing beyond the import change. If the project runs with `isolate: false` or a shared
environment, add `setupAutoSpy()`. Jest isolated every file, so a `mock*Prop` patch was harmless
there; here it can outlive its spec.

**Waiting for async work.** Under Jest, `import()` was compiled to `require()` and fake timers were
usually global, so the kinds of pending work looked alike. Under Vitest they are four separate
queues: change detection, effects, timers and dynamic imports. A test that waits on the wrong one
fails with a message that names none of them. [Waiting and the clock](/utilities/event-loop#four-queues)
shows which helper drives which.

**`vi.fn(() => x)` is not `mockReturnValue(x)`.** This rename looks safe and is not.

- A factory `() => x` reads `x` each time the spy is **called**.
- `mockReturnValue(x)` keeps the value `x` had when the spy was **configured**.

The difference shows when the test reassigns `x`. The common case is a fresh `Subject` after the old
one errored or completed:

```ts
let source$ = new Subject<Page>();

const api = createSpyFromClass(Api);

api.load.mockReturnValue(source$); // ❌ pinned to the subject that existed on this line
api.load.mockImplementation(() => source$); // ✅ re-read on every call

source$.error(new Error('boom'));
source$ = new Subject<Page>(); // the spy still returns the dead subject from above
```

In one spec, the service got a completed subject and silently skipped the modal it should show, and
the test stayed green. Turn `vi.fn(() => x)` into `mockImplementation(() => x)`, and keep
`mockReturnValue` for literals. If you write your own codemod, handle this case specially.

**Bun (`bun:test`).**

- On Bun, `mockReset()` also drops the implementation (Vitest keeps it). The adapter restores it, so
  auto-spies are fine, but a hand-written `mock()` in the same spec behaves differently.
- Bun's `spyOn` refuses getters and setters. Accessor spies here redefine the property instead, so
  they work.
- Angular tests need [`vitest-auto-spy/bun-angular`](/runtimes/bun-angular).

**`node:test`.**

- There is no `expect`; use `node:assert`.
- `spy.method.mockReturnValue` is a Vitest/Bun method that `node:test` does not have. Use
  `spy.method.calledWith(...).mockReturnValue(...)`, which works everywhere.
- Recorded calls read as `mock.calls[0].arguments`, not `mock.calls[0]`.

See [node:test](/runtimes/node).

**Angular.** `provideAutoSpy` creates **lazy** spies here (`jest-auto-spies` was always eager). Calls
and assertions behave the same. By default a class with 8 or more methods gets a `Proxy`-based spy
and a smaller one gets a plain object with getters. `{ lazySpies: true }` forces the plain object for
any size; `{ lazySpies: false }` creates every spy up front, before first access.

## Coming from jasmine-auto-spies

`jasmine-auto-spies` and `jest-auto-spies` share one core, so everything on this page applies. Two
differences:

- It keeps async helpers on `.and`: `spy.load.and.nextWith(v)` is `spy.load.nextWith(v)` here.
  [`vitest-auto-spy/jasmine`](/migrating-jasmine) adds `.and` back, so your tests pass before you
  rewrite anything.
- Jasmine's `spyOn` **replaces** the method, while `vi.spyOn` **calls through** to it. A plain
  rename silently inverts the behaviour.

[Migrating from jasmine-auto-spies](/migrating-jasmine) maps both the auto-spies API and Jasmine's
own globals: `createSpyObj`, asymmetric matchers, `clock()`, `withContext`,
`DEFAULT_TIMEOUT_INTERVAL`, `fdescribe`/`xit` and `done` callbacks.

## What you gain by moving

Beyond the runner change, everything the old API did not have:

- [`createAutoMock` / `mockDeep` / `createMock`](/core/auto-mock-by-type);
- [`createFixture` / `createFixtureFactory`](/utilities/fixtures) for shared test data. Copies of one
  model kept per spec are costly: on one migration shard they alone produced **28 `TS1117`**
  diagnostics (a duplicate key in a literal) behind 26 key pairs in eight fixtures, plus half of that
  shard's `TS2741`;
- [`renderShallow` and `createWithAutoSpies`](/adapters/angular);
- [observable assertions](/core/observable-assertions);
- [fake timers that settle](/utilities/fake-timers);
- [console spies](/utilities/console) and the [ESLint rules](/utilities/eslint-plugin);
- Bun and `node:test` support, and [Angular's `TestBed` under `bun test`](/runtimes/bun-angular).

## Did the migration lose a test?

Compare the test lists of the run before and after the migration:

```ts
import { compareTestRuns, formatTestRunComparison } from 'vitest-auto-spy/diagnostics';

const diff = compareTestRuns(JSON.parse(before), JSON.parse(after), '/my-repo/');

expect(diff.missing).toEqual([]);
process.stdout.write(formatTestRunComparison(diff));
```

- `before` and `after` are JSON reports (`--reporter=json`). Jest and Vitest write the same shape, so
  the baseline can come from Jest.
- The third argument cuts a shared path prefix, so a CI report compares with a local one.
- A renamed test shows up in both `missing` and `added`: from outside, a rename looks like a delete
  plus an add.

Why not compare totals: under `isolate: false` a file can lose a whole `describe` block (for
example, a spec file imported by its neighbour). In the same run, a flaky test elsewhere can start
passing. The totals match, and a block of tests is silently gone.

::: tip What this actually caught
In the migration this helper comes from, the edits were done in seven parallel batches. The
comparison showed exactly one test gone: it checked a config key deleted six months earlier in an
unrelated commit. Nothing else was lost. Only a list comparison can prove that.
:::

## A codemod that edits globs is verified by matching, not by diffing

The obvious check on a codemod is "did the file change the way I meant?". For a codemod that
rewrites **globs**, that check passes while the result is broken. An empty `include` is a legal
`tsconfig.json`, and TypeScript says nothing about it.

A real case: a migration codemod removed `jest.config.ts` from `include` with a greedy pattern that
also ate `/**/*`. `src/**/*.spec.ts` became `src*.spec.ts`: valid, and matching no file. Of 152 spec
tsconfigs, **nine** still covered their specs. `tsc --noEmit` reported zero errors, because there was
nothing to check. Someone found out only by opening a spec in an editor and seeing
`Cannot find name 'vi'`.

So the check is: **does the new pattern match at least one existing file?** Print the resulting
`include` in full, not a count. "fixed: 152" hid a case where the first repair produced two different
wrong shapes.

[`npx vitest-auto-spy codemod --verify`](/utilities/codemod#verifying-by-matching-not-by-diffing)
runs this check. Each of the thirteen transforms declares the pattern it should remove. `--verify`
changes nothing: it matches those patterns against the **result** and names every leftover with
`file:line`. Because it matches instead of diffing:

- it works on code the codemod never touched: files migrated by hand, or spans left alone because
  a transform was turned off with `--skip`. So it belongs in CI on a project that is already
  migrated;
- it catches a correct diff that still leaves `jest.` in the file, for example inside a template
  literal or past an unbalanced bracket.

The run report prints the resulting **import statements in full**, not "6 edits", for the same
reason.
