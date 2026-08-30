---
title: Migrating from jest-auto-spies
description: A step-by-step swap from jest-auto-spies or @bugsplat/vitest-auto-spies, plus the per-runner gotchas.
---

# Migrating from jest-auto-spies

The public API is intentionally identical to
[`jest-auto-spies`](https://www.npmjs.com/package/jest-auto-spies). In most projects the migration
is a **find-and-replace of the import**:

```diff
- import { createSpyFromClass, provideAutoSpy } from 'jest-auto-spies';
+ import { createSpyFromClass } from 'vitest-auto-spy';
+ import { provideAutoSpy } from 'vitest-auto-spy/angular';
+ import 'vitest-auto-spy/rxjs'; // once, if you use observable spies
```

The only API-shape change is that the Angular helpers and the observable layer live behind the
`/angular` and `/rxjs` subpaths (see [Installation → Entry points](/core/installation)).

## Mapping table

This also covers migrating from
[`@bugsplat/vitest-auto-spies`](https://www.npmjs.com/package/@bugsplat/vitest-auto-spies) —
it re-exports the same `jest-auto-spies` API, so the swap is identical (and you gain Bun /
`node:test`, `createAutoMock`, framework recipes and console spies on top).

| jest-auto-spies                                                       | vitest-auto-spy                                            | Status       |
| --------------------------------------------------------------------- | ---------------------------------------------------------- | ------------ |
| `createSpyFromClass`                                                  | `createSpyFromClass`                                       | ✅ identical |
| `methodsToSpyOn`                                                      | `methodsToSpyOn` — additive there and additive here        | ✅ identical |
| `provideAutoSpy`                                                      | `provideAutoSpy` (from `/angular`)                         | ✅ identical |
| `calledWith` / `mustBeCalledWith`                                     | same                                                       | ✅ identical |
| `calledWith(...).returnValue(v)`                                      | same — `.returnValue` **and** `.mockReturnValue` both work | ✅ identical |
| `resolveWith` / `rejectWith` / `resolveWithPerCall`                   | same                                                       | ✅ identical |
| `nextWith` / `nextOneTimeWith` / `nextWithValues` / `nextWithPerCall` | same                                                       | ✅ identical |
| `throwWith` / `complete` / `returnSubject`                            | same                                                       | ✅ identical |
| `accessorSpies.getters/setters`                                       | same                                                       | ✅ identical |
| `createObservableWithValues`                                          | same (from `/rxjs`)                                        | ✅ identical |
| underlying mock                                                       | `jest.fn()` → `vi.fn()`                                    | 🔁 swapped   |

Just make sure your tests run under Vitest (or Bun / `node:test` via the matching entry), and — for
Angular — that `TestBed` is set up.

### Reading a spy back out of the container

`Spy<T>` is stricter here than it was in `jest-auto-spies`, so the cast a migrated suite is full of
stops compiling:

```ts
// jest-auto-spies
devicesService = TestBed.inject(DeviceListService) as Spy<DeviceListService>;
// TS2352: Conversion of type 'DeviceListService' to type 'Spy<DeviceListService>'
//         may be a mistake because neither type sufficiently overlaps with the other.

// vitest-auto-spy
devicesService = asSpy(TestBed.inject(DeviceListService));
```

`asSpy` is a typed identity — it asserts what `provideAutoSpy` already put in the container, without
the cast. `injectSpy(DeviceListService)` is the same thing with the `TestBed.inject` folded in. This is
the most common compile error a migrated Angular suite produces, and it produces one per injected
double, so it is worth a global search before the first run.

Or leave the search to [`prefer-as-spy`](/utilities/eslint-plugin), which reports every one of those
casts and rewrites them under `--fix`, import and all.

### The type names

`vi` is a global, so the only thing a migrated spec imports from `vitest` is types. Three of the four
renames are plain, and the fourth quietly means the opposite of what it did:

| Jest                  | Vitest              | Import                                         |
| --------------------- | ------------------- | ---------------------------------------------- |
| `jest.Mocked<T>`      | `Mocked<T>`         | `import type { Mocked } from 'vitest'`         |
| `jest.MockedFunction` | `MockedFunction`    | `import type { MockedFunction } from 'vitest'` |
| `jest.SpyInstance`    | `MockInstance`      | `import type { MockInstance } from 'vitest'`   |
| `jest.Mock<R, [A]>`   | `Mock<(a: A) => R>` | `import type { Mock } from 'vitest'`           |

::: warning `jest.Mock` reorders its own generics
Jest writes the **return type first and the arguments second**; Vitest's `Mock` takes a single call
signature. A rename that leaves the arguments where they were compiles cleanly into a type meaning
the reverse, and nothing fails until a call site disagrees with it:

```ts
// jest — returns void, takes one AdjustedSubscriptionDetails
let callBack: jest.Mock<void, [AdjustedSubscriptionDetails]>;

// vitest — the same intent, written as the call signature
let callBack: Mock<(details: AdjustedSubscriptionDetails) => void>;
```

The bare `jest.Mock` with no generics is the safe case: `Mock` on its own means the same thing.
:::

For anything this library produced, declare `Spy<T>` rather than `Mocked<T>` —
[`no-mocked-for-spy`](/utilities/eslint-plugin) explains why, and is one of the two rules that fix
themselves.

Put the `vitest` type import in the external-packages group with everything else. Placing it above
the framework imports is tempting, because it is the only line in the file that is not really a
dependency — and `eslint-plugin-import` then has an opinion about every spec in the suite:

```
error  There should be at least one empty line between import groups        import/order
error  `vitest` type import should occur after import of `@angular/router`  import/order
```

### The `jest.*` calls that have no `vi.*` twin

A mechanical `jest.` → `vi.` rename produces calls that do not exist, and the resulting
`TypeError: vi.requireMock is not a function` reads as "the runner broke". These are the ones worth
knowing before the rename, because for each of them the honest answer is a different design, not a
different name.

| Jest                                                    | Vitest                | What to do instead                                                                                                                               |
| ------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `jest.requireMock(id)`                                  | **none**              | provide the double through the TestBed / the container, or pass it as an argument                                                                |
| `jest.requireActual(id)`                                | `vi.importActual(id)` | `await`ed, and only inside a `vi.mock` factory                                                                                                   |
| `jest.fn().mockImplementation(() => o)` used with `new` | **not constructible** | [`mockConstructor` / `stubConstructor`](/utilities/constructor-doubles)                                                                          |
| `jest.spyOn(global, 'Date')`                            | **throws**            | `mockSystemTime(iso)` — fake timers already own `Date`                                                                                           |
| `jest.replaceProperty(obj, key, value)`                 | **none**              | `mockValueProp(obj, key, value)` — and it restores itself                                                                                        |
| `fakeTimers: { enableGlobally: true }`                  | **no setting**        | `setupAutoSpy({ globalFakeTimers: true })`                                                                                                       |
| `jest.mock('some-barrel')`                              | `vi.mock(…)`          | a **silent no-op** once the specs are bundled — the module boundary it would replace no longer exists                                            |
| `jest.spyOn(barrel, 'exported')`                        | **throws**            | `TypeError: Cannot redefine property` — a bundled export is not configurable; [provide a real seam](/utilities/module-mocks#provide-a-real-seam) |
| `jest.fn().mockImplementation()` with no argument       | **requires one**      | `mockImplementation(() => undefined)` — Jest installed the no-op for you                                                                         |
| `xit` / `xdescribe`                                     | **none**              | `it.skip` / `describe.skip`; the rename fails as `TS2304: Cannot find name 'xit'`                                                                |
| `testTimeout: 30000` (one budget)                       | **two fields**        | set `hookTimeout` to the same number — Vitest resolves it separately and defaults it to 10 000 ms                                                |
| `collectCoverageFrom: [...]`                            | `coverage.include`    | and **not** `coverage.all`: the key was removed in Vitest 4, where `include` alone drives the pass over files no test imported                   |

The timeout row is the quietest of them. `jest-circus` spends one `testTimeout` on a hook and on a
test body alike; Vitest resolves `hookTimeout` on its own, so a config that carried the single Jest
number across leaves every hook on 10 000 ms. The failure is then filed against the wrong thing —
a `beforeEach` timeout is attributed to the **test**, with the test's duration pinned at the limit,
so the log reads `× should create 10045ms` and the body it names never ran.
[`setupAutoSpy()`](/utilities/setup) says so on the error; the fix is one line in the config:

```ts
test: {
  testTimeout: 30_000,
  // Jest had one budget for both; Vitest defaults this to 10_000 on its own.
  hookTimeout: 30_000,
}
```

`slowTestThreshold` is the same family and changes only the report: `5` in Jest (**seconds**),
`300` in Vitest (**milliseconds**), so a migrated suite starts marking most of its files slow.

The coverage row changes the report too, in two ways worth expecting. `coverage.all` no longer
exists — a config that carried `all: true` over from Vitest 3 sets nothing, and the report silently
narrows to the files the run imported until `coverage.include` is declared. And Jest instruments
with istanbul while Vitest's default provider is `v8`, which counts every function object the engine
created rather than the ones a source map claims — so the function percentage moves on an unchanged
tree while lines and branches stay put. Re-measure a function-coverage threshold before carrying it
across; do not port the number.

That last row is the one that costs the most, because nothing reports it. Under a bundling test
builder — and under `isolate: false`, where the module may already be in the worker's graph — a
`vi.mock()` of a workspace barrel, of `@angular/core`, or of a relative path either does nothing or
does something only on some runs. If a mock "works in a narrow run and not in a wide one", this is
why: [replace the mock with a real seam](/utilities/module-mocks#provide-a-real-seam) (a provider,
an argument, `vi.hoisted()` for a package that genuinely must be replaced). The row below it is the
same failure with the sound turned up: reaching for `vi.spyOn` on the barrel instead throws
`Cannot redefine property`, and an accessor spy taken through this package re-throws that one
naming the property, the target and the way out.

::: tip Restricting is a separate option
Up to v1 this library read `methodsToSpyOn` as an exhaustive whitelist, which is the opposite of
`jest-auto-spies` and the one thing that made the swap not a swap: a migrated spec listing a couple
of names silently lost every other method, and the failure surfaced as `… is not a function` inside
a constructor, with nothing in the stack pointing at the spec. Since v2 the option is additive, and
the whitelist lives under its own name, `onlyMethodsToSpyOn`.
:::

## Step by step

1. **Install and remove.**

   ```bash
   npm i -D vitest-auto-spy
   npm rm jest-auto-spies   # or @bugsplat/vitest-auto-spies
   ```

2. **Let the [codemod](/utilities/codemod) do the mechanical steps below**, and report the spans
   where it would have to guess. It is a dry run by default — the first command prints a diff and
   writes nothing:

   ```bash
   npx vitest-auto-spy codemod            # read the diff
   npx vitest-auto-spy codemod --write    # apply it
   npx vitest-auto-spy codemod --verify   # then check the result, not the diff
   ```

   Seven transforms: the import split below, `TestBed.inject(X) as Spy<X>` → `asSpy<X>(…)`,
   `@jest/globals` → `vitest`, the `jest.*` members that have a `vi.*` twin, the `jest.Mock<R, [A]>`
   transposition [the type-names section](#the-type-names) is about, the jasmine aliases, and
   `mockImplementation()` with no argument. Everything in
   [the table above that has no twin](#the-jest-calls-that-have-no-vi-twin) is left exactly as it
   was and named with a `path:line`, which is why the run exits 1 while having done its job — the
   remaining rows are decisions, not renames.

   The steps below are what the codemod does and what it hands back to you; read them either way,
   because the report references them.

3. **Rewrite the imports.** The core keeps its name; the Angular helpers and the observable layer
   moved behind subpaths.

   ```diff
   - import { createSpyFromClass, provideAutoSpy } from 'jest-auto-spies';
   + import { createSpyFromClass } from 'vitest-auto-spy';
   + import { provideAutoSpy } from 'vitest-auto-spy/angular';
   ```

   Which name goes behind which subpath is not written into the codemod — it is read at run time
   off the `exports` map of the `vitest-auto-spy` you just installed, and
   `npx vitest-auto-spy codemod --list` prints the whole table.

4. **Add the rxjs import once** — in the setup file, not per spec — if any spy uses `nextWith`,
   `nextWithValues` or `observablePropsToSpyOn`:

   ```ts
   // vitest.setup.ts
   import 'vitest-auto-spy/rxjs';
   ```

   Skipping this does not fail silently: the first observable helper throws a message naming this
   exact import.

5. **Pick the entry that matches your runner.** `vitest-auto-spy` registers Vitest's adapter,
   `/bun` registers `bun:test`'s, `/node` registers `node:test`'s. One per run.

6. **Type the variables as `Spy<T>`.** If a spec declared `let service: MyService = createSpyFromClass(...)`,
   it will now fail to compile when the class has `#private` or `private` members — `Spy<T>` is a
   mapped type and drops them. `let service: Spy<MyService>` is the fix, or
   [`asInstance` / `asSpy`](/core/spy-typing) where the spy must be handed to something typed as the
   class.

7. **Run the suite.** Nothing else in the API changed, so what fails now is real.

8. **Optional, but worth it once green:**
   [`setupAutoSpy()`](/utilities/setup) in the setup file, and the
   [ESLint rules](/utilities/eslint-plugin) that steer the suite onto the newer helpers.

## Per-runner gotchas

**Vitest.** Nothing beyond the import swap. If the suite runs with `isolate: false` or a shared
environment, add `setupAutoSpy()` — Jest isolated every file, and a `mock*Prop` patch that was
harmless there now outlives its spec.

**`vi.fn(() => x)` is not `mockReturnValue(x)`.** The one rename in a migration that looks safest
and is not equivalent. A factory reads `x` when the double is **called**; `mockReturnValue` freezes
the value `x` had when the double was **configured**. Nothing tells them apart until the test
reassigns `x` — and the commonest reason to do that is a fresh `Subject` after the previous one was
`error()`ed or completed, which is precisely what a suite is exercising when it reassigns:

```ts
let source$ = new Subject<Page>();

const api = createSpyFromClass(Api);

api.load.mockReturnValue(source$); // ❌ pinned to the subject that existed on this line
api.load.mockImplementation(() => source$); // ✅ re-read on every call

source$.error(new Error('boom'));
source$ = new Subject<Page>(); // the double still hands out the dead one, above
```

In one spec that meant the service received a completed subject and silently skipped the modal it
was meant to show, with the test green throughout. Carry `vi.fn(() => x)` over as
`mockImplementation(() => x)` and keep `mockReturnValue` for a literal — and if you are writing a
codemod, this is the rewrite to special-case.

**Bun (`bun:test`).** `mockReset()` on Bun also drops the implementation (Vitest keeps the spy) —
the adapter restores it, so auto-spies are unaffected, but a hand-rolled `mock()` in the same spec
will behave differently. `spyOn` refuses accessor properties on Bun; the accessor spies here go
through property redefinition and work anyway. Angular suites need
[`vitest-auto-spy/bun-angular`](/runtimes/bun-angular).

**`node:test`.** There is no `expect` — pair it with `node:assert`. And `spy.method.mockReturnValue`
is a _native_ Vitest/Bun method that `node:test` does not have; the normalised
`spy.method.calledWith(...).mockReturnValue(...)` works everywhere. Recorded calls read as
`mock.calls[0].arguments`, not `mock.calls[0]`. See [node:test](/runtimes/node).

**Angular.** `provideAutoSpy` defaults to **lazy** spies here (`jest-auto-spies` was always eager).
Behaviour is identical; if you depend on every spy existing before first access, pass
`{ lazySpies: false }`.

## What you gain by moving

Beyond the runner swap, everything the old API did not have:
[`createAutoMock` / `mockDeep` / `createMock`](/core/auto-mock-by-type),
[`renderShallow` and `createWithAutoSpies`](/adapters/angular),
[observable assertions](/core/observable-assertions),
[fake timers that settle](/utilities/fake-timers),
[console spies](/utilities/console), [five ESLint rules](/utilities/eslint-plugin),
Bun and `node:test` support — and [Angular's `TestBed` under `bun test`](/runtimes/bun-angular).

## Did the migration lose a test?

```ts
import { compareTestRuns, formatTestRunComparison } from 'vitest-auto-spy';

const diff = compareTestRuns(JSON.parse(before), JSON.parse(after), '/my-repo/');

expect(diff.missing).toEqual([]);
process.stdout.write(formatTestRunComparison(diff));
```

Counters do not answer this. Under `isolate: false` a file can lose a whole suite — an exported spec
file imported by its neighbour loses its own `describe` — and, in the same run, a flaky test
elsewhere can start passing. The totals match, the run looks identical, and a suite is silently gone.

The question is about **which** tests ran, so the answer is the symmetric difference of two sets of
`file::full name`. Both runners write the same JSON shape (`--reporter=json`), so the baseline may
come from Jest and the current run from Vitest; the optional third argument cuts everything above a
shared path root, so a report from CI compares against one from a laptop.

A renamed test appears in both `missing` and `added` — which is the honest answer, since from the
outside a rename and a delete-plus-add are the same event.

::: tip What this actually caught
On the migration this comes from, the comparison after seven agents' worth of edits showed exactly
one test gone — it asserted on a config key that had been deleted six months earlier in an unrelated
commit — and nothing else lost silently. That is the only way that sentence could have been said.
:::

## A codemod that edits globs is verified by matching, not by diffing

The natural check on a codemod is "did the file change the way I meant?". For a codemod that rewrites
**globs** that check passes while the result is broken, because an empty `include` is a legal
`tsconfig.json` and TypeScript says nothing about it.

This is not hypothetical. A migration codemod removing `jest.config.ts` from `include` used a greedy
pattern that also ate `/**/*`, so `src/**/*.spec.ts` became `src*.spec.ts` — syntactically valid, and
matching no file. Of 152 spec tsconfigs, **nine** still covered their specs. Nothing failed:
`tsc --noEmit` reported zero errors because there was nothing to check, and the only person who found
out was one who opened a spec in an editor and saw `Cannot find name 'vi'`.

So the check is: **does the resulting pattern match at least one file that exists?** And print the
resulting `include` in full rather than a count — "fixed: 152" hides the case where the replacement
produced two different wrong shapes, which is what happened on the first attempt at the repair.

[`npx vitest-auto-spy codemod --verify`](/utilities/codemod#verifying-by-matching-not-by-diffing) is
that check, built into the codemod above. Each of its seven transforms declares the pattern it is
supposed to have removed; `--verify` transforms nothing and matches those patterns against the
**result**, naming every survivor with a `file:line`. Two consequences fall out of matching rather
than diffing, and neither is available to a check built on the diff: it answers the same way on a
file this tool never touched — one migrated by hand, one a `--skip` excluded — so it belongs in CI
on a suite that is already migrated; and it catches the case where the diff is exactly right and the
file still says `jest.`, because the transform declined to enter a template literal or could not
reach past an unbalanced bracket. And the run report prints the resulting **import statements in
full** rather than "6 edits", for the same reason this section gives about `include`.
