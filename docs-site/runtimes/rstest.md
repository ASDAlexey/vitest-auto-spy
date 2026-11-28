---
title: Rstest
description: Create typed spies in Rstest and see what to change when moving tests from Vitest.
---

# Rstest

If your tests run on [Rstest](https://rstest.rs), the test runner built on Rspack, import
`createSpyFromClass` from `vitest-auto-spy/rstest`. To try it, save this as `greeter.test.ts`.
The test uses a spy in place of `UserService` and checks what `Greeter` does with its answers.

```ts
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

    users.getName.calledWith(7).mockReturnValue('Ada');
    users.load.resolveWith('Ada');

    expect(greeter.greet(7)).toBe('Hello, Ada!');
    expect(await greeter.welcome(1)).toBe('Welcome, Ada');
    expect(users.getName).toHaveBeenCalledWith(7);
  });
});
```

Run the test:

```bash
npx rstest run
```

The test passes the spy to `Greeter`'s constructor. Only `getName(7)` returns `'Ada'`; `load`
resolves to `'Ada'` for any arguments.

If you're moving tests from Vitest, change the spy imports to `vitest-auto-spy/rstest` and import
`describe`, `it`, and `expect` from `@rstest/core`. The library API is the same as on Vitest.
The import connects the spies to Rstest's matchers and mock utilities; you don't need a setup file.

To use `describe`, `it`, and `expect` without imports, set `globals: true` in `rstest.config.ts`.
This also makes `rstest` (Rstest's equivalent of Vitest's `vi`) and its short alias `rs` global.

```ts
// rstest.config.ts
import { defineConfig } from '@rstest/core';

export default defineConfig({
  globals: true,
  clearMocks: true,
});
```

## The native surface is Vitest-shaped

You can use familiar Vitest mock methods and properties on Rstest spies:

- `spy.method.mock.calls[0]` is an array of arguments.
- Spies have `mockReturnValue` and related methods.
- `mockClear()` and `mockReset()` behave as on Vitest.
- The [`createSpyFromClass`](/core/create-spy-from-class) options `gettersToSpyOn` and
  `settersToSpyOn` let you spy on a class's getters and setters.

Prefer library helpers such as `calledWith`, `resolveWith`, and `nextWith` if you want the same code
on every runner.

## `rstest.clearAllMocks()` sweeps the library spies

`rstest.clearAllMocks()` and `rstest.resetAllMocks()` include spies from `createSpyFromClass`.
To clear or reset all mocks before each test, set `clearMocks: true` or `resetMocks: true` in
`rstest.config.ts`. You don't need any extra library setup. See [In depth](#in-depth) for how it works.

## Beside this entry

These imports also work on Rstest without installing Vitest:

- `vitest-auto-spy/console`: After you import `vitest-auto-spy/rstest`,
  [`useConsoleSpies()`](/utilities/console) uses Rstest's `beforeEach` and `afterEach` hooks.
  The `/console` types don't reference `vitest`.
- `vitest-auto-spy/nestjs`: The Nest helpers create Rstest mocks. In a
  [Nest test](/adapters/nestjs#any-runner), import `createNestUnit` from `/nestjs` alongside
  `vitest-auto-spy/rstest`.

The root `vitest-auto-spy` import and entries such as `/angular`, `/setup`, `/dom-stubs`, `/react`,
and `/vue` import `vitest`. If Vitest isn't installed, the run stops before the first test with
`Cannot find package 'vitest' imported from …/node_modules/vitest-auto-spy/dist/<entry>.js`.
Import the spy factories from `vitest-auto-spy/rstest` instead. `npx vitest-auto-spy doctor` flags the
wrong import as [`vitest-entry-without-vitest`](/utilities/cli#vitest-entry-without-vitest) and tells
you which entry to use.

The `/rstest` types don't reference `vitest`, so type checking works without Vitest, even with
`skipLibCheck: false`. `Spy<T>` has the same members as on Vitest except for Vitest's `mockThrow`.
Use `failWith()` for the same behavior on every runner.

## What is not here yet

**[`/setup`](/utilities/setup)** works only with Vitest's hooks. Rstest has no replacement yet for
`setupAutoSpy()`, fake-timer helpers, or tracking stray promise rejections and timers.

::: tip Which runtime
Rstest is still on version 0.x. [Vitest](/runtimes/vitest) remains the default. Use `/rstest` if your
tests already run on Rstest, typically to reuse your project's Rspack config for tests.
:::

## In depth

- The library creates method spies without `rstest.fn()`. It registers one hidden Rstest mock to
  forward clear and reset calls to the spies.
- `gettersToSpyOn` and `settersToSpyOn` redefine the property instead of calling `rstest.spyOn`.
- `trackNodeMocks()` is specific to the `node:test` entry. Rstest doesn't need it because it drops
  mocks between test files, as Vitest and Bun do.
