---
title: Upgrading to 4.0
description: Three breaking changes; rxjs leaves the published declarations, the DOM stubs and run diagnostics get their own subpaths, and every lint rule becomes an error. What to change, and what stays.
---

# Upgrading to 4.0

## Why upgrade

This major has one job: take out of your project the weight this library was making it carry. It
adds no feature, removes no helper and changes no runtime behaviour — every number below is
something your project stops paying.

| What you get                                                                                                                                                           | Measured                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **rxjs leaves your TypeScript program.** The published declarations named `Observable` and `Subject`, so every consumer loaded rxjs whether or not the project used it | program **303 → 114 files**, of which **189 → 0** are rxjs                                  |
| **A shipped `.d.ts` stops erroring without the optional peer**                                                                                                         | `TS2307` under `skipLibCheck: false` with no rxjs installed: reproducible → gone            |
| **Every spec file that does not touch a DOM global gets time back**                                                                                                    | **−0.159 ms per file**; root entry **15.5 → 12.9 kB** min+gzip                              |
| **A second copy of rxjs stops silently breaking observable detection**                                                                                                 | `nextWith is not a function` with nothing pointing at the duplicate → the helpers are there |
| **The lint rules stop deciding how much your project cares**                                                                                                           | all nineteen `error`, the dial documented per rule                                          |

And what it costs: two import specifiers, plus one import if you annotate `returnSubject()`. That is
the whole of it, and the rest of this page is the list with the line that fixes each.

If you use the observable helpers, keep `import 'vitest-auto-spy/rxjs'` somewhere your `tsconfig`
includes — that one import is what keeps `returnSubject()` typed as rxjs's own `Subject<T>`.

## What changed

**Three breaking changes, and none of them changes what a spy does.** No helper was removed or
renamed, no configuration key changed meaning, no runtime behaviour differs. What changed is where
two groups of helpers are imported from, what `returnSubject()` is typed as, and how loud the lint
rules are. Most suites upgrade by changing the version, running the suite, and fixing whatever the
type-check and the linter then say.

|                                                                                                         | What to do                                                                               |
| ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| [1. rxjs left the declarations](#_1-rxjs-left-the-published-declarations)                               | usually nothing; one import if you annotate `returnSubject()`                            |
| [2. DOM stubs and run diagnostics moved](#_2-dom-stubs-and-run-diagnostics-moved-to-their-own-subpaths) | change the import specifier on thirteen helpers, on every entry that re-exports the core |
| [3. Every lint rule is an error](#_3-every-eslint-rule-is-an-error)                                     | nothing, or one config block                                                             |

## 1. rxjs left the published declarations

`vitest-auto-spy` has always kept rxjs behind the optional `vitest-auto-spy/rxjs` subpath at
runtime. At the type level it did not: the shared declaration chunk opened with
`import { Observable, Subject } from 'rxjs'`, and TypeScript resolves a type-only import exactly as
it resolves a value one — so every consumer's program loaded rxjs whether or not the project uses
it, and a consumer without the optional peer got `TS2307` inside a shipped `.d.ts` under
`skipLibCheck: false`.

Measured on the shipped package, for a consumer whose only use of the library is
`createSpyFromClass` on a promise-returning service:

|                                                        | 3.18 |     4.0 |
| ------------------------------------------------------ | ---: | ------: |
| files in the TypeScript program                        |  303 | **114** |
| of those, rxjs `.d.ts` files                           |  189 |   **0** |
| `TS2307` with `skipLibCheck: false`, no rxjs installed |  yes |    none |

The full explanation, including why `import type` does not fix it, is on
[the rxjs page](/runtimes/rxjs#rxjs-in-the-types).

### Does it affect you?

Run your type-check. Two things can report, and only the first is common.

#### `returnSubject()` is not an rxjs `Subject` any more — unless the layer is in your program

`returnSubject()` and `nextWithPerCall()` now return `SubjectOf<T>`, which **is** rxjs's own
`Subject<T>` as long as `vitest-auto-spy/rxjs` is part of the program TypeScript checks your specs
in. If it is not, they return the structural `SubjectLike<T>` — `next`, `error`, `complete`,
`asObservable`, everything the helper is reached for — and an annotation like this stops compiling:

```ts
const subject: Subject<Product[]> = service.getProducts$.returnSubject();
//    ~~~~~~~ Type 'SubjectLike<Product[]>' is not assignable to type 'Subject<Product[]>'
```

The fix is one line, in a file your `tsconfig` includes:

```ts
import 'vitest-auto-spy/rxjs';
```

That is the same import the observable helpers already need at runtime; if your suite calls
`nextWith` at all, it is somewhere in your repository already. What the error is telling you is that
it is somewhere the **compiler** cannot see — typically a Vitest `setupFiles` entry that no
`tsconfig` includes. Add the file to `include`, or put the import in a spec-side file.

Suites that never annotate the result (`const subject = spy.load.returnSubject()`) are unaffected
either way.

#### Detection is structural, so a duplicated rxjs now matches

A member counts as observable when its type has `subscribe` and a promise-returning `forEach(next)`.
rxjs's `Observable`, every `Subject` and Angular's `EventEmitter` satisfy that; `Promise`, arrays,
`Signal` and Angular's `OutputEmitterRef` do not, so nothing that used to be a plain spy becomes an
observable one by accident.

One case changes in the useful direction: an `Observable` coming from a **second copy of rxjs** in
the tree. `Subject` is nominal — it has a private field — so a duplicated rxjs used to miss the
observable bundle entirely, and the symptom was `nextWith is not a function` with nothing pointing
at the duplicate. That now works.

If you have a hand-rolled stream type of your own that happens to have both members, it will now be
treated as an observable. That is the intended widening; if it is wrong for your type, name the
member in `methodsToSpyOn` / `onlyMethodsToSpyOn` instead of relying on inference.

## 2. DOM stubs and run diagnostics moved to their own subpaths

Thirteen helpers left **every entry that re-exports the core** — `vitest-auto-spy`, `/bun`,
`/bun-angular`, `/node`, `/react`, `/vue` and `/svelte`, so importing from `/react` instead of the
root does not avoid this. Nothing about the helpers changed — same functions, same signatures, same
undo journal — only the specifier:

| Was                                                                                                                                                                                       | Is now                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `stubIntersectionObserver`, `stubResizeObserver`, `stubMutationObserver`, `stubObserver`, `intersectionEntry`, `resizeEntry`, `mutationRecord`, `stubMediaElement`, `stubAbortController` | `vitest-auto-spy/dom-stubs`   |
| `compareTestRuns`, `summarizeTestRun`, `formatTestRunComparison`, `diffByField`                                                                                                           | `vitest-auto-spy/diagnostics` |

Their types moved with them: `ObserverStub`, `ObserverStubOptions`, `ObserverGlobal`,
`ObserverInstance`, `IntersectionObserverStubOptions`, `MutationRecordInit`, `ResizeEntryRect`,
`MediaElementState`, `MediaElementStub` and `MediaElementStubOptions` from `/dom-stubs`;
`TestRunComparison`, `TestRunReport` and `TestRunSummary` from `/diagnostics`.

```ts
// before
import { createSpyFromClass, stubIntersectionObserver } from 'vitest-auto-spy';

// after
import { createSpyFromClass } from 'vitest-auto-spy';
import { stubIntersectionObserver } from 'vitest-auto-spy/dom-stubs';
```

The compiler finds every one of these for you, and `npx vitest-auto-spy codemod` rewrites the
imports — it reads the installed package's own `exports` map rather than a table, so it moves each
name to the entry that actually has it.

**Why.** ESM re-export is eager and no runner tree-shakes a test file, so the only way to stop
evaluating a module is to stop exporting it. Every spec in every project — Node services with no DOM
at all — was evaluating 27 kB of observer, media-element and `AbortController` code to get
`createSpyFromClass`. Measured on the built package, one process per sample, medians of 40 paired
runs:

|                                                 |                                      change |
| ----------------------------------------------- | ------------------------------------------: |
| a spec file that does **not** import them       |                               **−0.159 ms** |
| a spec file that **does** import `/dom-stubs`   |                                   +0.155 ms |
| a spec file that **does** import `/diagnostics` |                                   +0.069 ms |
| `dist`                                          | **−20.3 kB** of JS, −3.8 kB of declarations |

Both new entries are built standalone rather than chunked, which is what keeps the second row at one
extra module instead of four — chunked, the same measurement read **+0.62 ms**. So the trade is
per-file, not per-project: unless more than half your spec files import the DOM stubs, the suite is
ahead.

## 3. Every ESLint rule is an error

`configs.recommended` used to grade its nineteen rules `error` / `warn` / `off`. They are all
`error` now.

A `warn` is a finding a build does not stop for, so in a repository that does not read lint output it
is `off` with extra noise — and choosing that on your behalf was the part that was wrong. Which
findings block a merge is a project's call and one line of config either way, so the default is the
strict end and the [docs carry the dial](/utilities/eslint-plugin#tuning-it-for-your-project).

If the first run is red, three rules are worth looking at before the rest, because each can report on
code that is correct:

```js
export default [
  {
    files: ['**/*.spec.ts'],
    ...autoSpy.configs.recommended,
    rules: {
      ...autoSpy.configs.recommended.rules, // spread it, or a bare `rules` key replaces the whole map
      // decides on a layer installed in a setup file no spec imports — name that file
      'vitest-auto-spy/jasmine-namespace-without-entry': ['error', { setupModules: ['./test-setup'] }],
      // reports working bridge code — off until the migration off jasmine-auto-spies is finished
      'vitest-auto-spy/prefer-native-spy-api': 'off',
      // no option; it silences itself wherever it cannot read a file's providers in full, so turn it
      // off only for the files where a helper you call does the registering
      // 'vitest-auto-spy/no-unregistered-inject-spy': 'off',
    },
  },
];
```

To land it on a large existing suite without a red CI on day one, take everything as warnings first
and fix in batches — the recipe is in
[Tuning it for your project](/utilities/eslint-plugin#tuning-it-for-your-project).

## What did _not_ change

- No helper was removed, renamed or deprecated — two groups of them moved specifier, and that is all.
- No lint rule was added, removed or changed what it reports; only how loud it is.

## Coming from further back

[Upgrading to 3.0](/upgrading-3) is one line of `package.json` — the `vitest` peer range catching up
with what the types already required. [Upgrading to 2.0](/upgrading-2) is the one that matters if you
are still on 1.x: `methodsToSpyOn` stopped silently removing spies, which took one migrated component
from 147 failing tests to 4, and lazy method spies cut a wide suite from 257 ms / 425 MB to 27 ms /
35 MB.

- `nextWith`, `nextWithValues`, `nextOneTimeWith`, `throwWith`, `complete`, `observablePropsToSpyOn`
  and the `calledWith` chains behave identically.
- `rxjs` stays an optional peer dependency, imported by `vitest-auto-spy/rxjs` and
  `vitest-auto-spy/observer-spy` and by nothing else — now in the declarations as well as at
  runtime, which is what `scripts/check-dist.mjs` fails the build over.
- Angular, NestJS, React, Vue, Svelte, Bun and `node:test` entry points are unchanged.
