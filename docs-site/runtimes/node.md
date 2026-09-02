---
title: node:test
description: Run vitest-auto-spy on Node's built-in test runner — a runnable example and how node:test's native mock surface differs.
---

# node:test

The `vitest-auto-spy/node` entry runs the same core on `node:test`'s `mock.fn()`.

```ts
import { createSpyFromClass } from 'vitest-auto-spy/node';

// node:test
```

The public API is identical to the Vitest entry. Importing the entry registers the `node:test`
adapter; the auto-spy helpers (`calledWith`, `resolveWith`, `nextWith`, …) are normalised, while
native mock methods stay the runner's own.

## A runnable example

`node:test` ships no `expect`, so pair it with `node:assert` — the spy surface is the same either
way.

```js
// user.test.mjs
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createSpyFromClass } from 'vitest-auto-spy/node';

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

    assert.equal(users.getName(7), 'seven');
    assert.equal(await users.load(1), 'ok');
    assert.deepEqual(users.getName.mock.calls[0].arguments, [7]);
  });
});
```

```bash
node --test
```

## Where the native surface differs

`node:test`'s mock is not Jest-compatible, and this is the one place that shows through. The
auto-spy helpers hide it; reading the raw mock does not.

| What you want              | Vitest / Bun                        | `node:test`                                  |
| -------------------------- | ----------------------------------- | -------------------------------------------- |
| Recorded calls             | `spy.method.mock.calls[0]` → args   | `spy.method.mock.calls[0].arguments`         |
| Replace the implementation | `spy.method.mockImplementation(fn)` | `spy.method.mock.mockImplementation(fn)`     |
| Reset                      | `spy.method.mockReset()`            | `spy.method.mock.resetCalls()` / `restore()` |
| Return value               | `spy.method.mockReturnValue(v)`     | **absent** — see the note below              |
| Spy name in diagnostics    | set for you                         | `mock.fn()` has no name — names are absent   |

The last row is the one that bites: `spy.method.mockReturnValue('x')` is a **native** Vitest/Bun
method, and `node:test` has none, so it is `undefined` here. The library's own
`spy.method.calledWith(...).mockReturnValue('x')` **does** work on all three runtimes — it is part of
the normalised surface, not the runner's.

```js
users.getName.calledWith(7).mockReturnValue('seven'); // ✅ everywhere
users.getName.mockReturnValue('seven'); // ❌ not on node:test
```

Prefer the normalised helpers (`calledWith(...).mockReturnValue(...)`, `resolveWith`, `nextWith`)
and the differences stop mattering: they read the same on all three runtimes.

`mock.settledResults` — which `node:test` does not track natively — is provided by a built-in
polyfill, so it reads identically to Vitest (`{ type: 'fulfilled' | 'incomplete' | 'rejected', value }`).
See [Control helpers → Inspecting promise outcomes](/core/control-helpers#settled-results).

## Every mock is retained until `mock.reset()`

`node:test` registers every `mock.fn()` in its module-level `MockTracker` and keeps the reference for
the lifetime of the process. Dropping the spy does not free it; nothing the library does can, either
— `clearAutoSpy()` / `resetAutoSpy()` revert a spy's _configuration_, not the runner's registry.

Measured: 20 000 spies of a 10-method class created and dropped, then two forced collections, held
**435.6 MB**. One `mock.reset()` brought the same measurement to 0.1 MB.

That is Node's behaviour rather than this adapter's, and it stays invisible until a long suite runs
out of heap. Reset the tracker per test and it never comes up:

```js
import { afterEach, mock } from 'node:test';

afterEach(() => {
  mock.reset();
});
```

Vitest and Bun both drop their own registries between files, so this is specific to
`vitest-auto-spy/node`.

::: tip Which runtime
`node:test` needs no dependency at all beyond Node, which makes it a good fit for a library with no
build step. For an app suite, [Vitest](/runtimes/vitest) or [Bun](/runtimes/bun) will be less work —
both ship `expect` and a watch mode.
:::
