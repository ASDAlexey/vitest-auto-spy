---
title: Vitest
description: Use vitest-auto-spy on Vitest with no configuration, add an optional setup file, and handle Vitest 5, isolate false, sharding and browser mode.
---

# Vitest

On Vitest you import from `vitest-auto-spy` and write the test. There is nothing to configure: the
import connects the library to Vitest's mocks on its own. Use this page when your project runs Vitest and
you want the first spec, a setup file, or an answer to a Vitest-specific question.

```ts
// user.service.ts: export class UserService { getName(id: number): string { … } }
// greeter.ts:      export class Greeter { constructor(private users: UserService) {} greet(id: number) { … } }
import { beforeEach, describe, expect, it } from 'vitest';
import { type Spy, createSpyFromClass } from 'vitest-auto-spy';

import { Greeter } from './greeter';
import { UserService } from './user.service';

describe('Greeter', () => {
  let users: Spy<UserService>;
  let greeter: Greeter;

  beforeEach(() => {
    users = createSpyFromClass(UserService); // every method is now a spy
    greeter = new Greeter(users);
  });

  it('greets the name the service returns', () => {
    users.getName.calledWith(1).mockReturnValue('Ada');

    expect(greeter.greet(1)).toBe('Hello, Ada!');
    expect(users.getName).toHaveBeenCalledWith(1);
  });
});
```

A _spy_ is a stand-in function: it records every call and returns what you set. `createSpyFromClass`
reads the class and gives you an object where every method is a spy. Vitest's own mock methods
(`mockReturnValue`, `mock.calls`, `toHaveBeenCalledWith`) work on it as usual. `calledWith(1)` sets
the answer for that argument only; a call with any other argument returns `undefined`. More helpers
like it: [Control helpers](/core/control-helpers).

That example is the whole spec: no setup file, no plugin, no `vitest.config.ts` change. For Angular,
import from `vitest-auto-spy/angular` instead; see [The Angular subpath](#the-angular-subpath).

## What belongs in the setup file

A setup file is optional. Two things apply to the whole run, so you write them once there instead of in
every spec:

```ts
// vitest.setup.ts
import 'vitest-auto-spy/rxjs';

import { setupAutoSpy } from 'vitest-auto-spy/setup';

setupAutoSpy();
```

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./vitest.setup.ts'],
  },
});
```

- **`import 'vitest-auto-spy/rxjs'`** turns on the Observable helpers (`nextWith`,
  `observablePropsToSpyOn`) in every spec. It needs `rxjs` installed. Without it, the first `nextWith`
  throws a message that names this import. See [RxJS](/runtimes/rxjs).
- **[`setupAutoSpy()`](/utilities/setup)** does two things by default:
  - after every test, it undoes properties patched with `mockReadonlyProp` and the other `mock*Prop`
    helpers, so a patch cannot leak into the next test;
  - it stops the run if `node_modules` holds two copies of `vitest-auto-spy`.

  More guards are options you turn on, for example `setupAutoSpy({ strayTimers: true, restoreMocks: true })`.
  The full list is on [Setup](/utilities/setup).

Angular projects often add a third line, `registerSignalMatchers()` from
`vitest-auto-spy/angular/matchers`, for [signal matchers](/adapters/angular) such as
`toHaveSignalValue`.

## Vitest 5

**One install covers Vitest 2.1 through 5.x.** The peer range is `>=2.1.0`. There is no separate
major, no `@next` tag and no second type entry for Vitest 5. A monorepo with one app on Vitest 4 and
another on Vitest 5 uses the same `vitest-auto-spy` version, and a spec moves between them unchanged.

**Handled for you.** Two Vitest 5 changes affect spy libraries, and this library already covers both:

- **`vi.clearAllMocks()` and `clearMocks: true`** clear the spies this library creates, the same way
  they clear `vi.fn()`.
- **Matcher types.** Vitest 5 changed the `Matchers` interface from `Matchers<T>` to `Matchers<R, T>`.
  The bundled matchers (`toHaveFocus`, `toHaveSignalValue`, `toBeLoading`, `toHaveResourceValue`,
  `toHaveResourceError`, `toHaveDirectiveApplied` and the jasmine set) type-check on both majors. You
  do not reference an extra `.d.ts`.

How much faster Vitest 5 runs: see
[Performance → Vitest 5 under the Angular unit-test builder](../core/performance#vitest-5-under-the-angular-unit-test-builder).

**May need an edit on your side.** Two other Vitest 5 changes can touch your specs. Both are in the
next two sections.

### The one thing that can still break your specs

Vitest 5 turns `clearMocks` on by default, so `vi.clearAllMocks()` runs before every test. This is a
Vitest change, not a change in this library. It breaks one pattern: a test that checks a call made
in an _earlier_ test or in `beforeAll`. That test now sees zero calls.

Count the call in a plain variable instead of reading the spy's history:

```ts
let initCalls = 0;
const init = vi.fn(() => {
  initCalls += 1;
});

beforeAll(() => {
  install({ init }); // install: your own code under test
});

it('asked once for the whole file', () => {
  expect(initCalls).toBe(1); // not expect(init).toHaveBeenCalledTimes(1)
});
```

If you prefer not to touch the specs, set `clearMocks: false` in `vitest.config.ts`. That restores
the Vitest 4 behaviour.

### The one feature that needs a line changed

This only matters if you use `setupAutoSpy({ pruneMockRegistry: true })`.

A _long-lived mock_ is created once in a shared fixture file and used by many spec files. The option
remembers each such mock's implementation. If a stray `vi.resetAllMocks()` empties the mock, the
option restores the implementation. On Vitest 4 the option finds long-lived mocks by itself. On
Vitest 5 it cannot: mark each one with `keepMockRegistered`, otherwise the mock stays empty after a
reset. The
mark works on every Vitest version:

```ts
// fixtures/logger.mock.ts: imported by many spec files
import { vi } from 'vitest';
import { keepMockRegistered } from 'vitest-auto-spy/setup';

export const logger = { channel: keepMockRegistered(vi.fn().mockReturnThis()), info: vi.fn() };
```

## Isolation

By default Vitest runs each spec file in a fresh environment. A leftover property patch, or a spy
kept in a module-level variable, disappears with its file.

You can turn isolation off with `isolate: false` in `vitest.config.ts` to make the run faster. Then
leftovers from one file reach the next file. `setupAutoSpy()` undoes patched properties by default. For
the rest, turn on `restoreMocks: true` and `strayTimers: true`. This package runs its own tests in both modes in CI.

```ts
// vitest.config.ts: the mode to be careful in
export default defineConfig({
  test: {
    isolate: false,
    setupFiles: ['./vitest.setup.ts'], // now doing real work
  },
});
```

For the guards worth turning on in this mode, see [Setup](/utilities/setup).

Three more things behave differently under `isolate: false`:

- **With the Analog plugin, name the pool.** `@analogjs/vite-plugin-angular` sets `test.pool` to
  `vmThreads` by default. A VM pool gives every file a fresh context whatever `isolate` says, so
  `isolate: false` then shares nothing. Set `pool: 'threads'` (or `'forks'`) yourself.
- **`vi.resetModules()` resets the `TestBed` too.** It loads `@angular/core/testing` again for every
  later file of the worker. `setupTestBed()` from Analog remembers on `globalThis` that it already
  ran, so it skips the new copy, and those files fail with
  `Cannot read properties of null (reading 'ngModule')`. In the setup file, initialise the `TestBed`
  again when `getTestBed().platform` is `null`, or remove the `vi.resetModules()`. See
  [Two copies of `@angular/core/testing`](/adapters/angular-troubleshooting#two-copies-of-angular-core-testing).
- **`vi.mock` reaches only modules loaded after it.** A module that an earlier file already imported
  keeps its real dependency. A spec that mocks one takes a fresh module graph with
  `vi.hoisted(() => vi.resetModules())` and drops it in `afterAll(() => vi.resetModules())`.

### A shared `TestBed` patch outlives the file that asked for it

**Symptom:** specs pass locally with `isolate: false`, then fail in CI with
`NG0201: No provider found`, in files nobody changed.

**Cause:** a setup file patches `TestBed.configureTestingModule` once per worker to add a provider.
With `isolate: false` the patch stays for every later file in that worker. Specs that never declared
the provider still pass, because a neighbour added it. CI runs are usually isolated (a coverage run forces isolation), and
there those specs fail.

**What to do:** run the whole suite once with isolation on before you trust a shared `TestBed` patch.
Declare the provider in every spec that needs it.

### A load-time failure is reported against every file in the worker

**Symptom:** the run reports many failed _files_ but zero failed _tests_, and the list changes on
every run.

**Cause:** one file throws while its imports load. That kills the worker, and Vitest marks every file
the worker was running as failed. The count depends on which files shared that worker. One unchanged
project reported 0, 95, 104 and 151 failed files in four runs, with no file common to all four lists.

Vitest does not name the culprit. Vitest 4 prints the error once, with no stack and no module name. The
`json` reporter shows the same bare message with `assertionResults: []`.

**What to do:**

> Fix only the files that failed on their **own** assertions, then run again.

The other files in the list are bystanders. The next run shows which failures were real.

## Sharding in CI

To split a large suite across CI machines, use three Vitest flags:

- `--shard=<index>/<count>` picks the files for each machine.
- `--reporter=blob` saves each machine's results to a file (a _blob_).
- `--merge-reports` combines all blobs into one report and one coverage map.

Vitest shards by file, and `setupAutoSpy()` also works per file. No setting of this package changes
when you shard.

**Check coverage thresholds only in the merge job.** Each shard covers only its own files. A suite at
100 % shows 50 % on shard 1 of 2, and the threshold fails the shard. Turn thresholds off when
`--shard` is on the command line:

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';

const sharded = process.argv.some((arg) => arg.startsWith('--shard'));

export default defineConfig({
  test: {
    coverage: {
      enabled: true,
      provider: 'istanbul',
      thresholds: sharded ? undefined : { lines: 90, branches: 90, functions: 90, statements: 90 },
    },
  },
});
```

```yaml
# .github/workflows/test.yml
jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        shard: [1, 2, 3, 4]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: npm }
      - run: npm ci
      - run: npx vitest run --shard=${{ matrix.shard }}/4 --reporter=default --reporter=blob
      - uses: actions/upload-artifact@v4
        if: ${{ !cancelled() }}
        with:
          name: blob-${{ matrix.shard }}
          path: .vitest/blob
          include-hidden-files: true
          retention-days: 1

  merge:
    needs: test
    if: ${{ !cancelled() }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: npm }
      - run: npm ci
      - uses: actions/download-artifact@v4
        with:
          pattern: blob-*
          path: .vitest/blob
          merge-multiple: true
      - run: npx vitest --merge-reports --reporter=default
```

Why each line is there (checked against Vitest 5.0):

| Line                                           | Without it                                                                                                                                                                           |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `path: .vitest/blob`                           | Vitest 5 writes blobs here and `--merge-reports` reads from here. Vitest 4 used `.vitest-reports/`; an old workflow uploads an empty folder.                                         |
| `include-hidden-files: true`                   | `.vitest` starts with a dot, `upload-artifact` skips it, and the merge job finds nothing.                                                                                            |
| `--reporter=default` next to `--reporter=blob` | the shard log shows only the blob's path, not the test results.                                                                                                                      |
| <code v-pre>if: ${{ !cancelled() }}</code>     | a failed shard uploads nothing, and the merged report has a hole instead of the failure.                                                                                             |
| `npm ci` in the merge job                      | `--merge-reports` runs no tests, but it loads the config and the coverage provider. It also rejects blobs from another Vitest version, so every job installs from the same lockfile. |

Mark the merge job as required. It fails when any shard has a failed test or when a threshold is
missed.

## Browser mode: module exports are read-only

**Symptom:** after you switch to [browser mode](https://vitest.dev/guide/browser/), a spec that was
green under jsdom or happy-dom fails on its first export spy:

```text
Cannot spy on export "load". Module namespace is not configurable in ESM.
```

**Cause:** `vi.spyOn(api, 'load')` on `import * as api from './api'` patches a module's exports. In
Node, Vitest loads modules itself and allows that. In the browser, modules load natively and their
exports are sealed. Angular suites hit this when they turn on the `browsers` option of
`@angular/build:unit-test`.

**What to do:** replace the class instead of the module export. None of these patch a module export,
so they work in browser mode unchanged:

- `createSpyFromClass(Api)` reads `Api.prototype` and returns a new object.
- `provideAutoSpy(Api)` hands that object to Angular DI.
- `vi.spyOn(Api.prototype, 'load')` patches a prototype, which is an ordinary object.

For a plain function exported from a module, use Vitest's `vi.mock('./api', { spy: true })`. It keeps
the real implementations and turns every export into a spy. Then
[`assertMocked`](/utilities/module-mocks) confirms that the mock applied.

**Also:** even in Node, a spy on a module export misses calls made from inside that module.

## The Angular subpath

An Angular suite imports from `vitest-auto-spy/angular`. It connects to Vitest the same way and adds
the `TestBed` helpers:

```ts
import { injectSpy, provideAutoSpy, renderShallow, stable } from 'vitest-auto-spy/angular';
```

Your Vitest setup must compile Angular, for example `@analogjs/vite-plugin-angular` plus a
`setupTestBed()` call, or the Angular CLI's `@angular/build:unit-test` builder.

**Common mistake:** with `@angular/build` 22.2, Analog packages older than 2.7.5 stop the run at
startup with `TypeError: cache.has is not a function`. Update Analog to 2.7.5 or newer;
[`doctor` reports it](/utilities/cli#analog-behind-angular-build).

Next: [Angular](/adapters/angular), and [Angular on Bun](/runtimes/bun-angular) for the same suite
under `bun test`.

## In depth

**How the library connects to Vitest.** The core does not depend on a test runner. Importing
`vitest-auto-spy` registers an _adapter_: the small piece that ties the library to the runner's
mocks. On Vitest the library builds its own spies and registers them with Vitest, so
`vi.clearAllMocks()`, `mock.calls` and `toHaveBeenCalledWith` treat them as Vitest mocks. Other runners have their own entry points
([Bun](/runtimes/bun), [node:test](/runtimes/node), [Rstest](/runtimes/rstest)). The library's helpers
(`calledWith`, `resolveWith`, `nextWith`) behave the same everywhere; native mock methods stay the
runner's own.

**Why `clearAllMocks` still clears these spies on Vitest 5.** Vitest 5 keeps its registered mocks
behind `WeakRef`s and clears only those called since the last clear. A spy engine other than `vi.fn()` must register
itself so that clear finds it. This library's own spy engine does.

**Why the matchers type-check on both majors.** TypeScript refuses to merge a declaration whose type
parameter list differs. The bundled matchers therefore declare themselves on Chai's `Assertion`,
which has no type parameters in either major.
