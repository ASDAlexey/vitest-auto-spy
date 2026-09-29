---
title: Angular unit-test builder
description: Run specs that use vitest-auto-spy under ng test and the @angular/build unit-test builder - setup files, vi.mock rules, coverage, shards and code splitting.
---

# Angular unit-test builder

This page is for projects that run tests with `ng test` through Angular CLI's
`@angular/build:unit-test` builder. The builder bundles your specs before Vitest runs them, so `vi.mock`,
coverage, shards and `--changed` behave differently from a plain Vitest project. Start by putting the library's setup file in
the test target:

```jsonc
// angular.json
"test": {
  "builder": "@angular/build:unit-test",
  "options": {
    "setupFiles": ["src/test-setup.ts"]
  }
}
```

```ts
// src/test-setup.ts
import { registerResourceMatchers, registerSignalMatchers } from 'vitest-auto-spy/angular/matchers';
import { setupAutoSpy } from 'vitest-auto-spy/setup';

setupAutoSpy();
registerSignalMatchers();
registerResourceMatchers();
```

Then write specs as shown on the [Angular](/adapters/angular) page. The sections below cover what to
do when the builder gets in the way. `npx vitest-auto-spy doctor` checks most of them for you; see
[CLI](/utilities/cli).

## What the builder compiles

From `@angular/build` 22.2.0, the test program contains only:

- the spec files;
- the `providersFile` and the `setupFiles`;
- the `.d.ts` files `tsconfig.spec.json` includes;
- whatever those import.

A plain `.ts` file that only sits in the tsconfig `include` is no longer compiled. If it holds
`import 'vitest-auto-spy/rxjs'` or a `declare module` [type augmentation](/glossary), that
declaration disappears from every spec.

Move such a file into a setup file, a spec, or a `.d.ts`. A `.d.ts` with an augmentation needs an
`import` or `export {}`, so it stays an augmentation. Builders before 22.2.0 compile the whole
`include`.

## Module mocks under the unit-test builder

`vi.mock('@angular/core')` works under the builder, with `TestBed` and app code in the graph. Two
rules apply.

### The rule: a `vi.mock` factory must not use object spread

Write `Object.assign({}, actual, { … })` instead of `{ ...actual, … }` inside a `vi.mock` factory:

```ts
// ❌ fails
vi.mock('@angular/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@angular/core')>();

  return { ...actual, effect: (fn: () => void) => fn };
});

// ✅ the same mock, no spread
vi.mock('@angular/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@angular/core')>();

  return Object.assign({}, actual, { effect: (fn: () => void) => fn });
});
```

The builder always compiles object spread down to a helper function, whatever your
`.browserslistrc` says. The helper is defined inside the test bundle, and `vi.mock` factories are
moved to the very top of it, so the factory calls the helper before it exists. The error depends on
code splitting and mentions neither spread nor the factory:

| Code splitting | The error                                               |
| -------------- | ------------------------------------------------------- |
| on             | `Cannot access '__vi_import_1__' before initialization` |
| off            | `__spreadValues is not a function`                      |

### A relative path is blocked, permanently

The builder rejects `vi.mock('./thing')` on purpose. `vi.mock`, `vi.doMock`, `vi.importMock`,
`vi.unmock` and `vi.doUnmock` throw for any path that starts with `.` or `/`:

```text
The "vi.mock" and related methods are not supported for relative imports with the Angular
unit-test system. Please use Angular TestBed for mocking dependencies.
```

No build option changes that. Replace the dependency through `TestBed` providers instead, with
[`provideAutoSpy`](/adapters/angular#replace-a-service-provideautospy-and-injectspy).

::: danger A tsconfig path alias is silently ignored
`vi.mock('@app/thing')` does not start with `.` or `/`, so the builder does not throw. The mock is
ignored and the real module runs. The spec then fails on an assertion that looks like a bug in your
code. Replace the dependency through `TestBed` here too.
:::

### What the measurement does not cover

These rules come from a small test project: no components, templates, barrels or
`externalDependencies`, and jsdom rather than happy-dom. That project shows that
`vi.mock('@angular/core')` is not blocked in general, and that spread is what breaks the factory. It
does not promise that every mock of every module works in a large app. Nobody tried the `splitting`
option below on that project.

## When the unit-test build has code splitting off

**If you use `@angular/build` 22.1.5 or 22.1.6, upgrade to 22.1.7 or newer** and remove any
`"splitting": false` from the test target.

In that version range the builder turns esbuild code splitting **off**, with no option to turn it
back on. Every spec becomes its own bundle, and memory grows by hundreds of megabytes under
`--coverage` until the CI job is killed. The builder prints no warning.

A spread error that reads `__spreadValues is not a function` is a sign that splitting is off. That
is two separate problems: fix the error with `Object.assign` (see above), and fix the memory growth
with the upgrade.

- 22.1.7 brings back the `splitting` option, on by default.
- From 22.2.0 the option is deprecated and still on by default. `doctor` reports a leftover
  `"splitting"` key as
  [`angular-build-splitting-deprecated`](/utilities/cli#angular-build-splitting-deprecated).

How the problem is reported:

- `npx vitest-auto-spy doctor` reports
  [`angular-build-splitting-off`](/utilities/cli#angular-build-splitting-off).
- [`setupAutoSpy()`](/utilities/setup#_13-the-builder-version-that-eats-memory-named-in-the-run)
  prints one line to stderr per worker, naming the version and both fixes. It reads only
  `node_modules/@angular/build/package.json`. Turn it off with
  `setupAutoSpy({ angularBuildHint: false })`.

### The escape hatch, and why it is not shipped here

If you cannot upgrade from 22.1.5 or 22.1.6, the only way out is to patch the installed builder.
Below is a version-guarded `postinstall` script. It is yours to own once you paste it: this
repository neither runs nor tests it, and it depends on one literal string in the builder.

```js
// scripts/patch-angular-build.cjs — delete this once you are on @angular/build 22.1.7
const { readdirSync, readFileSync, statSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..', 'node_modules', '@angular', 'build');
const { version } = require(join(root, 'package.json'));
const [major, minor, patch] = version.split('.').map(Number);
const affected = major === 22 && minor === 1 && patch >= 5 && patch < 7;

if (!affected) {
  process.stdout.write(`@angular/build ${version} needs no patch\n`);
  process.exit(0);
}

const NEEDLE = 'disableCodeSplitting: true,';
let patched = 0;

const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);

    if (statSync(full).isDirectory()) {
      walk(full);
    } else if (full.endsWith('.js')) {
      const source = readFileSync(full, 'utf8');

      if (source.includes(NEEDLE)) {
        writeFileSync(full, source.split(NEEDLE).join('disableCodeSplitting: false,'));
        patched += 1;
      }
    }
  }
};

walk(join(root, 'src'));

// Fail loudly rather than silently doing nothing: the literal moving is the expected way this breaks.
if (patched === 0) {
  throw new Error(`@angular/build ${version}: "${NEEDLE}" not found — the patch needs revisiting`);
}
```

This package does not ship the patch and will not. A test library that rewrites another package's
files in `node_modules` is a supply-chain risk, and string surgery breaks silently when the builder
changes. The reasoning is on
[How the Angular helpers work](/adapters/angular-how-it-works#why-the-angular-build-patch-is-not-shipped).

## Coverage under the unit-test builder

::: tip Vitest 5 makes coverage runs much faster
From `@angular/build` 22.2.0 the builder runs on Vitest 5, and coverage runs take a third to a half
less time. Upgrade `vitest` and `@vitest/coverage-*` to 5 together; on Analog, use 2.7.5 or newer.
Older builders keep working on Vitest 4. Numbers:
[Performance → Vitest 5 under the Angular unit-test builder](/core/performance#vitest-5-under-the-angular-unit-test-builder).
:::

Two coverage settings look like configuration and do nothing under the builder. The run stays green
and a report is produced, just not the one you asked for. `npx vitest-auto-spy doctor` reports both.

**Put `coverageInclude` on the builder target, not in the Vitest config.** The builder runs Vitest
over a bundle, so coverage first matches your globs against the bundle files (`spec-*.js`,
`chunk-*.js`). The builder adds those patterns to its own `coverageInclude` for you, so `.ts` globs
work there. It does not add them to `coverage.include` in the runner config, where the same globs
match nothing and the report comes out **empty**. So set `coverageInclude` on the target and delete
`coverage.include` from the runner config. `doctor` reports a list left in the runner config as
[`coverage-include-misses-bundle`](/utilities/cli#coverage-include-misses-bundle).

```jsonc
// angular.json
"test": {
  "builder": "@angular/build:unit-test",
  "options": {
    "runnerConfig": "tools/vitest-runner.config.ts",
    "coverageInclude": ["libs/**/*.ts", "apps/**/*.ts"]
  }
}
```

**`coverage.all` no longer exists** (removed in Vitest 4). Untested files now appear in the report
only when an include list is set. Under the builder, that list is the target's `coverageInclude`. A
config from Vitest 3 with `all: true` and no include list reports only the files the run touched, with
no warning. `doctor` reports it as
[`coverage-all-removed`](/utilities/cli#coverage-all-removed).

**With tsconfig path aliases, prefer the `v8` provider.** When an include list is set,
`@vitest/coverage-istanbul` resolves untested files through Vite, not through the builder's aliases.
The first aliased import then stops the whole run:

```text
Error: Failed to resolve import "@workspace/api" from
"apps/app/src/main.server.ts?cache=…&vitest-uncovered-coverage=true". Does the file exist?
```

The package named there changes between runs; it is just the first unresolved import. `v8` drops
files it cannot parse with a warning and keeps the run green.

## Shards and changed-only runs under the unit-test builder

`ng test` passes no Vitest flags through. `test.repeats` and `test.shard` in the runner config still
reach Vitest. `--changed` and `--related` do not work, because Vitest sees the builder's bundles, not
your source files.

[`npx vitest-auto-spy ng-test`](/utilities/cli#ng-test-—-sharding-and-changed-only-runs-under-the-angular-builder)
does both through the builder's `--include`. From `@angular/build` 22.2, the builder compiles
only the specs that run:

```sh
npx vitest-auto-spy ng-test --shard 2/4
npx vitest-auto-spy ng-test --changed origin/main
```

## Coverage matching costs more than coverage

**On Vitest 4 or older, a long include list (`coverageInclude` under the builder) can make coverage slower, not faster.** The
fix is to upgrade to Vitest 5, which compiles the globs once. Under the unit-test builder, Vitest 5
needs `@angular/build` 22.2.0 or newer; on Analog, 2.7.5 or newer. `doctor` reports this as
[`coverage-include-recompiles-globs`](/utilities/cli#coverage-include-recompiles-globs), only on
Vitest older than 5.

The cause: `@vitest/coverage-v8` recompiles every glob for every file it checks. On a large
workspace, the final filtering step can take half of the coverage phase. Numbers:
[Performance](/core/performance).

### The fix is a provider wrapper, in your own config

If you stay on Vitest 4, wrap the v8 provider and compile the globs once. `coverage.provider:
'custom'` is a supported option:

```ts
// tools/coverage-provider.ts
import * as v8 from '@vitest/coverage-v8';
import { cleanUrl, slash } from '@vitest/utils/helpers';
import pm from 'picomatch';

export * from '@vitest/coverage-v8';

const workspaceRoot = slash(process.cwd()); // your repository root
const projectRoot = workspaceRoot; // or the absolute path of the project inside it

export async function getProvider() {
  const provider = await v8.getProvider();
  const original = provider.isIncluded.bind(provider);
  let match;

  provider.isIncluded = (filename) => {
    const { include, exclude, allowExternal } = provider.options ?? {};

    // A `--changed` run selects by its own file list, and a config with no `include` has nothing
    // to compile: the only two questions this wrapper genuinely cannot answer.
    if (!include) {
      return original(filename);
    }

    match ??= pm(include, { contains: true, dot: true, ignore: exclude });

    const path = slash(cleanUrl(filename));

    // Inline, NOT delegated — see the note below.
    if (!allowExternal && !path.startsWith(workspaceRoot) && !path.startsWith(projectRoot)) {
      return false;
    }

    return match(path);
  };

  return provider;
}
```

Point Vitest at it from your Vitest config (under the builder, the `runnerConfig` file):

```ts
// tools/vitest-runner.config.ts
coverage: {
  provider: 'custom',
  customProviderModule: './tools/coverage-provider.ts',
}
```

The report is the same as before, with the same files and percentages.

::: danger Do not hand the `allowExternal: false` case back to the original method
`@angular/build:unit-test` sets `allowExternal: false`, so every call would take the slow path, and
the wrapper would seem to do nothing. Test it inline, with two `startsWith` checks against the
workspace and project roots.
:::

Two more details:

- `getProvider()` runs **before** Vitest calls `initialize()`, so `provider.options` does not exist
  yet. Build the matcher lazily, on the first call.
- Normalise the filename exactly as the original does, with `slash(cleanUrl(filename))` from
  `@vitest/utils/helpers`. Otherwise the two disagree on some paths.

### Narrowing the scope is not only about speed

GitLab ignores a cobertura report over **10 MB**, silently: the job is green, the percentages are in
the log, and the merge request shows no line coverage. An include list (`coverageInclude` under the builder)
keeps the report smaller, which can bring it under that limit.
