---
title: Migrating from jest-auto-spies
description: A step-by-step swap from jest-auto-spies or @bugsplat/vitest-auto-spies, plus the per-runner gotchas.
---

# Migrating from jest-auto-spies

To switch to `vitest-auto-spy` from [`jest-auto-spies`](https://www.npmjs.com/package/jest-auto-spies)
or [`@bugsplat/vitest-auto-spies`](https://www.npmjs.com/package/@bugsplat/vitest-auto-spies), use
the codemod or update the imports by hand. For most tests, the change looks like this:

```diff
- import { createSpyFromClass, provideAutoSpy } from 'jest-auto-spies';
+ import { createSpyFromClass } from 'vitest-auto-spy';
+ import { provideAutoSpy } from 'vitest-auto-spy/angular';
+ import 'vitest-auto-spy/rxjs'; // add once in test setup if you use observable spies
```

Import `provideAutoSpy` and `injectSpy` from `vitest-auto-spy/angular`. If you use observable
helpers such as `nextWith`, add `import 'vitest-auto-spy/rxjs'` once in your test setup. Import
`Spy<T>`, `asSpy` and the other core helpers from `vitest-auto-spy`. After installing the package,
preview and apply the changes with the codemod in step 2.

The most common compile error after the swap is the `TestBed.inject(X) as Spy<X>` cast. The codemod
rewrites it to `asSpy<X>(…)`. If you are editing by hand, use `injectSpy(X)`;
see [Reading a spy back out of the container](#reading-a-spy-back-out-of-the-container).

Moving from `jasmine-auto-spies` instead? See [Coming from jasmine-auto-spies](#coming-from-jasmine-auto-spies)
below, then the separate page [Migrating from jasmine-auto-spies](/migrating-jasmine).

## Step by step

1. **Install the package and remove the old one.**

   ```bash
   npm i -D vitest-auto-spy
   npm rm jest-auto-spies   # or @bugsplat/vitest-auto-spies
   ```

2. **Run the [codemod](/utilities/codemod).** Preview the diff before you write changes.

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

   Six more transforms handle [Jasmine files](/migrating-jasmine). The default, `--from auto`,
   detects the dialect for each file. Pass `--from jest-auto-spies` to select Jest explicitly.

   The codemod leaves calls [with no `vi.*` equivalent](#the-jest-calls-that-have-no-vi-twin)
   unchanged. It reports each one as `path:line` and exits with code 1. Fix those calls by hand.
   Use the steps below alongside the report, whether you run the codemod or migrate by hand.

3. **Rewrite the imports.** Keep core helpers on the root import. Use separate paths for Angular
   and observable helpers.

   ```diff
   - import { createSpyFromClass, provideAutoSpy } from 'jest-auto-spies';
   + import { createSpyFromClass } from 'vitest-auto-spy';
   + import { provideAutoSpy } from 'vitest-auto-spy/angular';
   ```

   The codemod uses the installed package's `exports` map. Run
   `npx vitest-auto-spy codemod --list` to see the full mapping.

   Check imports from the old root, especially `provideAutoSpy`. Run `npx vitest-auto-spy doctor`
   to find wrong imports under `helper-from-wrong-entry` ([CLI → doctor](/utilities/cli)).

4. **Add the rxjs import once**, in the setup file, if any spy uses `nextWith`, `nextWithValues` or
   `observablePropsToSpyOn`:

   ```ts
   // vitest.setup.ts
   import 'vitest-auto-spy/rxjs';
   ```

   In `vitest.config.ts`, set `test: { setupFiles: ['./vitest.setup.ts'] }` to run this setup before
   each spec file. Without the RxJS import, the first observable helper you use throws an error
   that names it.

5. **Check the import path for your test runner.** On Vitest, keep the root import. On another
   runner, use its own import path:
   - `vitest-auto-spy` for Vitest;
   - `vitest-auto-spy/bun` for `bun:test`;
   - `vitest-auto-spy/node` for `node:test`.

6. **Type the variables as `Spy<T>`.** Use `let service: Spy<MyService>`. A spy omits `#private`
   and `private` members, so assigning it to `let service: MyService` fails for classes with those
   members. To pass a spy where the class type is required, see
   [`asInstance` / `asSpy`](/core/spy-typing).

7. **Run the tests.** Keep the existing helper calls and fix any failures.

8. **Optional, once the tests pass:** add [`setupAutoSpy()`](/utilities/setup) to the setup file
   and enable the [ESLint rules](/utilities/eslint-plugin) that suggest newer helpers.

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

In Angular specs, prefer `injectSpy` from `vitest-auto-spy/angular`: it calls `TestBed.inject` for
you and types the result as `Spy<T>`. If you already have the instance, `asSpy` from
`vitest-auto-spy` gives it the same type without changing it. Search for the old casts before the
first run, or use [`prefer-as-spy`](/utilities/eslint-plugin) with `--fix` to update them and their
imports.

### The type names

With `test: { globals: true }`, you can use `vi` without importing it. The Angular builder enables
this setting, so these specs only need type imports from `vitest`. For `jest.Mock` with type
arguments, change the type as well as the name:

| Jest                  | Vitest              | Import                                         |
| --------------------- | ------------------- | ---------------------------------------------- |
| `jest.Mocked<T>`      | `Mocked<T>`         | `import type { Mocked } from 'vitest'`         |
| `jest.MockedFunction` | `MockedFunction`    | `import type { MockedFunction } from 'vitest'` |
| `jest.SpyInstance`    | `MockInstance`      | `import type { MockInstance } from 'vitest'`   |
| `jest.Mock<R, [A]>`   | `Mock<(a: A) => R>` | `import type { Mock } from 'vitest'`           |

::: warning `jest.Mock` reorders its own generics
Jest's `Mock` takes the return type first and the argument types second. Vitest's `Mock` takes one
function type. Renaming `jest.Mock<void, [A]>` to `Mock<void, [A]>` does not preserve its meaning.
The mismatch can go unnoticed until a call site disagrees:

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

Don't replace every `jest.` with `vi.`. Some calls need a different approach. For example,
`vi.requireMock` throws `TypeError: vi.requireMock is not a function`.

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

In Jest, `testTimeout` covers both hooks and test bodies. Vitest sets `hookTimeout` separately and
defaults it to 10 seconds. To keep your Jest timeout for both, set both values:

```ts
test: {
  testTimeout: 30_000,
  // Jest had one budget for both; Vitest defaults this to 10_000 on its own.
  hookTimeout: 30_000,
}
```

If `beforeEach` times out, Vitest reports it against the test, even if its body never ran. You
might see `× should create 10045ms`. [`setupAutoSpy()`](/utilities/setup) can add an error hint when
`hookTimeout` is shorter than `testTimeout`.

`slowTestThreshold` uses seconds in Jest (`5`) and milliseconds in Vitest (`300`). This affects
which tests the report marks as slow, not how they run.

#### Coverage

Copy Jest’s `collectCoverageFrom` patterns into `test.coverage.include` in `vitest.config.ts`.
On Vitest 4 and later, use `include` instead of `coverage.all`. Without `include`, the report
covers only files your tests imported.

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { coverage: { include: ['src/**/*.ts'], exclude: ['src/**/*.spec.ts', 'src/**/*.test.ts'] } },
});
```

Adapt the patterns to your project. If using the default `v8` provider, install `@vitest/coverage-v8`
at the same version as Vitest. Run `npx vitest run --coverage`.
Check the function threshold: switching from Jest’s Istanbul to Vitest’s default `v8` can change
that number even when line and branch coverage stay the same.

#### Module mocks under a bundling builder

If the builder bundles specs, `vi.mock()` may have no separate module to replace. With
`isolate: false`, a worker may already have loaded the module. Either way, mocks of workspace
re-exports (barrels), `@angular/core` or relative imports can silently stop working. They may still
work when you run fewer tests.

[Replace the module mock with a provider or an argument](/utilities/module-mocks#provide-a-real-seam).
If you need to replace a package, use `vi.hoisted()`. `vi.spyOn` on a bundled export throws
`Cannot redefine property`; this package's accessor spies report the property, target and fix.

#### Call order across spy families

Compare two spies of the same kind when you check call order. `toHaveBeenCalledBefore` and
`toHaveBeenCalledAfter` compare `mock.invocationCallOrder`, but auto-spies and `vi.fn()` number
calls with separate counters. Vitest's counter is private to Vitest. With `jest-auto-spies`, both
kinds used `jest.fn()` and shared a counter.

Mixing spy kinds can silently reverse the result. In one migration, an assertion passed even
though the auto-spy reported `[164, 165, 167, 168, 169]` and `vi.fn()` reported `[28]` in the same
test. Three earlier calls of one kind can be enough to reverse the result.

If you need to compare an auto-spy with `vi.fn()`, switch the whole run to Vitest's spies:

```ts
import { setSpyEngine } from 'vitest-auto-spy/setup';

setSpyEngine('runner'); // method spies are vi.fn()s again, so both kinds share one counter
```

The call counter is the only thing the two engines do not share, and the only reason the switch
exists.

## Per-runner gotchas

**Vitest.** Use the new imports. If you run with `isolate: false` or a shared environment, add
`setupAutoSpy()`. Jest isolated files, but in a shared environment a `mock*Prop` patch can outlive
its spec.

**Waiting for async work.** Under Jest, `import()` compiled to `require()` and fake timers were
usually global. In Vitest, tests may need to wait for four separate queues: change detection,
effects, timers and dynamic imports. The error may not tell you which one is still pending.
[Waiting and the clock](/utilities/event-loop#four-queues) shows which helper to use for each.

**Replacing `vi.fn(() => x)`.** Use `mockImplementation(() => x)` if `x` can change. Use
`mockReturnValue(x)` for literals.

- A factory `() => x` reads `x` each time the spy is **called**.
- `mockReturnValue(x)` keeps the value `x` had when the spy was **configured**.

This matters when a test replaces a `Subject` that completed or errored. The two setup lines below
are alternatives: the first keeps the old subject; the second returns the new one.

```ts
let source$ = new Subject<Page>();

const api = createSpyFromClass(Api);

api.load.mockReturnValue(source$); // ❌ pinned to the subject that existed on this line
api.load.mockImplementation(() => source$); // ✅ re-read on every call

source$.error(new Error('boom'));
source$ = new Subject<Page>(); // the spy still returns the dead subject from above
```

In one migration, a service got a completed subject and skipped the modal it should show. The test
still passed. If you write a codemod, handle reassigned values separately.

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

**Angular.** `provideAutoSpy` creates spies on first access; `jest-auto-spies` created them up
front. Calls and assertions work the same. By default, classes with at least eight methods get a
`Proxy` and smaller classes get an object with getters. Set `{ lazySpies: true }` to use an object
with getters at any size, or `{ lazySpies: false }` to create all spies up front.

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

Beyond the runner change, you get:

- [`createAutoMock` / `mockDeep` / `createMock`](/core/auto-mock-by-type);
- [`createFixture` / `createFixtureFactory`](/utilities/fixtures) to share test data. In one
  migration batch, copied models caused 28 `TS1117` diagnostics (26 duplicate key pairs across
  eight fixtures) and half the `TS2741` diagnostics;
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

Compare names, not totals. With `isolate: false`, a file can lose a whole `describe` block if a
neighbour imports it. The totals can still match if a flaky test elsewhere starts passing.

::: tip What this actually caught
In one migration, seven batches ran in parallel. Comparing the names found exactly one missing
test: it checked a config key removed in an unrelated commit six months earlier.
:::

## A codemod that edits globs is verified by matching, not by diffing

After rewriting a file pattern (glob), check that it still matches at least one existing file.
A correct-looking diff isn't enough. An empty `include` in `tsconfig.json` is valid, so TypeScript
may report zero errors without checking any test files.

In one migration, a pattern removed both `jest.config.ts` and `/**/*` from `include`.
`src/**/*.spec.ts` became `src*.spec.ts` and matched nothing. Only nine of 152 test configs still
covered their specs. `tsc --noEmit` reported no errors; the editor showed `Cannot find name 'vi'`
when someone opened a spec. Print each resulting `include` in full: the count `fixed: 152` hid two
incorrect patterns from the first repair.

[`npx vitest-auto-spy codemod --verify`](/utilities/codemod#verifying-by-matching-not-by-diffing)
checks file matches. Each of the thirteen transforms also declares a pattern it should remove.
`--verify` makes no edits: it searches the updated files for leftovers and reports them as
`file:line`. You can use it to:

- check hand-edited files and work left by transforms disabled with `--skip`; run it in CI after
  the migration;
- catch remaining `jest.` references even when the diff looks right, for example in a template
  literal or after an unbalanced bracket.

The run report prints the resulting **import statements in full**, not "6 edits", for the same
reason.
