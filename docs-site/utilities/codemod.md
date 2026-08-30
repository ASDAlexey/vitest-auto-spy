---
title: The codemod — npx vitest-auto-spy codemod
description: Seven transforms that migrate a suite off jest-auto-spies and Jest — splitting the legacy import across the entry points the installed package actually exports, transposing jest.Mock<R, [A]> into the call signature Vitest takes, and reporting every span it refused to rewrite. Dry run by default; --verify checks the result by matching, not by diffing.
---

# The codemod

```bash
npx vitest-auto-spy codemod            # dry run: prints a diff, writes nothing
npx vitest-auto-spy codemod --write    # apply it
npx vitest-auto-spy codemod --verify   # match the result against what should be gone
```

The [migration](/migrating) is a find-and-replace right up to the point where it is not, and the
places where it is not do not fail — they compile. `jest.Mock<void, [Order]>` renamed in place
becomes a mock that takes a `void` and returns an `Order`. `jest.requireMock` renamed in place
becomes `TypeError: vi.requireMock is not a function`, which reads as "the runner broke". A legacy
import moved to `vitest-auto-spy` wholesale puts `provideAutoSpy` behind an entry that does not
export it.

So this is a codemod rather than a `sed` script, and most of what it does is **decline**: seven
transforms, each of which either rewrites a span it can decide or leaves it exactly as it was and
names it in the report.

## Dry run by default

The first thing a repository sees from this tool is a proposal it can reject. `--write` is the
opt-in, and it is the same posture [`doctor`](/utilities/cli) takes for the same reason — trust
before edit rights.

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

error  residue/jest-namespace src/app/service.spec.ts:14
       Still matches after the run: "jest."
       → `jest-namespace` did not rewrite it — it declined (see its note), or it could not reach
         it: a template literal, an unbalanced bracket, a transform that was skipped. Rewrite this
         one by hand.

warn   no-vi-twin src/app/service.spec.ts:12
       `jest.requireActual` was left alone.
       → `vi.importActual(id)` is asynchronous and only legal inside a `vi.mock` factory; rewriting
         it changes control flow.

1 error, 1 warning, 0 notes
```

That run exits **1**, and the reason is the whole design: one line — `jest.requireActual` — was left
alone, so a person still has work to do. Nothing about the six edits failed.

| Exit | When                                                                                 |
| ---- | ------------------------------------------------------------------------------------ |
| `0`  | Every span was decided, and nothing matched a residue pattern afterwards             |
| `1`  | Something was left alone, or a residue survived the run — including under `--verify` |
| `2`  | An unknown transform id was passed to `--only` / `--skip`                            |

With no path it visits every `*.spec.ts` / `*.test.ts(x)` in the repository; with a path it visits
every TypeScript file under it, declaration files excluded. The narrow default is deliberate — a
`jest.` in a `main.ts` is not a test to migrate, and a codemod that offers to edit application code
on its first run does not get a second one. A file whose text matches none of the selected
transforms' patterns is never read into the report at all, so the output is the files that have
something to say.

## The seven transforms

Each has an id, and each is individually skippable. Nothing is applied until every transform has
looked at the same untouched source, so `--skip` removes one transform's edits and nothing else —
it cannot change what the others saw.

| Id                          | Rewrites                                                                                | Declines                                                                 |
| --------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `auto-spies-import`         | `import … from 'jest-auto-spies'` → the entry points that export each name              | A default or namespace import; a name no entry exports                   |
| `inject-cast`               | `TestBed.inject(X) as Spy<X>` → `asSpy<X>(TestBed.inject(X))`, adding the import        | `as Spy<T>` over anything else                                           |
| `jest-globals-import`       | `from '@jest/globals'` → `from 'vitest'`, renaming the `jest` binding to `vi`           | The rest of the clause — `describe` / `it` / `expect` are named the same |
| `jest-namespace`            | `jest.<member>` → `vi.<member>` for the 26 members that have a twin                     | A member with no twin, and any member it does not know                   |
| `jest-types`                | `jest.Mock<R, [A]>` → `Mock<(a: A) => R>`, plus four renames, importing the Vitest name | A type argument list it cannot split at the top level                    |
| `jasmine-aliases`           | `xit` / `xdescribe` / `fit` / `fdescribe` / `xtest` → `it.skip` / `describe.skip` / …   | A method of the same name — `shape.fit(box)` is untouched                |
| `mock-implementation-arity` | `mockImplementation()` with no argument → `mockImplementation(() => undefined)`         | A call that already has its function                                     |

`auto-spies-import` runs first, because it is what creates the `vitest-auto-spy` import that
`inject-cast` then adds `asSpy` to. Everything after that is order-independent.

The two `import` rules and `jest-namespace` are worth reading together. `jest.dontMock` becomes
`vi.doUnmock` — a rename, not a copy — and `jest.SpyInstance` becomes `MockInstance`. A `vi.mock()`
of a **relative** path is renamed and then warned about, because under a bundling test builder the
module boundary it would replace no longer exists and the mock is a silent no-op;
[provide a real seam](/utilities/module-mocks#provide-a-real-seam) instead.

## The trap: Jest puts the return type first

```diff
- let hook: jest.Mock<void, [Order]>;
+ let hook: Mock<(order: Order) => void>;
```

Jest's first type argument is the **return type** and its second is the **argument tuple**. Vitest's
single type argument is a **call signature**. A rename that leaves the type arguments in place —
which is what every migration gist does — compiles cleanly into the reverse meaning, and nothing
fails until a call site disagrees with it, somewhere else, later.

So this transform rebuilds the type rather than renaming it, and four details are the difference
between that being safe and being a slower way to be wrong:

- **The bracket matcher skips `=>` as a unit.** Without that, `jest.Mock<() => void, []>` "closes"
  its type-argument list at the arrow's `>`, and the rewrite silently takes half the type.
- **Tuple elements keep their labels, their optionality and their rest.**
  `[id: number, force?: boolean, ...rest: string[]]` becomes
  `(id: number, force?: boolean, ...rest: string[])`. An unlabelled element is numbered `arg0`,
  `arg1` — a function type has to name its parameters and Jest's tuple did not.
- **Anything that is not a tuple literal is spread rather than parsed.** `jest.Mock<void, Args>`
  becomes `Mock<(...args: Args) => void>`, which is what Jest's second argument means for every
  possible `Args` and needs nothing understood about it.
- **Three or more type arguments produce an error note and no edit.** So does an unbalanced
  `<`…`>`. The line is left byte-for-byte as it was, with `jest-mock-type-arguments` naming it.

`jest.Mock` with no type arguments at all is left as `Mock`: on its own it already means the same
thing on both sides.

## The entry-point table is generated, not written down

Splitting `import { createSpyFromClass, provideAutoSpy, Spy } from 'jest-auto-spies'` requires
knowing which name lives behind which entry point — and a table typed into the codemod's source is
a table that is correct for the version it was written against and wrong for the one the consumer
installed. An entry added in a later minor is a name this codemod would leave at the root; an entry
that moved is a rewrite that no longer resolves. Both still compile at the import line.

So there is no table in the source. At run time the command:

1. **Locates the installed `vitest-auto-spy`**, walking `node_modules` up to six directories out of
   the working directory — enough for a workspace whose dependencies are hoisted — and falling back
   to the copy the CLI is itself running from.
2. **Reads that package's own `exports` map**, and resolves each subpath to a file, preferring the
   `types` condition: a declaration file names the type-only exports a runtime bundle cannot. A
   checkout with no `dist` falls back to the sources beside it, which is how a monorepo consumes the
   package before its first release.
3. **Collects the exported names lexically** — named clauses, declarations, and both spellings of the
   star re-export, `export * from './…'` and `export type * from './…'`, followed through the barrels
   to a depth of eight — against a
   [comment-and-string-masked view](#how-a-pattern-never-matches-a-comment) of each file, so a name
   inside a comment or a string is not an export.

The result is a name → specifiers lookup with no false positives available to it, because it is not
a guess about the API — it _is_ the API, read off the copy on disk.

::: warning The two spellings of `export *` are not interchangeable, and the difference is invisible
The type-only form is what a package uses to re-export its public type surface in one line, so a
walker that knows only the value form loses every type at once — here that is `Spy<T>` and everything
declared beside it. Nothing announces the loss: the table still builds, still looks complete, and the
import transform simply decides it cannot place the name and leaves the import on `jest-auto-spies`
with a residue error. The failure also only appears on the source path, since a `.d.ts` spells its
exports out — so a suite run against a built `dist` stays green while the same suite run before the
build fails.
:::

**Resolution order**, when a name is exported by more than one entry:

1. **The root wins** if it exports the name, because the root is the entry that registers the mock
   adapter and the one every runner has.
2. Otherwise **the repository's own entry wins** — the same runner-and-framework detection
   [`init`](/utilities/cli) uses, so `provideAutoSpy` goes
   to `/angular` in an Angular repository and to `/nestjs` in a NestJS one.
3. Otherwise **the single entry that has it** wins.
4. Two non-root entries and no preference is **not decidable from the file**. The name is left
   importing from the legacy package and reported as `unmapped-legacy-export`.

When no installed copy can be found at all, the table is unavailable, and the two transforms that
need it decline to run and say so rather than guessing. A wrong entry that still compiles is the
exact failure this command exists to avoid.

### Auditing it before trusting it

`--list` prints the transforms and the whole generated table — **247 rows** against the export map
this package ships today — so it can be read before it is believed:

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

A transform that this run would skip is marked `-` in the left column, so `--list --skip jest-types`
answers "what exactly am I about to run" in one command. `--list` writes nothing and exits 0.

## What it deliberately leaves alone

This list is the feature. Every entry is a span where a plausible rewrite exists, compiles, and is
wrong — so the codemod prints it instead, with the reason and a `path:line` an editor turns into a
jump.

| Left alone                                                                      | Why                                                                                                                                  |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `jest.requireActual(id)`                                                        | `vi.importActual(id)` is asynchronous and only legal inside a `vi.mock` factory — rewriting it changes the control flow around it    |
| `jest.requireMock(id)`, `jest.setMock(…)`                                       | There is no `vi` twin; the double is provided through the TestBed / the container, or passed as an argument                          |
| `jest.replaceProperty(o, k, v)`                                                 | The answer is `mockValueProp(o, k, v)` from this package — a different helper with its own restore, not a member with a new name     |
| `jest.setTimeout(n)`                                                            | The replacement is the `testTimeout` config option or `vi.setConfig({ testTimeout: n })`; the argument is not a plain number there   |
| `enableAutomock`, `createMockFromModule`, `now`, `retryTimes`, `runAllTicks`, … | No `vi` member of that name exists, and for each the honest answer is a different design                                             |
| Any **unknown** `jest.<member>`                                                 | Never renamed on the assumption that `vi` has it. That assumption is exactly the `vi.requireMock is not a function` failure          |
| `as Spy<T>` over anything but `TestBed.inject(...)`                             | If the value really is a spy, `asSpy(...)`; if it is a hand-built double, [`createAutoMock<T>()`](/core/auto-mock-by-type) builds it |
| A default or namespace import of the legacy package                             | The helpers live behind different entry points, and a namespace cannot straddle them                                                 |
| Anything inside a template literal                                              | Every pattern is matched against a masked view; a template literal's contents are blank there                                        |
| Any span whose brackets do not balance                                          | The end of the region is unknown, and guessing where it ends is how a rewrite takes half a type                                      |

### How a pattern never matches a comment

A codemod that matches its patterns against raw source rewrites the sentence in the comment
explaining the migration and the string literal in the assertion asserting on it. Neither failure is
loud — the file still compiles and the diff looks plausible.

So every pattern is matched against a **mask**: the same string, the same length, the same line
breaks, with the _contents_ of comments, strings, template literals and regular expressions replaced
by spaces. Offsets found in the mask are valid in the original, which is what makes "find in the
mask, slice from the source" safe. Quotes are kept, so `from 'jest-auto-spies'` is still findable —
the quote is matched in the mask and the specifier is read from the source between them.

The residue check ([below](#verifying-by-matching-not-by-diffing)) uses a second view of the same
mask that differs in exactly two places, both because what it is looking for lives inside a literal:
a module specifier stays visible, because `from 'jest-auto-spies'` _is_ the leftover, and a template
literal stays visible, because the transforms decline to edit inside one and a `jest.` left there is
real. An ordinary string stays blank — `expect(text).toBe('jest.spyOn(…)')` is prose about the
migration, not a thing to migrate.

## Verifying by matching, not by diffing

[The closing note of the migration page](/migrating#a-codemod-that-edits-globs-is-verified-by-matching-not-by-diffing)
argues that the natural check on a codemod — "did the file change the way I meant?" — passes while
the result is broken, and that the honest check is to match the **result** against what should no
longer be there. `--verify` is that note, implemented.

Every transform declares a `residue` pattern: what it is supposed to have removed. After a run —
or on a suite nobody ran this tool over at all — the files are matched against those patterns, and
every survivor is reported with `file:line`:

```
$ npx vitest-auto-spy codemod --verify
vitest-auto-spy codemod — /work/app
1 files matched against 7 transform patterns.

error  residue/auto-spies-import src/app/service.spec.ts:1
       Still matches after the run: "from 'jest-auto-spies'"
error  residue/inject-cast src/app/service.spec.ts:10
       Still matches after the run: "as Spy<"
error  residue/jest-types src/app/service.spec.ts:7
       Still matches after the run: "jest.Mock"
```

Two properties follow from matching rather than diffing, and neither is available to a check built
on the diff:

- **It works on a file this tool never touched.** A spec somebody migrated by hand, a spec a
  different agent edited, a span a `--skip` excluded — all of them answer the same question the
  same way. `--verify` transforms nothing, so it is safe to leave in CI on a repository that is
  already migrated: it exits 0 with `Nothing left to migrate.`, and 1 the moment a `jest.` comes
  back.
- **A diff that looks exactly right can still leave the pattern.** Inside a template literal the
  transforms decline to enter; in a statement whose brackets did not balance they could not reach.
  The change is correct and the file still says `jest.`.

The report prints **the resulting import statements in full**, not a count — the three lines under
each filename in the dry-run output above. That is the same point the migration note makes about
`fixed: 152` hiding the case where the replacement produced two different wrong shapes. A count says
the import block changed; the statements say what it changed into, which is the thing a reviewer was
going to check by hand anyway.

## Flags

| Flag           | Effect                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------- |
| _(none)_       | Dry run. Print the diff, the transform tally, the resulting imports and the report. Write nothing |
| `--write`      | Apply the edits. Spans that were left alone are still left alone, and still reported              |
| `--verify`     | Transform nothing; match the files against the residue patterns. Exit 1 if anything matched       |
| `--only <ids>` | Run only these transforms, comma-separated                                                        |
| `--skip <ids>` | Run everything except these                                                                       |
| `--list`       | Print the transforms and the generated entry-point table, and exit 0                              |
| `--cwd <dir>`  | Run against another directory instead of the current one                                          |

An id neither `--only` nor `--skip` recognises exits **2** naming the known ids, rather than quietly
running everything.

## In CI

```yaml
- run: npx vitest-auto-spy codemod --verify
```

One line, no network, no config, no token. On a migrated repository it is a green no-op; it turns
red when a `jest.`, a legacy import or an `as Spy<…>` cast reappears — which, in a suite big enough
to be migrated by a codemod, is a thing that reappears.

The order that works on a real suite:

```bash
npx vitest-auto-spy codemod            # read the diff
npx vitest-auto-spy codemod --write    # apply it
npx vitest-auto-spy codemod --verify   # then check the result, not the diff
npx vitest-auto-spy doctor             # and what a migration leaves behind
```

`doctor` is the other half of the same shift: the codemod edits what a migration has to change,
[`doctor`](/utilities/cli) reports what it leaves behind — a `tsconfig` include pattern the edit
broke, a `jest.config.ts` for a runner that is gone, the setup files only it referenced.
