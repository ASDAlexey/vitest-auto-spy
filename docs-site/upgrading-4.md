---
title: Upgrading to 4.0
description: Three breaking changes; rxjs leaves the published declarations, the DOM stubs and run diagnostics get their own subpaths, and every lint rule becomes an error. What to change, and what stays.
---

# Upgrading to 4.0

Version 4.0 makes the package lighter for your project. No helper was removed and spies behave the
same. You change at most a few import lines:

```ts
// before
import { createSpyFromClass, stubIntersectionObserver } from 'vitest-auto-spy';

// after
import { createSpyFromClass } from 'vitest-auto-spy';
import { stubIntersectionObserver } from 'vitest-auto-spy/dom-stubs';
```

**Checklist**

1. Bump the version and run your type-check, tests and linter.
2. If the compiler cannot find a DOM stub or a run-diagnostics helper, change its import to
   `vitest-auto-spy/dom-stubs` or `vitest-auto-spy/diagnostics`. `npx vitest-auto-spy codemod` does
   it for you. See [section 2](#_2-dom-stubs-and-run-diagnostics-moved-to-their-own-subpaths).
3. If you annotate `returnSubject()` as rxjs `Subject<T>` and it stops compiling, add
   `import 'vitest-auto-spy/rxjs';` to a file your `tsconfig` includes. See
   [section 1](#_1-rxjs-left-the-published-declarations).
4. If the linter turns red, every rule is now an error. Tune three rules or take everything as
   warnings first. See [section 3](#_3-every-eslint-rule-is-an-error).

## Why upgrade

This release adds no feature and changes no runtime behaviour. Every row below is a cost your
project stops paying.

| What you get                                                                                                                               | Measured                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| **rxjs leaves your TypeScript program.** Before, the published types named `Observable` and `Subject`, so every project loaded rxjs types. | program **303 → 114 files**; rxjs files **189 → 0**                                |
| **The published `.d.ts` compiles without rxjs installed**                                                                                  | `TS2307` under `skipLibCheck: false` with no rxjs: reproducible → gone             |
| **Every spec file that does not use a DOM global starts faster**                                                                           | **−0.159 ms per file**; root entry **15.5 → 12.9 kB** min+gzip                     |
| **A second copy of rxjs no longer breaks observable spies**                                                                                | `nextWith is not a function` with no hint at the duplicate → the helpers are there |
| **Your project decides how strict the lint rules are**                                                                                     | all nineteen rules are `error`; each rule page shows how to relax it               |

The cost: two import specifiers, plus one import if you annotate `returnSubject()`.

## What changed

Three breaking changes. None of them changes what a spy does:

- no helper was removed or renamed;
- no configuration key changed meaning;
- runtime behaviour is the same.

What changed is where two groups of helpers are imported from, the type of `returnSubject()`, and how
strict the lint rules are.

|                                                                                                         | What to do                                                                     |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [1. rxjs left the declarations](#_1-rxjs-left-the-published-declarations)                               | usually nothing; one import if you annotate `returnSubject()`                  |
| [2. DOM stubs and run diagnostics moved](#_2-dom-stubs-and-run-diagnostics-moved-to-their-own-subpaths) | change the import of thirteen helpers, on every entry that re-exports the core |
| [3. Every lint rule is an error](#_3-every-eslint-rule-is-an-error)                                     | nothing, or one config block                                                   |

## 1. rxjs left the published declarations

At runtime, rxjs was always optional: only `vitest-auto-spy/rxjs` imports it. The published types
were different. They started with `import { Observable, Subject } from 'rxjs'`. TypeScript loads a
type-only import like any other import. So:

- every project loaded rxjs types, even without using rxjs;
- a project without rxjs got `TS2307` inside the package's `.d.ts` under `skipLibCheck: false`.

Measured on the published package, for a project that only calls `createSpyFromClass` on a
promise-based service:

|                                                        | 3.18 |     4.0 |
| ------------------------------------------------------ | ---: | ------: |
| files in the TypeScript program                        |  303 | **114** |
| of those, rxjs `.d.ts` files                           |  189 |   **0** |
| `TS2307` with `skipLibCheck: false`, no rxjs installed |  yes |    none |

Why `import type` does not help: see [the rxjs page](/runtimes/rxjs#rxjs-in-the-types).

### Does it affect you?

Run your type-check. It can report two things; only the first is common.

#### `returnSubject()` is typed as `SubjectLike` when the rxjs layer is not in your program

`returnSubject()` and `nextWithPerCall()` now return `SubjectOf<T>`:

- If `vitest-auto-spy/rxjs` is part of the program TypeScript checks your specs in, `SubjectOf<T>`
  **is** rxjs's own `Subject<T>`.
- If it is not, it is the structural `SubjectLike<T>`: `next`, `error`, `complete` and
  `asObservable`.

In the second case, an annotation like this stops compiling:

```ts
const subject: Subject<Product[]> = service.getProducts$.returnSubject();
//    ~~~~~~~ Type 'SubjectLike<Product[]>' is not assignable to type 'Subject<Product[]>'
```

The fix is one line in a file your `tsconfig` includes:

```ts
import 'vitest-auto-spy/rxjs';
```

The observable helpers already need this import at runtime. If your tests call `nextWith`, you have
it somewhere. The error means the **compiler** does not see that file. Usually it is a Vitest
`setupFiles` entry that no `tsconfig` includes. Add the file to `include`, or move the import into a
spec.

Under `@angular/build:unit-test` 22.2.0 and later, `include` alone is not enough. The builder
compiles only the specs, the `providersFile`, the `setupFiles` and the `.d.ts` files of
`tsconfig.spec.json`. Put the import in a setup file, a spec or a `.d.ts`.

If you never annotate the result (`const subject = spy.load.returnSubject()`), nothing changes for
you.

#### Detection is structural, so a duplicated rxjs now matches

A member counts as an observable when its type has `subscribe` and a `forEach(next)` that returns a
promise.

- These match: rxjs `Observable`, every `Subject`, Angular `EventEmitter`.
- These do not: `Promise`, arrays, `Signal`, Angular `OutputEmitterRef`.

So nothing that used to be a plain spy becomes an observable spy by accident.

One case gets better: an `Observable` from a **second copy of rxjs** in `node_modules`. Before, it
got no observable helpers, and the test failed with `nextWith is not a function`. Now it works.

If your own stream type happens to have both members, it now counts as an observable too. If that is
wrong for your type, name the member in `methodsToSpyOn` or `onlyMethodsToSpyOn`.

## 2. DOM stubs and run diagnostics moved to their own subpaths

Thirteen helpers left **every entry that re-exports the core**: `vitest-auto-spy`, `/bun`,
`/bun-angular`, `/node`, `/react`, `/vue` and `/svelte`. Importing from `/react` instead of the root
does not avoid the change. The helpers themselves are the same; only the import path changed:

| Was                                                                                                                                                                                       | Is now                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `stubIntersectionObserver`, `stubResizeObserver`, `stubMutationObserver`, `stubObserver`, `intersectionEntry`, `resizeEntry`, `mutationRecord`, `stubMediaElement`, `stubAbortController` | `vitest-auto-spy/dom-stubs`   |
| `compareTestRuns`, `summarizeTestRun`, `formatTestRunComparison`, `diffByField`                                                                                                           | `vitest-auto-spy/diagnostics` |

`mockConstructor`, `stubConstructor` and `createSpyClass` stay on the root: they are about `new`, not
about the DOM. `restoreMockedProps()` and `setupAutoSpy()` still undo everything the moved stubs
patch.

Their types moved with them:

- from `/dom-stubs`: `ObserverStub`, `ObserverStubOptions`, `ObserverGlobal`, `ObserverInstance`,
  `IntersectionObserverStubOptions`, `MutationRecordInit`, `ResizeEntryRect`, `MediaElementState`,
  `MediaElementStub`, `MediaElementStubOptions`;
- from `/diagnostics`: `TestRunComparison`, `TestRunReport`, `TestRunSummary`.

```ts
// before
import { createSpyFromClass, stubIntersectionObserver } from 'vitest-auto-spy';

// after
import { createSpyFromClass } from 'vitest-auto-spy';
import { stubIntersectionObserver } from 'vitest-auto-spy/dom-stubs';
```

The compiler finds every place for you. `npx vitest-auto-spy codemod` rewrites the imports. It reads
the `exports` map of the installed package, so each name goes to the entry that really has it.

**Why.** A test runner does not tree-shake spec files, and an ESM re-export always loads its module.
So every spec file, even in a Node service with no DOM, ran 27 kB of observer, media-element and
`AbortController` code to get `createSpyFromClass`. The only fix is to stop exporting it from the
root.

Measured on the built package, one process per sample, medians of 40 paired runs:

|                                                 |                                      change |
| ----------------------------------------------- | ------------------------------------------: |
| a spec file that does **not** import them       |                               **−0.159 ms** |
| a spec file that **does** import `/dom-stubs`   |                                   +0.155 ms |
| a spec file that **does** import `/diagnostics` |                                   +0.069 ms |
| `dist`                                          | **−20.3 kB** of JS, −3.8 kB of declarations |

Both new entries are built as single files, so importing one adds one module, not four. Split into
chunks, the second row read **+0.62 ms**. If fewer than half of your spec files import the DOM
stubs, your whole run gets faster.

## 3. Every ESLint rule is an error

`configs.recommended` used to set its nineteen rules to `error`, `warn` or `off`. Now all of them are
`error`. One rule added later is the exception: `prefer-render-shallow` is a `warn`, because it
reports a cost, not a bug. [The plugin page](/utilities/eslint-plugin#rules) explains why.

A build does not stop on a `warn`. In a repository where nobody reads lint output, `warn` works like
`off`. Which findings block a merge is your project's choice, and it is one line of config. So the
default is strict, and [Tuning it for your project](/utilities/eslint-plugin#tuning-it-for-your-project)
shows how to relax it.

Two rules changed more than their severity:

- **`prefer-native-spy-api` was `off` before 4.0.** It is on now because most projects are not in the
  middle of a migration. A project that is turns it off with one line (below).
- **`jasmine-namespace-without-entry` no longer reports `spy.mock.calls[0]`.** It used to report
  this common Vitest read at `warn`, while bare `spy.mock.calls` passed. Anything under `.mock` is
  never reported now.

If the first run is red, look at these three rules first. Each can report correct code:

```js
import autoSpy from 'vitest-auto-spy/eslint-plugin';

export default [
  {
    files: ['**/*.spec.ts'],
    ...autoSpy.configs.recommended,
    rules: {
      ...autoSpy.configs.recommended.rules, // spread it, or a bare `rules` key replaces the whole map
      // the jasmine layer is installed in a setup file no spec imports: name that file
      'vitest-auto-spy/jasmine-namespace-without-entry': ['error', { setupModules: ['./test-setup'] }],
      // reports working bridge code: off until the move off jasmine-auto-spies is finished
      'vitest-auto-spy/prefer-native-spy-api': 'off',
      // no option; it is silent wherever it cannot read all of a file's providers.
      // Turn it off only in files where a helper you call registers the provider.
      // 'vitest-auto-spy/no-unregistered-inject-spy': 'off',
    },
  },
];
```

On a large existing codebase, start with every rule as a warning and fix in batches. The recipe is in
[Tuning it for your project](/utilities/eslint-plugin#tuning-it-for-your-project).

## Also changed in 3.x

If you come from an early 3.x release, these changes reach you too.

- **3.1.0: `gettersToSpyOn` and `settersToSpyOn` accept a getter that returns a `Signal`.** Before, a
  signal getter could not be named. The error was `Type 'string' is not assignable to type 'never'`,
  with nothing about signals in it.
- **3.5.0: naming one half of a get/set pair spies both halves.** This happens only when the class
  declares both. Before, a write went to a no-op setter and was lost, and
  `accessorSpies.setters.x` was `undefined`.
- **3.5.0: an observable spy no longer carries values into the next test.** A `nextWith(value)` from
  one test used to reach the next one ahead of its `throwWith(error)`. The code under test then ran
  the success branch on old data. After `error()` or `complete()`, later `nextWith` calls emitted
  nothing. `resetAutoSpy` now clears both. For a spy shared across tests, call `resetAutoSpy(spy)` in
  `beforeEach`.
- **3.5.0: `expectEmission` and `expectEmissions` infer the emitted type.** `expectEmission(of(1))`
  is a `Promise<number>`. Before, both helpers returned `Promise<unknown>`, and the loss showed only
  when a spec read a field of the result.
- **3.5.0: `createAutoMock` and `mockDeep` doubles answer three operations correctly.**
  - The four `mock*Prop` helpers work on them, and `restoreMockedProps()` undoes the patch. Before,
    the patch was silently ignored.
  - `delete mock.optionalMethod` removes the member until something writes it again. Before, the
    next read created a new spy.
  - `of(mock)` emits the double. Before, rxjs took the double for a scheduler, and the stream stayed
    empty.
- **3.5.0: `asInstance` accepts a `mockDeep` result.** Before, a deep mock could not be passed where
  `T` was expected.
- **3.5.0: `prefer-inject-spy` reads the two-step form.** It used to report only
  `vi.spyOn(TestBed.inject(X), 'm')` written inline.
- **3.5.0: `provideAutoSpy` accepts abstract class tokens.** `abstract class LocalStorage` provided
  as `{ provide: LocalStorage, useClass: BrowserLocalStorage }` used to fail twice: the bare call
  gave an empty spy, and the config form did not compile
  (`TS2345: Cannot assign an abstract constructor type to a non-abstract constructor type`). Both
  work now. The hand-written `{ provide: LocalStorage, useValue: createAutoMock<LocalStorage>() }`
  is no longer needed.
- **3.5.0: both provider helpers take `returns`, `overrides` and `observablePropsToSpyOn`.** Before,
  `provideAutoSpyForToken` took only property values and `provideAutoSpy` only method
  configuration, so a spy needing both was finished in a `beforeEach`.
- **3.5.0: `overrideProvider(X, provideAutoSpy(X))` works.** Older docs said it was a silent no-op.
  `overrideProvider` reads `useValue` and ignores the extra `provide`, so the spy is installed.
  `overrideAutoSpy` is still clearer.
- **3.7.0: `stable()` gives the fixture 2000 ms and then throws the cause.** Before, a fixture that
  never settled hung until Vitest reported a 5 s file-level timeout that named neither the helper nor
  the fixture.
- **3.13.0: `nextWithValues` emits falsy values.** `{ value: false }`, `{ value: 0 }`,
  `{ value: '' }`, `{ value: null }` and a falsy `errorValue` used to emit nothing. A boolean or
  counter stream stayed silent.
- **3.13.0: a spied method accepts only the arguments the real method accepts.** Before, `read(1)`,
  `read('ok', 'extra')` and `read()` all compiled on a spy of `read(key: string)`. The mock surface is
  now `MockInstance`, which has no call signature of its own.
- **3.7.0: the docs stop showing `httpResource()` with `flushEventLoopUntil`.** That example never
  worked. The helper takes event-loop turns and never ticks, so the resource made no request and the
  wait timed out. Use `settleResource()` from `vitest-auto-spy/angular` instead.
- **Docs correction (2026-08-29): `vi.mock('@angular/core')` works under `@angular/build:unit-test`.**
  Earlier docs said it could not be mocked at all. Measured on 11 spec files collected in one run, on
  `@angular/build` 21.2.16 and 22.1.6, it does work; the real rule is narrower.

## What did _not_ change

- No helper was removed, renamed or deprecated. Two groups moved to new import paths, and that is
  all.
- No lint rule was added or removed. Apart from the `.mock` fix in
  `jasmine-namespace-without-entry`, none changed what it reports. Only the severity changed.
- `nextWith`, `nextWithValues`, `nextOneTimeWith`, `throwWith`, `complete`, `observablePropsToSpyOn`
  and the `calledWith` chains behave the same.
- `rxjs` stays an optional peer dependency. Only `vitest-auto-spy/rxjs` and
  `vitest-auto-spy/observer-spy` import it, now in the types as well as at runtime. The build fails
  if any other entry imports it.
- The Angular, NestJS, React, Vue, Svelte, Bun and `node:test` entry points are unchanged.

## Coming from further back

- [Upgrading to 3.0](/upgrading-3) is one line in `package.json`: the `vitest` peer range now
  matches what the types need.
- [Upgrading to 2.0](/upgrading-2) matters if you are still on 1.x. `methodsToSpyOn` stopped
  removing spies, which took one migrated component from 147 failing tests to 4. Lazy method spies
  cut a wide test run from 257 ms / 425 MB to 27 ms / 35 MB.
