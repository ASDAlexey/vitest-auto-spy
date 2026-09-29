---
title: The codemod — npx vitest-auto-spy codemod
description: Migrate a test suite off jest-auto-spies and Jest, or off jasmine-auto-spies and jasmine. The codemod rewrites what it can decide safely, leaves the rest as it was, and lists every place left for you. It previews by default, writes with --write, and --verify fails CI when leftovers come back.
---

# The codemod

`codemod` migrates a test suite off `jest-auto-spies` and Jest, or off `jasmine-auto-spies` and
jasmine, to Vitest and this library. It rewrites what it can decide safely, leaves everything else
exactly as it was, and lists each place you still need to rewrite by hand.

```bash
npx vitest-auto-spy codemod            # preview: print the diff, write nothing
npx vitest-auto-spy codemod --write    # apply it
npx vitest-auto-spy codemod --verify   # check that nothing is left to migrate
```

Why not a find-and-replace? Because several plain renames compile and do the opposite of what you
meant:

- `jest.Mock<void, [Order]>` → `Mock<void, [Order]>` compiles but means the reverse: Jest puts the
  return type first, Vitest the arguments.
- `jest.requireMock` renamed to `vi.requireMock` fails with `TypeError: vi.requireMock is not a
function`.
- jasmine's `spyOn(o, 'm')` renamed to `vi.spyOn(o, 'm')` starts calling the real method: jasmine stubs
  it, Vitest calls through.
- Moving every `jest-auto-spies` import to the root `vitest-auto-spy` breaks `provideAutoSpy`: the
  root entry point does not export it.

The step-by-step migration guide is [Migrating from jest-auto-spies](/migrating); for jasmine, see
[Migrating from jasmine-auto-spies](/migrating-jasmine).

## Migrate a suite

1. **Preview.** Run `npx vitest-auto-spy codemod` and read the diff. Nothing is written.
2. **Apply.** Run it again with `--write`.
3. **Fix what it left.** Each `error` and `warn` in the report names a `path:line` and says what to do.
4. **Verify.** `npx vitest-auto-spy codemod --verify` exits 0 with `Nothing left to migrate.` once
   everything is done. Keep it in CI.
5. **Check what the migration left behind.** [`npx vitest-auto-spy doctor`](/utilities/cli) reports a
   `tsconfig` include pattern the edit broke, a `jest.config.ts` for a runner that is gone, and setup
   files only that config used.

**One directory at a time.** Pass the directory to each command:

```bash
npx vitest-auto-spy codemod src/app            # preview
npx vitest-auto-spy codemod src/app --write    # apply
npx vitest-auto-spy codemod src/app --verify   # check
```

With a path, the codemod visits every source file under it, not only specs, so a `jest.` in
application code there is rewritten too.

### Read the report

```
$ npx vitest-auto-spy codemod
vitest-auto-spy codemod — /work/app
Dry run — nothing is written. Re-run with --write to apply.


src/app/service.spec.ts
  auto-spies-import         1 edit
  inject-cast               1 edit
  jest-namespace            2 edits
  jest-types                1 edit
  mock-implementation-arity 1 edit
    import { createSpyFromClass, Spy, asSpy } from 'vitest-auto-spy';
    import { provideAutoSpy } from 'vitest-auto-spy/angular';
    import type { Mock } from 'vitest';

--- a/src/app/service.spec.ts
+++ b/src/app/service.spec.ts
@@ -1,16 +1,18 @@
-import { createSpyFromClass, provideAutoSpy, Spy } from 'jest-auto-spies';
+import { createSpyFromClass, Spy, asSpy } from 'vitest-auto-spy';
+import { provideAutoSpy } from 'vitest-auto-spy/angular';
+import type { Mock } from 'vitest';

 import { Service } from './service';

 describe('Service', () => {
   let service: Spy<Service>;
-  let hook: jest.Mock<void, [Service]>;
+  let hook: Mock<(arg0: Service) => void>;

   beforeEach(() => {
-    service = TestBed.inject(Service) as Spy<Service>;
-    jest.spyOn(service, 'load').mockImplementation();
+    service = asSpy<Service>(TestBed.inject(Service));
+    vi.spyOn(service, 'load').mockImplementation(() => undefined);
     jest.requireActual('./service');
-    hook = jest.fn();
+    hook = vi.fn();
   });
 });

1 file would change, 6 edits

error  residue/jest-namespace src/app/service.spec.ts:12
       Still matches after the run: "jest."
       → `jest-namespace` declined it: `jest.requireActual` was left alone. Rewrite it by hand.
       Docs: https://asdalexey.github.io/vitest-auto-spy/utilities/codemod#verifying-by-matching-not-by-diffing

warn   no-vi-twin src/app/service.spec.ts:12
       `jest.requireActual` was left alone.
       → `vi.importActual(id)` is asynchronous and only legal inside a `vi.mock` factory; rewriting
         it changes control flow.

1 error, 1 warning, 0 notes
```

For each changed file the report shows:

1. **The edits per transform** — how many times each transform fired.
2. **The resulting import statements, in full.** Check these first: they show which entry point each
   name now comes from.
3. **The diff.**

Then come the findings. One line can get two: the `error` says the work is not done, the `warn` says
why the codemod did not do it. Fix the line itself. A **residue** is text a migration should have removed: `jest.`,
`from 'jest-auto-spies'`, `as Spy<`. Here one line, `jest.requireActual`, was left alone, so the run exits **1**:
you still have work to do. Nothing about the six edits failed.

A residue error that quotes a transform ("`jest-namespace` declined it") was left on purpose; the
reason follows. A residue with no such note sits where no transform could reach: inside a template
literal, or after brackets that do not balance.

| Exit | When                                                                                                                              |
| ---- | --------------------------------------------------------------------------------------------------------------------------------- |
| `0`  | Everything was rewritten, and no residue is left                                                                                  |
| `1`  | Something was left for you to rewrite, or a residue is still there — including under `--verify`                                   |
| `2`  | Nothing ran: an unknown transform id on `--only` / `--skip`, an unknown flag, `--format markdown`, or a path that matches no file |

### Which files it visits

- **With no path**, every `*.spec.*` and `*.test.*` file in the repository, JavaScript included. A
  `jest.` in `main.ts` is application code, not a test, so a run without a path leaves it alone.
- **With a path**, every source file under it, except declaration files.
- **A file that matches none of the selected transforms** is not read into the report, so the output
  lists only files with something to say.
- **A path that matches no file** is an error, exit 2, and nothing is read. A typo in a CI line must
  not look like a clean result. Paths are resolved against `--cwd`, so an absolute path, a `./`
  prefix, a trailing slash and a Windows separator all work, and `.` is the repository root.

## Pick the dialect with `--from`

```bash
npx vitest-auto-spy codemod --from jasmine   # or jasmine-auto-spies
npx vitest-auto-spy codemod --from jest-auto-spies
npx vitest-auto-spy codemod                  # --from auto, the default
```

`auto` reads each file and decides. A file with a `jasmine.` member, a `.and.`, an import of
`jasmine-auto-spies` or an import of `vitest-auto-spy/jasmine` gets the jasmine transforms; other files
do not. The four shared transforms always run.

**If your jasmine suite only uses `spyOn`, pass `--from jasmine`.** A bare `spyOn(` is not a jasmine
marker: both dialects spell it the same way and give it opposite defaults (jasmine stubs, Vitest calls
through). Guessing would bring back the exact behaviour change `jasmine-spy-on` exists to prevent.

An unknown value is an error that lists the accepted ones, never a silent fallback.

## The thirteen transforms

Each transform has an id you can pass to `--only` or `--skip`. All of them read the same untouched
source before anything is applied, so `--skip` removes one transform's edits and nothing else.

**Four are shared**, because both dialects have the construct:

| Id                          | Rewrites                                                                                            | Leaves alone                                                      |
| --------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `auto-spies-import`         | `import … from 'jest-auto-spies'` / `'jasmine-auto-spies'` → the entry points that export each name | A default or namespace import; a name no entry exports            |
| `inject-cast`               | `TestBed.inject(X) as Spy<X>` → `asSpy<X>(TestBed.inject(X))`, adding the import                    | `as Spy<T>` over anything else                                    |
| `jasmine-aliases`           | `xit` / `xdescribe` / `fit` / `fdescribe` / `xtest` → `it.skip` / `describe.skip` / …               | A name that is not a call — `shape.fit(box)`, `function fit(…) {` |
| `mock-implementation-arity` | `mockImplementation()` with no argument → `mockImplementation(() => undefined)`                     | A call that already has its function                              |

**Three are Jest's:**

| Id                    | Rewrites                                                                                | Leaves alone                                                                                                |
| --------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `jest-globals-import` | `from '@jest/globals'` → `from 'vitest'`, renaming the `jest` binding to `vi`           | The rest of the clause — `describe` / `it` / `expect` are named the same                                    |
| `jest-namespace`      | `jest.<member>` → `vi.<member>` for the 26 members that have a twin                     | A member with no twin, and any member it does not know                                                      |
| `jest-types`          | `jest.Mock<R, [A]>` → `Mock<(a: A) => R>`, plus four renames, importing the Vitest name | A type argument list it cannot split at the top level; a `jest` from `@jest/globals`, which is renamed only |

**Six are jasmine's.** [Migrating from jasmine-auto-spies](/migrating-jasmine) explains what each one
protects:

| Id                    | Rewrites                                                                                                                                     | Leaves alone                                                                                                                 |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `jasmine-and-helpers` | `spy.load.and.nextWith(v)` → `spy.load.nextWith(v)` — the ten auto-spies helpers lose the namespace                                          | Nothing; the list is closed                                                                                                  |
| `jasmine-strategies`  | `.and.returnValue` / `callFake` / `stub` / `throwError` / `returnValues` / `resolveTo` → the `mock*` twin, and `.withArgs(` → `.calledWith(` | `.and.callThrough()`, which has no original to call through to; a strategy it does not know; `.withArgs(` on a `spyOn` chain |
| `jasmine-spy-on`      | `spyOn(o, 'm')` → `vi.spyOn(o, 'm').mockImplementation(() => undefined)`, and `spyOnProperty(o, 'p')` gains the `'get'` jasmine defaulted to | A call that already chains a strategy — there the stub would be redundant — and one that continues into `.withArgs(`         |
| `jasmine-globals`     | `jasmine.createSpy` / `createSpyObj` / `any` / `clock()` / `addMatchers` → their `vi`, `expect` and `vitest-auto-spy` twins                  | `getEnv`, `truthy` / `falsy` / `empty` / `notEmpty`, `DEFAULT_TIMEOUT_INTERVAL`, the spy strategies                          |
| `jasmine-types`       | `jasmine.Spy` → `Mock` from `vitest`, `jasmine.SpyObj<T>` → `Spy<T>` from this package                                                       | Either name when the entry table could not be generated                                                                      |
| `jasmine-matchers`    | `toBeTrue` / `toBeFalse` / `toHaveSize` / `toHaveBeenCalledOnceWith` / `withContext` / `fail` → their Vitest spellings                       | A `fail` that is not a call; a `withContext` on an `expect()` with nothing in it                                             |

`auto-spies-import` runs first: it creates the `vitest-auto-spy` import that `inject-cast` then adds
`asSpy` to. The order of the rest does not matter.

A few rewrites are worth knowing:

- `jest.dontMock` becomes `vi.doUnmock`, and `jest.SpyInstance` becomes `MockInstance`.
- A `vi.mock()` of a **relative** path is renamed and then warned about. Under a test builder that
  bundles your code, such as `@angular/build:unit-test`, that module no longer exists on its own, so
  the mock silently does nothing. Instead, [provide a real seam](/utilities/module-mocks#provide-a-real-seam): pass the double explicitly, through DI or an argument.
- jasmine's `.and.throwError(x)` turns any string into an `Error`. So a variable becomes
  `throw typeof x === 'string' ? new Error(x) : x`, not a bare `throw x`; otherwise a `toThrow(Error)`
  next to it would fail. A string literal becomes a plain `new Error('…')`. An argument that the guard
  would have to evaluate twice is left alone.
- `jest.Mock<R, [A]>` is rebuilt, not renamed: see
  [The trap: Jest puts the return type first](#the-trap-jest-puts-the-return-type-first).

## Warnings a rewrite can raise

Besides the spans it leaves alone, the codemod warns where a rewrite it did apply needs a second look:

| Check                   | What it means and what to do                                                                                                                                                                                                                                                                                      |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `overlapping-edit`      | Two rewrites claimed the same span. The rewrite the warning names was not applied and is not counted in the edit totals; the other is in the diff. Check the line by hand                                                                                                                                         |
| `name-declared-locally` | The rewrite needs a name — `asSpy`, `Mock`, … — that the file declares itself (`const`, `let`, `var`, `function`, `class`, `enum`, `interface`, `type`, `namespace`), so no import was added. Rename the local binding and import the library's. A destructured binding is not recognised, so check those by hand |
| `fake-timers-option`    | `vi.useFakeTimers` got a Jest-only option, which it ignores silently. One warning per option, naming the Vitest equivalent: `advanceTimers` → `shouldAdvanceTime` (with `advanceTimeDelta` for a number), `doNotFake` → `toFake` with the inverse list, `legacyFakeTimers` → nothing, `timerLimit` → `loopLimit`  |
| `vi-without-globals`    | The file uses `vi` without importing it, and the Vitest config does not set `test.globals: true`, so the suite throws `ReferenceError: vi is not defined`. Import `vi`, `describe`, `it` and `expect` from `vitest`, or turn `globals` on                                                                         |

`vi-without-globals` is a note, not an added `import { vi }`: with globals off, `describe`, `it` and
`expect` are missing too, and importing only `vi` would still leave the suite broken. `globals` is read
from every `vitest.config.*`, `vite.config.*` and `vitest.workspace.*` the scan finds. An `angular.json`
with `@angular/build:unit-test` counts as on (the builder turns globals on), and other runners are not
judged.

## What it deliberately leaves alone

The spans below have an obvious rewrite that compiles but is wrong. So the codemod leaves them as they
are and prints each one with the reason and a `path:line` your editor can jump to.

| Left alone                                                                      | Why, and what to write instead                                                                                                                                                  |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `jest.requireActual(id)`                                                        | `vi.importActual(id)` is asynchronous and only allowed inside a `vi.mock` factory. Rewrite it by hand, as shown below the table                                                 |
| `jest.requireMock(id)`, `jest.setMock(…)`                                       | There is no `vi` twin. Provide the double through the TestBed or the DI container, or pass it as an argument                                                                    |
| `jest.replaceProperty(o, k, v)`                                                 | Use `mockValueProp(o, k, v)` from this package: a different helper with its own restore                                                                                         |
| `jest.setTimeout(n)`                                                            | Use the `testTimeout` config option or `vi.setConfig({ testTimeout: n })`                                                                                                       |
| `enableAutomock`, `createMockFromModule`, `now`, `retryTimes`, `runAllTicks`, … | No `vi` member of that name exists, and each needs a different approach. Rewrite it by hand                                                                                     |
| Any **unknown** `jest.<member>`                                                 | Not renamed: the codemod does not assume `vi` has the same member. That assumption is how `vi.requireMock is not a function` happens                                            |
| `as Spy<T>` over anything but `TestBed.inject(...)`                             | If the value really is a spy, use `asSpy(...)`; if it is a hand-built double, [`createAutoMock<T>()`](/core/auto-mock-by-type) builds it                                        |
| A default or namespace import of the legacy package                             | The helpers live behind different entry points, and one namespace cannot cover them all                                                                                         |
| Anything inside a template literal                                              | Patterns are matched against a [masked view](#how-a-pattern-never-matches-a-comment) where a template literal is blank                                                          |
| Any span whose brackets do not balance                                          | The end of the expression is unknown; guessing it can make a rewrite take only half a type                                                                                      |
| `.withArgs(…)` on a `spyOn(…)` chain                                            | `vi.spyOn` has no `calledWith`, so the rename fails with `calledWith is not a function`. Reported as `jasmine-with-args-on-spy-on`; the `spyOn` under it is left as written too |
| `.and.throwError(build())`                                                      | The rewritten code contains the argument twice, which would run the expression twice. Fine for `err` or `state.err`. Declined with `unknown-jasmine-strategy`                   |
| `expect()` with nothing in it                                                   | There is no subject for a `withContext` message to move next to                                                                                                                 |
| `fail`, `fit`, `xit` and their siblings where they are not calls                | A method or function of the same name, which a rename would turn into a syntax error. `--verify` does not report a declaration either                                           |

**Rewriting `jest.requireActual` by hand.** If it builds a partial mock, move it into the `vi.mock`
factory and await it. If the spec only needs the real module, import it normally.

```ts
// before: jest.mock('./x', () => ({ ...jest.requireActual('./x'), load: jest.fn() }));
vi.mock('./x', async () => ({ ...(await vi.importActual<typeof import('./x')>('./x')), load: vi.fn() }));
```

## Verifying by matching, not by diffing

`--verify` checks the files for what a migration should have removed, and reports every match with
`file:line`. If the codemod pointed you here, open that line and rewrite what the message quotes by
hand. The message says which transform declined it and why.

```
$ npx vitest-auto-spy codemod --verify
vitest-auto-spy codemod — /work/app
1 files matched against 7 transform patterns.

error  residue/auto-spies-import src/app/service.spec.ts:1
       Still matches after the run: "from 'jest-auto-spies'"
       → `auto-spies-import` did not rewrite this. Rewrite it by hand.
       Docs: https://asdalexey.github.io/vitest-auto-spy/utilities/codemod#verifying-by-matching-not-by-diffing

error  residue/inject-cast src/app/service.spec.ts:10
       Still matches after the run: "as Spy<"
       → `inject-cast` did not rewrite this. Rewrite it by hand.
       Docs: https://asdalexey.github.io/vitest-auto-spy/utilities/codemod#verifying-by-matching-not-by-diffing

error  residue/jest-types src/app/service.spec.ts:7
       Still matches after the run: "jest.Mock"
       → `jest-types` did not rewrite this. Rewrite it by hand.
       Docs: https://asdalexey.github.io/vitest-auto-spy/utilities/codemod#verifying-by-matching-not-by-diffing
```

Each transform declares a residue pattern: what it is supposed to remove. `--verify` transforms nothing
and only matches those patterns. The line under the output header counts the patterns of the transforms selected for this
suite — above, the four shared ones and the three Jest ones. Matching gives it two properties a check on the diff lacks:

- **It works on files the codemod never touched**: a spec migrated by hand, a spec someone else
  edited, a span `--skip` excluded. On a migrated repository it exits 0 with `Nothing left to
migrate.`, and 1 as soon as a `jest.` comes back, so it is safe to keep in CI.
- **It catches a diff that looks right but is not done.** The transforms cannot reach inside a template
  literal or past brackets that do not balance. The rest of the diff is right, yet the file still
  contains `jest.`.

This is the check the [migration guide's closing note](/migrating#a-codemod-that-edits-globs-is-verified-by-matching-not-by-diffing)
recommends: "did the file change the way I meant?" can pass while the result is broken, so match the
**result** against what should be gone. For the same reason the dry-run report prints the resulting
import statements in full, not a count.

## Flags

| Flag           | What it does                                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| _(none)_       | Dry run. Print the diff, the edits per transform, the resulting imports and the report. Write nothing                                 |
| `--write`      | Apply the edits, each file through a temporary file and a rename. Spans that were left alone are still left alone, and still reported |
| `--verify`     | Transform nothing; match the files against the residue patterns. Exit 1 if anything matched                                           |
| `--from <pkg>` | Which dialect this suite is: `jest-auto-spies`, `jasmine-auto-spies` (alias `jasmine`), or `auto` (default)                           |
| `--only <ids>` | Run only these transforms, comma-separated                                                                                            |
| `--skip <ids>` | Run everything except these                                                                                                           |
| `--list`       | Print the transforms and the generated entry-point table, and exit 0                                                                  |
| `--cwd <dir>`  | Run against another directory instead of the current one                                                                              |
| `--format <f>` | `text` (default) or `json`: one JSON document on stdout instead of the text report                                                    |

An id `--only` or `--skip` does not know exits **2** and lists the known ids, rather than running
everything. A flag this table does not have exits **2** too, before anything is read, and suggests the
flag you most likely meant: `codemod --wirte` must not look like a dry run that happened to write
nothing.

`--list` shows what a run would do, without doing it. A transform the run would skip is marked `-` in
the left column, so `--list --skip jest-types` answers "what exactly am I about to run". It also prints
the [entry-point table](#the-entry-point-table-is-generated-not-written-down):

```
$ npx vitest-auto-spy codemod --list
Transforms
    auto-spies-import         import … from 'jest-auto-spies' → the vitest-auto-spy entry points that export each name.
    inject-cast               TestBed.inject(X) as Spy<X> → asSpy<X>(TestBed.inject(X)), adding the import.
    …

Entry-point table (/work/app/node_modules/vitest-auto-spy)
  createSpyFromClass            vitest-auto-spy, vitest-auto-spy/bun, vitest-auto-spy/bun-angular, vitest-auto-spy/node, …
  injectSpy                     vitest-auto-spy/bun-angular, vitest-auto-spy/angular, vitest-auto-spy/nestjs
  provideAutoSpy                vitest-auto-spy/bun-angular, vitest-auto-spy/angular, vitest-auto-spy/nestjs, vitest-auto-spy/vue
  renderShallow                 vitest-auto-spy/bun-angular, vitest-auto-spy/angular
```

### `--format json` for CI

`--format json` prints one JSON document instead of the text report, for a CI step to read:

```bash
npx vitest-auto-spy codemod --verify --format json > codemod.json
```

- **A run**: `schema`, `command`, `version`, `cwd`, `run` (`dry-run`, `write` or `verify`),
  `exitCode`, `tally`, `findings`, and `files` — each with `file`, `changed`, `edits`, `fired` (edits
  per transform), the resulting `imports` and the unified `diff`.
- **With `--list`**: the transforms (`id`, `family`, `summary`, `selected`) and the entry-point table
  (`entries`).

The exit code is the same as the text run's. `--format markdown`, which `doctor` and `perf` take, is
refused with exit 2.

### When the scan hits its cap

The file scan stops at 50 000 files. Past that the codemod says so on stderr rather than calling the
repository migrated:

```
The repository scan stopped at its safety cap of 50000 files — part of the tree was never looked at,
so a clean result here is not a migrated repository. Raise the cap with VITEST_AUTO_SPY_SCAN_CAP, or
pass the directories to migrate as arguments: `npx vitest-auto-spy codemod src/app`.
```

Passing the directories to migrate is usually the better answer: the transforms are the slow part,
not the scan. To raise the cap:

```bash
VITEST_AUTO_SPY_SCAN_CAP=200000 npx vitest-auto-spy codemod --verify
```

The scan does not enter a directory that is a repository of its own — a git worktree (whose `.git` is
a file) or a nested clone. Those files belong to another branch, and `--write` must not rewrite them.

## In CI

```yaml
- run: npx vitest-auto-spy codemod --verify
```

While you migrate one directory at a time, check only the finished ones:
`npx vitest-auto-spy codemod src/app --verify`.

One line, no network, no config, no token. On a migrated repository it passes and changes nothing. It
fails when a `jest.`, a legacy import or an `as Spy<…>` cast comes back, which in a large suite happens.

## In depth

### The trap: Jest puts the return type first

```diff
- let hook: jest.Mock<void, [Order]>;
+ let hook: Mock<(arg0: Order) => void>;
```

Jest's first type argument is the **return type** and its second is the **argument tuple**. Vitest's
single type argument is a **call signature**. A rename that keeps the type arguments in place compiles
into the reverse meaning, and nothing fails until a call site disagrees, somewhere else, later.

So `jest-types` rebuilds the type instead of renaming it:

- **`=>` is skipped as a unit** when matching brackets. Otherwise `jest.Mock<() => void, []>` would
  "close" at the arrow's `>` and the rewrite would take half the type.
- **Tuple elements keep their labels, optionality and rest.** `[id: number, force?: boolean,
...rest: string[]]` becomes `(id: number, force?: boolean, ...rest: string[])`. An unlabelled element
  is named `arg0`, `arg1`: a function type must name its parameters.
- **Anything that is not a tuple literal is spread.** `jest.Mock<void, Args>` becomes
  `Mock<(...args: Args) => void>`, which is correct for any `Args`.
- **Three or more type arguments, or an unbalanced `<`…`>`, produce a `jest-mock-type-arguments` note
  and no edit.** The line stays byte for byte as it was. Rewrite it by hand in the form above.

`jest.Mock` with no type arguments becomes plain `Mock`: it means the same on both sides.

**A file that imports `jest` from `@jest/globals` keeps its type arguments.** That `jest` comes from
`jest-mock` 29 or newer, where `jest.Mock` already takes a function type (`jest.Mock<() => string>`),
the same as Vitest. So only the name changes. Reordering it would produce `Mock<() => () => string>`, a
mock that returns a function.

**Type arguments on a call are reported, not rewritten.** `jest.fn<R, [A]>()` and `jest.spyOn<…>()` in
the `@types/jest` spelling also put the return type first. `jest-namespace`
renames the callee to `vi.fn` / `vi.spyOn`, where the single type argument is a call signature, so
`jest-mock-type-arguments` names the list and leaves it for you — again only in a file whose `jest` is
not from `@jest/globals`.

### The entry-point table is generated, not written down

The codemod reports three notes from this section:

- `ambiguous-entry-point` (warning): several entries export the name and nothing in the file says
  which one it wants. The codemod picked the common one and lists the others. If this spec needs one
  of those, change the specifier by hand: each entry registers the mock adapter (the link to your runner's
  `vi.fn()` or `mock()`) for its own runner, so the wrong one breaks every spy.
- `unmapped-legacy-export` (error): no entry of the installed package exports the name. The import
  stays on the legacy package; see the [mapping table](/migrating#mapping-table) for its replacement.
- `no-entry-table` (error): the table could not be built, so nothing was placed. Install
  `vitest-auto-spy` in the repository (`npm i -D vitest-auto-spy`) and run again.

To split `import { createSpyFromClass, provideAutoSpy, Spy } from 'jest-auto-spies'`, the codemod must
know which entry point exports which name. A table typed into the codemod would be right for one
version and wrong for the one you installed. So it builds the table at run time:

1. **It finds the installed `vitest-auto-spy`**, walking `node_modules` up to six directories from the
   working directory (enough for hoisted workspaces), and falling back to the copy the CLI runs from.
2. **It reads that package's `exports` map** and resolves each entry to a file, preferring the `types`
   condition: a declaration file lists the type-only exports a runtime bundle cannot. A checkout with no
   `dist` falls back to the sources beside it, so a monorepo can use the package before its first
   release.
3. **It collects the exported names** — named clauses, declarations, and both forms of star
   re-export, `export * from './…'` and `export type * from './…'` — following barrels eight levels
   deep, on a [view with comments and strings masked](#how-a-pattern-never-matches-a-comment).

The result is not a guess about the API: it is the API, read from the copy on disk.

::: warning The two forms of `export *` are not interchangeable
A package uses `export type *` to re-export all its public types in one line. A walker that knows only
the value form loses every type at once — here `Spy<T>` and everything declared beside it. Nothing
announces the loss: the table still builds, and the import transform just cannot place the name and
leaves it on `jest-auto-spies` with a residue error. It only shows on the source path, since a `.d.ts`
spells its exports out, so a suite run against a built `dist` stays green while the same suite run
before the build fails.
:::

**When a name is exported by more than one entry**, the codemod picks:

1. **The root**, if it exports the name — it registers the mock adapter and every runner has it.
2. Otherwise **your repository's own entry**, detected the same way [`init`](/utilities/cli) detects
   it: `provideAutoSpy` goes to `/angular` in an Angular repository and to `/nestjs` in a NestJS one.
3. Otherwise **the single entry that has it**.
4. Otherwise it asks the file: **an entry the file already imports from**, or one for **the framework
   the file's own text names** — on Bun, the Bun variant (`/bun-angular` rather than `/angular`).
5. Otherwise it **guesses** the likeliest entry for your runtime and reports `ambiguous-entry-point`
   with the alternatives.

A name no entry exports stays on the legacy package and is reported as `unmapped-legacy-export`.

When no installed copy can be found, the table is unavailable. The four transforms that need it —
`auto-spies-import`, `inject-cast`, and the two jasmine ones that place `createSpyObj` and `Spy<T>` —
decline to run and say so. A wrong entry that still compiles is exactly what this command exists to
avoid.

`--list` prints the whole table, so you can read it before trusting it.

### The import statement is edited in place, not rebuilt

The import block is where a file keeps things a rewrite must not lose: an alias, a comment on a
specifier, the line ending the repository uses. So a clause is edited by range, not rebuilt from the
names in it.

- **A line comment inside the clause is not a list of names.** The clause is split on the commas of
  the [masked view](#how-a-pattern-never-matches-a-comment), so words inside `// keep this one` are
  never read as imports. An added name goes after the last code character and before the comment; a
  removed specifier takes its own comma and trailing comment and nothing else. Aliases (`a as b`) and
  the clause's line breaks survive.
- **A new statement goes on its own line**, just after the statement above, so a comment at the end
  of that line stays. The newline matches the file: a CRLF file stays CRLF.
- **A byte-order mark** at the start of a file is kept.

### The result is parsed before it is written

If the codemod reports `codemod-broke-syntax`, the file was left exactly as it was. Migrate that file
by hand, and report the construct on the named line as a codemod defect.

```
error  codemod-broke-syntax src/app/service.spec.ts:7
       The rewritten file would not parse at line 7 (',' expected.), so the file was left as it
       was.
       → Migrate this file by hand, and report the construct on that line as a codemod defect.
       Docs: https://asdalexey.github.io/vitest-auto-spy/utilities/codemod#the-result-is-parsed-before-it-is-written
```

Every transform works on text, and the dangerous failure is a diff that looks plausible on a file that
no longer compiles. So each result goes through a parser: the `typescript` of the repository being
migrated, resolved from `--cwd`, so a global `npx vitest-auto-spy` does not read your files with
another compiler.

- A file whose syntax errors the run **added to** is not written; its edits and new import lines are
  dropped with it.
- The line and message are the parser's own, from the rewritten text.
- Errors before and after are compared, never against zero, so a spec that already had a syntax error
  is not blamed for it.
- Where `typescript` does not resolve from the repository, the check is skipped silently.

### One file failing does not stop the run

Each file is transformed on its own, and so is each `--verify` pass over it. A file the codemod throws
on becomes a `codemod-file-failed` error: nothing in it changes, and the run goes on. Migrate that file
by hand, and report the code shape that caused it.

`--write` writes each changed file through a temporary file in the same directory and a rename. An
interrupted run leaves every file either as it was or fully migrated, never half-written. The file's
mode is kept, and a symlink is written through. A write that fails (a permission, a full disk) becomes
a `codemod-write-failed` error, and the file on disk is unchanged. Only files whose text changed are
written.

### How a pattern never matches a comment

A codemod that matched raw source would rewrite the comment explaining the migration and the string
an assertion checks. Neither failure is loud: the file compiles and the diff looks plausible.

So every pattern is matched against a **mask**: the same text, same length, same line breaks, with the
contents of comments, strings, template literals and regular expressions replaced by spaces. Offsets
in the mask are valid in the original, so "find in the mask, slice from the source" is safe. Quotes are
kept, so `from 'jest-auto-spies'` is still found: the quote is matched in the mask, and the specifier
is read from the source.

**JSX is code, not a regular expression.** The slash in `<Thing />` and `</Thing>` sits where a
regular expression may start. The codemod knows that a `/` right after `<` does not
start a regular expression, and that a literal with `<` inside is not one either. So a `.tsx` suite is
migrated and reported in full.

**`--verify` uses a slightly different mask**, in two places, because what it looks for sits inside a
literal. A module specifier stays visible, because `from 'jest-auto-spies'` is the leftover. A
template literal stays visible, because the transforms do not edit inside one, so a `jest.` there is
real. The contents of an ordinary string stay masked: `expect(text).toBe('jest.spyOn(…)')` is text about the
migration, not code to migrate.
