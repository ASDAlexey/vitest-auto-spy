---
title: Rstest
description: Run vitest-auto-spy on Rstest, the Rspack-powered test runner — a runnable example and how the Vitest-shaped mock surface maps.
---

# Rstest

The `vitest-auto-spy/rstest` entry runs the same core on Rstest's `rstest.fn()` / `rstest.spyOn()`.

```ts
import { createSpyFromClass } from 'vitest-auto-spy/rstest';

// rstest run
```

The public API is identical to the Vitest entry. Importing the entry registers the Rstest adapter;
the auto-spy helpers (`calledWith`, `resolveWith`, `nextWith`, …) are normalised, while native mock
methods stay the runner's own.

## A runnable example

Rstest ships `describe` / `it` / `expect` — import them from `@rstest/core`, or use the `rs` /
`rstest` globals with `globals: true`.

```js
// user.spec.ts
import { describe, expect, it } from '@rstest/core';
import { createSpyFromClass } from 'vitest-auto-spy/rstest';

class UserService {
  getName(id) {
    return `user-${id}`;
  }

  async load(id) {
    return `loaded-${id}`;
  }
}

describe('UserService spy', () => {
  it('returns per-argument values and resolves promises', async () => {
    const users = createSpyFromClass(UserService);

    users.getName.calledWith(7).mockReturnValue('seven');
    users.load.resolveWith('ok');

    expect(users.getName(7)).toBe('seven');
    await expect(users.load(1)).resolves.toBe('ok');
    expect(users.getName.mock.calls[0]).toEqual([7]);
  });
});
```

```bash
npx rstest run
```

## The native surface is Vitest-shaped

Rstest implements the Jest/Vitest mock API, so none of the [node:test differences](/runtimes/node#where-the-native-surface-differs)
apply. `spy.method.mock.calls[0]` is a bare argument array, the `mockReturnValue` family is native,
`mockClear()` / `mockReset()` behave like Vitest's, and accessor spies go through Rstest's own
`rstest.spyOn(obj, 'prop', 'get' | 'set')` — so `gettersToSpyOn` / `settersToSpyOn` need no
redefinition fallback. The normalised helpers are still the better habit: they read the same on
every runtime.

## `rstest.clearAllMocks()` sweeps the library spies

The library's method spies come from its own engine (the default since 4.1), not the runner's, so a
run-wide clear needs a bridge. Rstest walks every mock it created — called or not — and the entry
plants one sentinel mock whose `mockClear` / `mockReset` sweep the library's spies too. There is
nothing to enable: `rstest.clearAllMocks()`, `rstest.resetAllMocks()`, and the `clearMocks: true` /
`resetMocks: true` config keys all reach spies built by `createSpyFromClass`.

## What is not here yet

- The [`/setup`](/utilities/setup) entry — `setupAutoSpy()`, the fake-timer helpers, stray-rejection and
  stray-timer tracking — is wired to Vitest's hooks. On Rstest, import `vitest-auto-spy/rstest` once
  in your setup file; registering the adapter is the part a setup file is for.
- `trackNodeMocks()` is node:test-only. Rstest drops its mock registry between files, like Vitest
  and Bun, so there is nothing to track.

::: tip Which runtime
Rstest is young — 0.x at the time of writing. [Vitest](/runtimes/vitest) remains the zero-config
default; reach for this entry when the suite already runs on Rstest, which is typically an
Rspack-based project reusing its bundler config for tests.
:::
