---
title: Compatibility
description: Why each minimum version is what it is, which module formats ship, and how CI checks the oldest supported versions.
---

# Compatibility

This page explains why each minimum version on [Installation](./installation) is what it is. You need
it when an upgrade or a pinned version clashes with the ranges below. For the list of what to
install, [Installation](./installation#what-you-need) is enough.

| Dependency | Minimum | Why, in one line                                                                                |
| ---------- | ------- | ----------------------------------------------------------------------------------------------- |
| Vitest     | 2.1     | the spy types use Vitest's own `Mock` type, which gained `settledResults` in 2.x                |
| rxjs       | 7.2     | the first version that exports every operator the package uses from the root `rxjs` path        |
| Angular    | 20      | the first version with `provideZonelessChangeDetection`, and the oldest Angular still supported |
| Node.js    | 22      | 18 and 20 are end-of-life, and every supported Vitest already needs more                        |
| TypeScript | 4.7     | the typed helpers need it; plain JavaScript works without types                                 |

None of the ranges has an upper bound.

## Vitest 2.1

The typed `spy.method.mock.settledResults` comes from Vitest's own `Mock` type. `@vitest/spy` added
`settledResults` in 2.0, and 2.1 is where the 2.x line settled.

The runtime helpers still run on older Vitest, and on `bun:test` and `node:test` the library adds
`settledResults` itself. Only the types need more: on a Vitest older than 2.1 they no longer match,
so the range starts at 2.1.

`vitest` is an optional peer. A project that imports only `vitest-auto-spy/bun` or
`vitest-auto-spy/node` does not have to install the Vitest runner. A project that has Vitest is still
held to `>=2.1`.

These entry points ship types that do not name `vitest`: `/node`, `/bun`, `/bun-angular`, `/rstest`,
`/jasmine-compat`, `/angular-router`, `/console`, `/nestjs`, `/observer-spy` and `/rxjs`. A project
without Vitest type-checks them even with `skipLibCheck: false`.

`Spy<T>` is one type on every entry point, but its method spies come in two flavours:

- **Vitest's own `MockInstance`**, when any file that `tsconfig.json` type-checks imports an entry
  that loads Vitest: `vitest-auto-spy`, `/angular`, `/angular/doubles`, `/react`, `/vue`, `/svelte`,
  `/setup`, `/jasmine` or `/dom-stubs`.
- **A runner-free mock type** otherwise. It has the same members except Vitest's `mockThrow`. To
  make a spy throw on any runner, use the library's `failWith(error)`.

**Common mistake:** a Vitest test set that imports only `/nestjs`, `/observer-spy` or `/rxjs` gets the
runner-free type, so `mockThrow` is missing and a spy does not fit a `MockInstance` annotation. Add
this line to any file that `tsconfig.json` includes, such as a spec or a `.d.ts` file:

```ts
import type {} from 'vitest-auto-spy';
```

## rxjs 7.2

The Observable layer builds its subjects from six operators: `concatMap`, `delay`, `switchMap`,
`take`, `takeUntil` and `takeWhile`. They used to come from `rxjs/operators`, an old deep path that
rxjs 8 removes. The package now imports them from the root `rxjs` path. rxjs added them there in
7.2, checked against rxjs 7.2.0's own type declarations.

`firstValueFrom` exists since 7.0 and did not change. Angular 16 to 22 accept rxjs `^6.5.3 || ^7.4.0`,
so an Angular project on rxjs 7 already has 7.4 or newer. Only a project on rxjs 6, `7.0` or `7.1`
has to upgrade rxjs, to 7.2 or newer.

## Angular 20

A missing value import is a link error: the whole entry point fails to load, not one helper. So the
floor is set by the Angular functions the package imports by name.

- **`provideZonelessChangeDetection` exists from Angular 20.** In 18 and 19 it was called
  `provideExperimentalZonelessChangeDetection`; in 16 and 17 it did not exist. The
  `vitest-auto-spy/bun-angular` preload imports it by name. Below 20, `bun test` fails while loading
  the preload, before the first spec file.
- **Nothing private is imported by name.** `runEffect()`, `mockSignalProp` and the signal matchers
  used to import Angular's private `ɵSIGNAL` symbol. They now look it up at run time, so an Angular
  without that export cannot break the `/angular` entry.

Angular 20 is also the oldest Angular that Angular itself still supports. Angular 19 reached end of
life on 2026-05-19, and 18, 17 and 16 before it. So the floor drops nothing that still gets fixes.
The range has no upper bound on purpose: a bound would force a release for every Angular major and
give `ERESOLVE` to anyone who upgrades first.

`@angular/platform-browser` is a declared peer. The directive matchers in
`vitest-auto-spy/angular/matchers` import `By` from it, and the Bun preload imports
`platformBrowserTesting` and `BrowserTestingModule`. With npm's flat `node_modules` it resolved anyway,
because every Angular workspace has it. With pnpm's isolated layout it did not resolve at all, so it
is now declared. Those two imports exist since Angular 16, so they do not raise the floor. What
changed in 20 is only that `@angular/platform-browser-dynamic/testing` stopped being the recommended
path.

Signal forms (`vitest-auto-spy/signal-forms`) need Angular 22, where `@angular/forms` ships them.
`@angular/forms` is still declared from Angular 20 (`>=20.0.0`), like `@angular/core`.

## Optional peers

Every peer dependency is optional. You install only the ones for the entry points you import:

| Peer                        | Range      | Needed by                                                              |
| --------------------------- | ---------- | ---------------------------------------------------------------------- |
| `vitest`                    | `>=2.1.0`  | the root entry and every entry that runs on Vitest                     |
| `rxjs`                      | `>=7.2.0`  | `vitest-auto-spy/rxjs`, `/angular-router`, `/angular/doubles`          |
| `@angular/core`             | `>=20.0.0` | every Angular entry point                                              |
| `@angular/common`           | `>=20.0.0` | `vitest-auto-spy/angular-http`, `/angular-router`                      |
| `@angular/platform-browser` | `>=20.0.0` | `vitest-auto-spy/angular/matchers`, `/angular/doubles`, `/bun-angular` |
| `@angular/compiler`         | `>=20.0.0` | `vitest-auto-spy/angular/matchers`, `/bun-angular`                     |
| `@angular/router`           | `>=20.0.0` | `vitest-auto-spy/angular-router`                                       |
| `@angular/forms`            | `>=20.0.0` | `vitest-auto-spy/signal-forms`, which also needs Angular 22 to work    |
| `@rstest/core`              | `>=0.11.0` | `vitest-auto-spy/rstest`                                               |

A strict installer such as pnpm refuses to resolve an import that nothing declares. That is why
every package the code imports is declared. They are optional because each is needed only by the
entry points in its row. An entry point that is not in the table, such as `/bun`, `/node` or
`/nestjs`, needs no peer from this list.

`@angular/common` is optional for a reason of its own. `vitest-auto-spy/angular` must keep loading in
a project that has `@angular/core` but not `@angular/common`. A static import of `@angular/common`
inside the `/angular` entry would break that for everyone, including the many test sets that never
test an HTTP call. So the HTTP helpers live in their own entry point, `vitest-auto-spy/angular-http`,
and only the entries that need `@angular/common` import it. rxjs is kept out of the core the same
way: the Observable helpers live behind `vitest-auto-spy/rxjs`.

## Node.js 22

Node 18 and 20 are past end of life, and every supported runner needs more:

- Vitest 4 declares `^20.0.0 || ^22.0.0 || >=24.0.0`. The Vite 7 it installs needs
  `^20.19.0 || >=22.12.0`. On Node 18 the run fails with `TypeError: crypto.hash is not a function`
  before any spec loads.
- Vitest 5 needs `^22.12.0 || ^24.0.0 || >=26.0.0`. It also declares `@types/node` as
  `^22.0.0 || >=24.0.0`. That peer is optional, but npm checks it once installed, so a workspace on
  `@types/node` 20 gets `ERESOLVE`.

The Angular CLI's builder has its own range: `@angular/build` 22 needs Node
`^22.22.3 || ^24.15.0 || >=26.0.0`.

CI runs Node 22, 24 and 26. The published code targets ES2022. Which Node version runs a test set
fastest is measured in [Performance](./performance#which-node-version).

### `using` on Node 22

`using spy = createSpyFromClass(UserService)` resets the spy when the block ends. The
`[Symbol.dispose]()` method is the library's; the `using` syntax is your toolchain's.

- **Transpiled code works on every supported Node.** esbuild and `tsc` rewrite `using` into plain
  calls, which is how Vitest, Bun and Rstest run your specs.
- **Untranspiled code needs Node 24.** An untranspiled `.js` file with `using` is a `SyntaxError` on
  Node 22. If your setup does not transpile, call `spy[Symbol.dispose]()` or `resetAutoSpy(spy)`
  yourself; `resetAutoSpy` comes from the same entry point as `createSpyFromClass`.
- **The package supplies `Symbol.dispose` on Node 22.** This is about transpiled `using`, not the
  syntax. The rewritten `using` reads
  `Symbol.dispose` from the global `Symbol`. Node 24 has it in every realm (a realm is one set of globals). Node 22 adds it only to
  the main realm, as `Symbol.for('nodejs.dispose')`. Vitest's `jsdom` and `happy-dom` environments
  run your specs in a separate `vm` realm where it is missing, so `using` would throw
  `TypeError: Symbol.dispose is not defined.`

Importing the package defines `Symbol.dispose` in that realm. It uses the same registry symbol Node
uses, so the key is identical in every realm of the process. It is defined only where it is missing,
non-enumerable and configurable; a realm that already has `Symbol.dispose` is left as it was.

## ESM and CommonJS

The package ships ESM with bundled `.d.ts` types. Two entry points also ship a CommonJS build:

- `vitest-auto-spy/node`, for a `node --test` test set written in CommonJS;
- `vitest-auto-spy/eslint-plugin`, for a CommonJS `eslint.config.cjs`.

Everything else is ESM only. A `require()` of a Vitest-based entry could never work, because Vitest
refuses to be required: `Vitest cannot be imported in a CommonJS module using require()`. Test
runners load ESM natively, so nothing is lost. Dropping that unreachable output made the published
package about half the size. Current package and import sizes are in [Performance](./performance).

In a CommonJS ESLint config, `require` is the documented call:

```js
// eslint.config.cjs
const autoSpy = require('vitest-auto-spy/eslint-plugin');

module.exports = [{ files: ['**/*.spec.ts'], ...autoSpy.configs.recommended }];
```

`require('vitest-auto-spy/eslint-plugin')` returns the plugin object itself, and its `.d.cts` types
say exactly that (`export =`). So in an `eslint.config.cts`, `autoSpy.default.rules` is a type error
instead of code that compiles and then throws.

## TypeScript without rxjs

No type the package ships names an rxjs type. A project without rxjs neither installs it nor loads
its declarations into the TypeScript program. Before 4.0.0 every `import { createSpyFromClass }`
brought in 189 rxjs `.d.ts` files, and rxjs had to be installed even for a test set with no
Observables. See [Upgrading to 4.0](/upgrading-4).

## `vitest-auto-spy/package.json`

The package manifest is in the export map, so `vitest-auto-spy/package.json` resolves. Tools that read
a dependency's `package.json` through Node's resolver (Storybook, Nx, a Renovate helper) get the file
instead of `ERR_PACKAGE_PATH_NOT_EXPORTED`.

## The plural alias `vitest-auto-spies`

[`vitest-auto-spies`](https://www.npmjs.com/package/vitest-auto-spies) is a thin alias package. It
re-exports this one, entry point for entry point, so a typo installs the same code. Prefer the
singular name: the alias is generated from it and only follows it.

## How CI checks the oldest versions

The minimums are tested, not only declared. Besides the usual test matrix, CI packs the tarball and
installs it into a fresh project against four runner and rxjs pairs:

1. the declared floor of both: Vitest 2.1 with rxjs 7.2;
2. Vitest 3 with rxjs 7.8;
3. Vitest 4 with rxjs 7.8;
4. the current release of both.

Each pair runs a spec against the published build and type-checks a probe file against the published
types.
