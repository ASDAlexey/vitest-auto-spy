---
title: node:test
description: Use vitest-auto-spy with Node's built-in test runner - a runnable example, where node:test mocks differ, spy names and freeing mock memory.
---

# node:test

Use the `vitest-auto-spy/node` entry when your tests run under Node's built-in `node --test`. The
library helpers are the same as on Vitest; the runner's own mock methods differ (see the table
below). Spies are built on `node:test`'s `mock.fn()`.

```js
// greeter.test.mjs
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

// the code under test: receives UserService through its constructor
class Greeter {
  constructor(users) {
    this.users = users;
  }

  greet(id) {
    return `Hello, ${this.users.getName(id)}!`;
  }

  async welcome(id) {
    return `Welcome, ${await this.users.load(id)}`;
  }
}

describe('Greeter', () => {
  it('greets the user the service returns', async () => {
    const users = createSpyFromClass(UserService);
    const greeter = new Greeter(users);

    users.getName.calledWith(7).mockReturnValue('Ada'); // answers getName(7) only
    users.load.resolveWith('Ada'); // no calledWith: answers every call

    assert.equal(greeter.greet(7), 'Hello, Ada!');
    assert.equal(await greeter.welcome(1), 'Welcome, Ada');
    assert.deepEqual(users.getName.mock.calls[0].arguments, [7]);
  });
});
```

```bash
node --test
```

- `node:test` has no `expect`, so the example uses `node:assert`.
- Importing the entry is the only required setup. [`trackNodeMocks()`](#tracknodemocks) is an optional
  extra for large test runs that grow in memory.
- On Node 24, `node --test` also runs `*.test.ts` files: Node removes the type annotations itself.
  Syntax that needs compiling, such as `enum`, needs a loader like `tsx`.
- In TypeScript, the spy type is `Spy<UserService>`: `import { type Spy } from 'vitest-auto-spy/node'`.
- `resolveWith` takes any value the promise should resolve to, arrays included:
  `api.get.resolveWith([{ id: 1 }])`.

## Where the native surface differs

The library helpers (`calledWith`, `resolveWith`, `nextWith`, …) work the same on every runner. The
runner's own mock methods do not: `node:test` mocks are not Jest-style.

| What you want              | Vitest / Bun                        | `node:test`                                                                                              |
| -------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Recorded calls             | `spy.method.mock.calls[0]` → args   | `spy.method.mock.calls[0].arguments`                                                                     |
| Replace the implementation | `spy.method.mockImplementation(fn)` | `spy.method.mock.mockImplementation(fn)`                                                                 |
| Reset                      | `spy.method.mockReset()`            | `spy.method.mock.resetCalls()` clears calls; `spy.method.mock.restore()` puts the original function back |
| Read the spy's name back   | `spy.method.getMockName()`          | **absent**: read `spy.method.name` instead                                                               |
| Return value               | `spy.method.mockReturnValue(v)`     | **absent** on the raw mock: use `spy.method.calledWith(...).mockReturnValue(v)`, see below               |

**Common mistake:** `spy.method.mockReturnValue('x')` on `node:test`. It is a Vitest/Bun mock
method, so here it is `undefined` and the call throws. Use the library's version, which works on
every runner:

```js
users.getName.calledWith(7).mockReturnValue('seven'); // ✅ everywhere
users.getName.mockReturnValue('seven'); // ❌ not on node:test
```

To clear both calls and configured answers in one go, on any runner, use `resetAutoSpy(users)`.

Two more things work as on Vitest and Bun:

- `resetAutoSpy(users)` (from `vitest-auto-spy/node`) removes an implementation a test set with
  `spy.method.mock.mockImplementation()`, accessor spies included. The spy then answers through
  `calledWith` and the other helpers again.
- `mock.settledResults` is added by the library, because `node:test` does not track it. It reads
  `{ type: 'fulfilled' | 'incomplete' | 'rejected', value }`, as on Vitest; `'incomplete'` means the
  promise has not settled yet. See
  [Control helpers → Inspecting promise outcomes](/core/control-helpers#settled-results).

## Beside this entry

These entries also work under `node:test`, without Vitest installed:

- `vitest-auto-spy/console`: [`useConsoleSpies()`](/utilities/console) registers its hooks on
  `node:test`'s `beforeEach` / `afterEach` once this entry is imported. Its types do not name `vitest` either.
- `vitest-auto-spy/nestjs`: the Nest helpers build `node:test` mocks. This entry also exports
  `createNestUnit` and its types, so a [Nest test](/adapters/nestjs#any-runner) needs one import.

Other entries (the root `vitest-auto-spy`, `/angular`, `/setup`, `/dom-stubs`, `/react`, `/vue`, …)
import `vitest`. Without Vitest installed, the run stops before any test with
`Cannot find package 'vitest' imported from …/node_modules/vitest-auto-spy/dist/<entry>.js`. Import
the factories from this entry instead. `npx vitest-auto-spy doctor` reports such an import as
[`vitest-entry-without-vitest`](/utilities/cli#vitest-entry-without-vitest) and names the entry to
use.

The types of this entry do not reference `vitest`, so a project without Vitest type-checks cleanly,
even with `skipLibCheck: false`. `Spy<T>` here has the same members as on Vitest,
except Vitest's `mockThrow`; `failWith()` does the same on every runner.

## Spy names

Each spy is named after its method, as on Vitest and Bun. The name shows up in `node:assert` diffs,
in `util.inspect()` and in the library's own messages. For example, `getName` is set up to accept only `7`
(`mustBeCalledWith`), and the code under test calls it with a function by mistake. The message reads:

```txt
[vitest-auto-spy] getName is set up with mustBeCalledWith, and this call matches none of its configs — argument 1: expected 7, got [Function: getName].
Wanted: getName(7)
Actual: getName([Function: getName])
Fix the value the code under test passes, or configure this call too.
Docs: https://asdalexey.github.io/vitest-auto-spy/core/control-helpers#what-a-mustbecalledwith-failure-prints
```

- The spy's `name` and `displayName` are set. They survive `mock.reset()` on the `mock` object from
  `node:test`, `spy.method.mock.restore()`, `spy.method.mock.resetCalls()` and a
  `mockImplementation()` swap.
- `getMockName()` does not exist on a `node:test` mock. Read `spy.method.name` instead.
- `node:test`'s own reporter names the failed **test**, never a mock. The spy name appears only where
  a spy is printed as a value: an assertion diff, `util.inspect`, a library message.

## Every mock is retained until the tracker is dropped

`node:test` records every `mock.fn()` in a tracker: the `mock` object you import from `node:test`
(a `MockTracker`). Do not confuse it with `spy.method.mock`, the call record of one spy. The tracker
keeps each mock for the whole process. A spy you no longer use stays in memory, with everything it
recorded. Only `mock.reset()` on the `mock` object from `node:test` empties the tracker, and it also
puts the original implementations back and forgets every mock. For example, 20 000 spies of a
10-method class kept about 120 MB in memory until the process ended.

### `trackNodeMocks()`

Call it once, as early as possible. The library then creates its spies on its own tracker and
replaces that tracker with a fresh one after every test, so old spies can be freed. It returns a
function that turns tracking off. Calling `trackNodeMocks()` again while tracking is on does nothing.
In the example above, the same 20 000 spies kept 5.9 MB instead of 124.5 MB (the measurement is on
[Performance](/core/performance#on-node-test)).

```js
import { before, describe, it } from 'node:test';
import { createSpyFromClass, trackNodeMocks } from 'vitest-auto-spy/node';

before(() => {
  trackNodeMocks();
});
```

- **It never calls `mock.reset()` on the `mock` object from `node:test`,** so `mock.fn()` mocks your
  test made by hand keep working. Spies
  keep recording calls and keep their implementation after their tracker is replaced.
- **It does not move spies that already exist.** Spies created before the call stay on the `mock` object
  from `node:test`. Call it as early as the file allows.
- **It never throws.** If a future Node version changes how `node:test` builds trackers,
  `trackNodeMocks()` quietly does nothing: tests keep passing, but memory is not freed. See
  [In depth](#in-depth).
- Without it, nothing changes: the behaviour is opt-in.

Two optional helpers come with it:

| Export             | What it does                                                                         |
| ------------------ | ------------------------------------------------------------------------------------ |
| `pruneNodeMocks()` | frees the spies now and returns how many; for tests running concurrently in one file |
| `countNodeMocks()` | returns the current number of tracked spies, for a test that asserts on it           |

### The fallback, for a suite that does not want the helper

`mock.reset()` on the `mock` object from `node:test`, in `afterEach`, also frees everything and needs
nothing from this package. It also restores and forgets any `mock.fn()` the test made itself:

```js
import { afterEach, mock } from 'node:test';

afterEach(() => {
  mock.reset();
});
```

Vitest and Bun drop their mock lists between files, so this section applies only to `node:test`.

::: tip Which runtime
`node:test` needs nothing but Node, so it suits a library with no build step. For an app,
[Vitest](/runtimes/vitest) or [Bun](/runtimes/bun) is less work: both have `expect` and a watch mode.
:::

## In depth

`trackNodeMocks()` builds its tracker through `mock.constructor`, which is not documented Node API.
It checks that this works before routing a single spy to it. If the check fails, spies stay on the
`mock` object from `node:test`, as without the helper.
