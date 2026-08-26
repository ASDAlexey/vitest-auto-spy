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

| jest-auto-spies | vitest-auto-spy | Status |
| --- | --- | --- |
| `createSpyFromClass` | `createSpyFromClass` | ✅ identical |
| `provideAutoSpy` | `provideAutoSpy` (from `/angular`) | ✅ identical |
| `calledWith` / `mustBeCalledWith` | same | ✅ identical |
| `calledWith(...).returnValue(v)` | same — `.returnValue` **and** `.mockReturnValue` both work | ✅ identical |
| `resolveWith` / `rejectWith` / `resolveWithPerCall` | same | ✅ identical |
| `nextWith` / `nextOneTimeWith` / `nextWithValues` / `nextWithPerCall` | same | ✅ identical |
| `throwWith` / `complete` / `returnSubject` | same | ✅ identical |
| `accessorSpies.getters/setters` | same | ✅ identical |
| `createObservableWithValues` | same (from `/rxjs`) | ✅ identical |
| underlying mock | `jest.fn()` → `vi.fn()` | 🔁 swapped |

Just make sure your tests run under Vitest (or Bun / `node:test` via the matching entry), and — for
Angular — that `TestBed` is set up.

## Step by step

1. **Install and remove.**

   ```bash
   npm i -D vitest-auto-spy
   npm rm jest-auto-spies   # or @bugsplat/vitest-auto-spies
   ```

2. **Rewrite the imports.** The core keeps its name; the Angular helpers and the observable layer
   moved behind subpaths.

   ```diff
   - import { createSpyFromClass, provideAutoSpy } from 'jest-auto-spies';
   + import { createSpyFromClass } from 'vitest-auto-spy';
   + import { provideAutoSpy } from 'vitest-auto-spy/angular';
   ```

3. **Add the rxjs import once** — in the setup file, not per spec — if any spy uses `nextWith`,
   `nextWithValues` or `observablePropsToSpyOn`:

   ```ts
   // vitest.setup.ts
   import 'vitest-auto-spy/rxjs';
   ```

   Skipping this does not fail silently: the first observable helper throws a message naming this
   exact import.

4. **Pick the entry that matches your runner.** `vitest-auto-spy` registers Vitest's adapter,
   `/bun` registers `bun:test`'s, `/node` registers `node:test`'s. One per run.

5. **Type the variables as `Spy<T>`.** If a spec declared `let service: MyService = createSpyFromClass(...)`,
   it will now fail to compile when the class has `#private` or `private` members — `Spy<T>` is a
   mapped type and drops them. `let service: Spy<MyService>` is the fix, or
   [`asInstance` / `asSpy`](/core/spy-typing) where the spy must be handed to something typed as the
   class.

6. **Run the suite.** Nothing else in the API changed, so what fails now is real.

7. **Optional, but worth it once green:**
   [`setupAutoSpy()`](/utilities/setup) in the setup file, and the
   [ESLint rules](/utilities/eslint-plugin) that steer the suite onto the newer helpers.

## Per-runner gotchas

**Vitest.** Nothing beyond the import swap. If the suite runs with `isolate: false` or a shared
environment, add `setupAutoSpy()` — Jest isolated every file, and a `mock*Prop` patch that was
harmless there now outlives its spec.

**Bun (`bun:test`).** `mockReset()` on Bun also drops the implementation (Vitest keeps the spy) —
the adapter restores it, so auto-spies are unaffected, but a hand-rolled `mock()` in the same spec
will behave differently. `spyOn` refuses accessor properties on Bun; the accessor spies here go
through property redefinition and work anyway. Angular suites need
[`vitest-auto-spy/bun-angular`](/runtimes/bun-angular).

**`node:test`.** There is no `expect` — pair it with `node:assert`. And `spy.method.mockReturnValue`
is a *native* Vitest/Bun method that `node:test` does not have; the normalised
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
