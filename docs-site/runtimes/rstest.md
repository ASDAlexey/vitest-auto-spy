---
title: Rstest
description: Use vitest-auto-spy with Rstest, the Rspack-based test runner - a runnable example, how its mocks compare to Vitest and what is not supported yet.
---

# Rstest

Use the `vitest-auto-spy/rstest` entry when your tests run on [Rstest](https://rstest.rs), the test
runner built on the Rspack bundler. It has the same API as the Vitest entry and connects the spies to
Rstest's mocks, so `rstest.clearAllMocks()` and Rstest's matchers see them.

```ts
// greeter.test.ts
import { describe, expect, it } from '@rstest/core';
import { type Spy, createSpyFromClass } from 'vitest-auto-spy/rstest';

class UserService {
  getName(id: number): string {
    return `user-${id}`;
  }

  async load(id: number): Promise<string> {
    return `loaded-${id}`;
  }
}

// the code under test: receives UserService through its constructor
class Greeter {
  constructor(private readonly users: UserService) {}

  greet(id: number): string {
    return `Hello, ${this.users.getName(id)}!`;
  }

  async welcome(id: number): Promise<string> {
    return `Welcome, ${await this.users.load(id)}`;
  }
}

describe('Greeter', () => {
  it('greets the user the service returns', async () => {
    const users: Spy<UserService> = createSpyFromClass(UserService);
    const greeter = new Greeter(users);

    users.getName.calledWith(7).mockReturnValue('Ada'); // answers getName(7) only
    users.load.resolveWith('Ada'); // no calledWith: answers every call

    expect(greeter.greet(7)).toBe('Hello, Ada!');
    expect(await greeter.welcome(1)).toBe('Welcome, Ada');
    expect(users.getName).toHaveBeenCalledWith(7);
  });
});
```

```bash
npx rstest run
```

No setup file is required: importing from this entry registers everything. The example imports
`describe` / `it` / `expect` from `@rstest/core`.

To use them without imports, set `globals: true`. Then `rstest`, Rstest's mock utility (like `vi` in
Vitest), is a global too, with the short alias `rs`:

```ts
// rstest.config.ts
import { defineConfig } from '@rstest/core';

export default defineConfig({
  globals: true,
  clearMocks: true, // clear every mock before each test; spies from createSpyFromClass included
});
```

## The native surface is Vitest-shaped

Rstest's own mock methods on a spy work as on Vitest:

- `spy.method.mock.calls[0]` is a plain array of arguments;
- `mockReturnValue` and its relatives exist on the spy;
- `mockClear()` / `mockReset()` behave as on Vitest;
- `gettersToSpyOn` / `settersToSpyOn` work. These [`createSpyFromClass`](/core/create-spy-from-class)
  options turn a class's getters or setters into spies.

Still prefer the library helpers (`calledWith`, `resolveWith`, `nextWith`, …): they read the same on
every runner.

## `rstest.clearAllMocks()` sweeps the library spies

`rstest.clearAllMocks()`, `rstest.resetAllMocks()` and the `clearMocks: true` / `resetMocks: true`
config keys also clear spies built by `createSpyFromClass`. There is nothing extra to enable in this
library: turn the config keys on in `rstest.config.ts` if you want them, as above. How this works is
in [In depth](#in-depth).

## Beside this entry

These entries also work under Rstest, without Vitest installed:

- `vitest-auto-spy/console`: [`useConsoleSpies()`](/utilities/console) registers its hooks on
  Rstest's `beforeEach` / `afterEach` once this entry is imported. Its types do not name `vitest` either.
- `vitest-auto-spy/nestjs`: the Nest helpers build Rstest mocks. A
  [Nest test](/adapters/nestjs#any-runner) imports `createNestUnit` from `/nestjs` next to this entry.

Other entries (the root `vitest-auto-spy`, `/angular`, `/setup`, `/dom-stubs`, `/react`, `/vue`, …)
import `vitest`. Without Vitest installed, the run stops before any test with
`Cannot find package 'vitest' imported from …/node_modules/vitest-auto-spy/dist/<entry>.js`. Import
the factories from this entry instead. `npx vitest-auto-spy doctor` reports such an import as
[`vitest-entry-without-vitest`](/utilities/cli#vitest-entry-without-vitest) and names the entry to
use.

The types of this entry do not reference `vitest`, so a project without Vitest type-checks cleanly,
even with `skipLibCheck: false`. `Spy<T>` here has the same members as on Vitest,
except Vitest's `mockThrow`; `failWith()` does the same on every runner.

## What is not here yet

- **[`/setup`](/utilities/setup)** (`setupAutoSpy()`, the fake-timer helpers, stray-rejection and
  stray-timer tracking) works only with Vitest's hooks. Rstest has no replacement for it yet.

::: tip Which runtime
Rstest is still 0.x. [Vitest](/runtimes/vitest) remains the default. Use this entry when your tests
already run on Rstest, typically in an Rspack project that reuses its bundler config for tests.
:::

## In depth

- The library builds method spies itself, not with `rstest.fn()`. To make Rstest's clear and reset
  reach them, the entry registers one hidden Rstest mock that passes the call on.
- Accessor spies (`gettersToSpyOn` / `settersToSpyOn`) redefine the property; `rstest.spyOn` is not
  used.
- `trackNodeMocks()` from the `node:test` entry has no Rstest version and needs none: Rstest drops its
  mocks between files, like Vitest and Bun.
