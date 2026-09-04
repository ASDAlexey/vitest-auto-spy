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
| Read the spy's name back   | `spy.method.getMockName()`          | **absent** — read `spy.method.name` instead  |
| Return value               | `spy.method.mockReturnValue(v)`     | **absent** — see the note below              |

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

## Spy names

`node:test`'s `mock.fn()` takes no name and has no `mockName()`, and the proxy it returns keeps the
name of whatever function was passed in — so before this was handled, every spy printed as
`[Function: dispatch]`, the library's internal dispatcher, wherever a spy was rendered.

The adapter now gives the method's name to the *implementation*, at the moment it is created, and
`mock.fn()` carries it onto the mock — a `node:test` mock takes its `name` from the function it
wraps. `displayName` is set on the mock as well, for inspectors that prefer that convention. The
name survives `mock.reset()`, `mock.restore()`, `resetCalls()` and a `mockImplementation()` swap,
because the mock captured it when it was built.

Naming at creation rather than redefining `name` afterwards is a memory decision, not a style one.
`Object.defineProperty(mock, 'name', …)` works, but it drops the function out of V8's fast map:
measured over 200 000 mocks on Node 24.19.0, redefining costs **+206 B each** against **+65 B** for
naming at creation. An anonymous function expression under a computed key is named by the language
itself, and — unlike a concise method — stays constructable, which `mockConstructor` needs.

That is what `node:assert` diffs, `util.inspect()` and this library's own messages read, so a spy
identifies itself the same way it does on Vitest and Bun:

```txt
The function 'getName' was configured with 'mustBeCalledWith' and expects to be called with specific arguments.
Wanted: getName(7)
Actual: getName([Function: getName])
```

Two things it still does not buy you, and neither has a fix on this side:

- **`getMockName()` does not exist on a `node:test` mock.** It is a Jest-family method Vitest and Bun
  ship and `node:test` does not; read `spy.method.name` there instead.
- **`node:test`'s own reporter never labels a mock.** Its output names the *test* that failed, not
  the mock involved — the name shows up only where a spy is actually rendered as a value (an
  assertion diff, `util.inspect`, a library message), never as a heading in the TAP or spec reporter.

## Every mock is retained until the tracker is dropped

`node:test` registers every `mock.fn()` in its module-level `MockTracker` and keeps the reference for
the lifetime of the process. Nothing is ever removed from that list one entry at a time: `reset()` is
the only method that empties it, and it restores everything on the way. So a dropped spy stays
reachable — and so does everything it closed over, its recorded arguments included.

Measured on Node v24.19.0, 20 000 spies of a 10-method class created across 20 tests, dropped, then
two forced collections: **124.5 MB** retained against a 5.5 MB baseline.

### `trackNodeMocks()`

Call it once and the library creates its spies on a `MockTracker` **it owns**, replacing that tracker
with a fresh one after every test. The retired instance and its list become garbage together.

```js
import { before, describe, it } from 'node:test';
import { createSpyFromClass, trackNodeMocks } from 'vitest-auto-spy/node';

before(() => {
  trackNodeMocks();
});
```

Same measurement, same machine, with the helper: **5.9 MB** — a **21×** reduction, and 0.4 MB above
the baseline rather than 119 MB.

It is opt-in, and a suite that does nothing keeps exactly today's behaviour. Three things it
deliberately does not do:

- **It never calls `mock.reset()`.** That is the whole reason a private tracker is worth the code:
  resetting the shared one restores and forgets the `mock.fn()` a spec wrote by hand. Swapping a
  tracker the library owns touches no spy at all — a `node:test` mock keeps recording calls and keeps
  its implementation once its tracker is gone, because the tracker exists only for restore/reset.
- **It does not move spies that already exist.** Anything created before the call stays on the
  runtime's tracker. Call it once, as early as your file allows.
- **It never throws.** The class is reached through `mock.constructor`, which is not documented API,
  so the construction is probed before a single spy is routed at it. If a future runtime does not
  give it up, `trackNodeMocks()` is a no-op and spies keep going where they go today.

Two more exports come with it, both optional: `pruneNodeMocks()` sweeps by hand — for a suite running
its tests concurrently, where a shared per-test hook is the wrong granularity — and returns how many
spies went; `countNodeMocks()` reads the current number back, for a suite that would rather assert on
it than trust it.

### The fallback, for a suite that does not want the helper

`mock.reset()` in `afterEach` still works and still frees everything. It is the blunter instrument —
it also restores and forgets any `mock.fn()` the spec made itself — but it needs nothing from this
package:

```js
import { afterEach, mock } from 'node:test';

afterEach(() => {
  mock.reset();
});
```

Vitest and Bun both drop their own registries between files, so none of this applies to
`vitest-auto-spy` or `vitest-auto-spy/bun`.

::: tip Which runtime
`node:test` needs no dependency at all beyond Node, which makes it a good fit for a library with no
build step. For an app suite, [Vitest](/runtimes/vitest) or [Bun](/runtimes/bun) will be less work —
both ship `expect` and a watch mode.
:::
