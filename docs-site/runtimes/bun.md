---
title: Bun
description: Use vitest-auto-spy with Bun's bun:test - a runnable example, what differs from Vitest, cleanup between tests and Bun 1.4 runner flags.
---

# Bun (`bun:test`)

Use the `vitest-auto-spy/bun` entry when your tests run under `bun test`. It has the same API as the
Vitest entry and builds spies on `bun:test` mocks.

```ts
// greeter.test.ts
import { describe, expect, it } from 'bun:test';
import { type Spy, createSpyFromClass } from 'vitest-auto-spy/bun';

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
bun test
```

Importing the entry is the only setup: no config file and no preload are needed.

- **Two kinds of methods sit on a spy, and both work.** Library helpers (`calledWith(...)`,
  `resolveWith`, `nextWith`, …) behave the same on every runner. Bun's own mock methods
  (`users.getName.mockReturnValue('x')`, `mockImplementation`, `mock.calls`) work as Bun defines them.
- **A spy can stand in for the real class**, as in `new Greeter(users)` above. If `UserService` has
  `private` members, TypeScript reports that `Spy<UserService>` is not assignable to `UserService`.
  Then pass `new Greeter(asInstance(users))`, with `asInstance` imported from `vitest-auto-spy/bun`.
- **rxjs helpers** work after one `import 'vitest-auto-spy/rxjs'`, for example in a preload file. See
  [RxJS](/runtimes/rxjs).

For Angular under `bun test`, use [`vitest-auto-spy/bun-angular`](/runtimes/bun-angular) instead.

## What differs from Vitest

The library smooths over most differences. The table shows what is left.

| Behaviour                             | Vitest                      | Bun                                     | Who handles it                                                                                 |
| ------------------------------------- | --------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `mock.settledResults`                 | native                      | not tracked                             | the library adds it; reads the same on both                                                    |
| `mockReset()`                         | keeps the spy, clears calls | also drops the implementation           | you rarely call it; after it, the spy still answers through `calledWith` and the other helpers |
| `spyOn(obj, 'prop', 'get')`           | supported                   | throws: accessors are not supported yet | the library redefines the property instead                                                     |
| Spy names in failure messages         | `vi.fn()` names             | `mockName()`                            | set for you                                                                                    |
| Fake timers                           | `vi.useFakeTimers()`        | `jest.useFakeTimers()`                  | not handled: `vitest-auto-spy/setup` is Vitest-only                                            |
| `expect.any(...)` inside `calledWith` | matched as a predicate      | never matches, see below                | not handled: use exact arguments on Bun                                                        |

`mock.settledResults` is described in
[Control helpers → Inspecting promise outcomes](/core/control-helpers#settled-results).

**Common mistake:** `calledWith(expect.any(Number))` on Bun. It does not throw, it just never matches:
`read.calledWith(expect.any(Number))` answers `undefined` for `read(7)`. Bun's matchers are native
objects the library cannot evaluate. On Bun, configure exact arguments, or use `mockImplementation`
when the answer depends on the argument's shape. On Vitest, the same line works as described in
[asymmetric matchers in `calledWith`](/core/control-helpers#asymmetric-matchers-in-calledwith).

## Beside this entry

These entries also work under Bun, without Vitest installed:

- `vitest-auto-spy/console`: [`useConsoleSpies()`](/utilities/console) registers its hooks on
  Bun's `beforeEach` / `afterEach` once this entry is imported. Its types do not name `vitest` either.
- `vitest-auto-spy/nestjs`: the Nest helpers build `bun:test` mocks. This entry also exports
  `createNestUnit` and its types, so a [Nest test](/adapters/nestjs#any-runner) needs one import.
- `vitest-auto-spy/angular-router`: the [route and `Router` stand-ins](/adapters/angular-router) work
  under `bun test` with the [`/bun-angular`](/runtimes/bun-angular) preload.

Other entries (the root `vitest-auto-spy`, `/angular`, `/setup`, `/dom-stubs`, `/react`, `/vue`, …)
import `vitest` and do not work under `bun test`. Import the factories from this entry, and Angular
helpers from [`/bun-angular`](/runtimes/bun-angular). `npx vitest-auto-spy doctor` reports a wrong
import as [`vitest-entry-without-vitest`](/utilities/cli#vitest-entry-without-vitest) and names the
entry to use.

The types of this entry do not reference `vitest`, so a project without Vitest type-checks cleanly,
even with `skipLibCheck: false`. `Spy<T>` here has the same members as on Vitest,
except Vitest's `mockThrow`; `failWith()` does the same on every runner.

## Nothing is restored between tests

`bun:test` has no `restoreMocks` or `clearMocks` option. After a test ends:

- a `spyOn(obj, 'm')` stays on the object, so the next test calls the spy, not the method;
- a spy keeps its configured answers and recorded calls;
- a `mockValueProp` patch stays in place.

Clean up in a preload file that runs before every test file:

```ts
// bun-test-setup.ts
import { afterEach, mock } from 'bun:test';
import { restoreMockedProps } from 'vitest-auto-spy/bun';

afterEach(() => {
  restoreMockedProps(); // mockValueProp, mockReadonlyProp and the rest
  mock.restore(); // every spyOn
});
```

```toml
# bunfig.toml
[test]
preload = ["./bun-test-setup.ts"]
```

On Vitest, [`setupAutoSpy()`](/utilities/setup) does this, but `vitest-auto-spy/setup` has no Bun
version.

A spy from `createSpyFromClass(X)` is a new object and does not patch `X`, so `mock.restore()` has
nothing to undo for it. What matters is where you create it:

- in `beforeEach`: each test gets a new spy, no cleanup needed;
- once at the top of the file: it keeps answers and calls between tests, so reset it in `beforeEach`.

```ts
import { beforeEach } from 'bun:test';
import { createSpyFromClass, resetAutoSpy } from 'vitest-auto-spy/bun';

const users = createSpyFromClass(UserService);

beforeEach(() => {
  resetAutoSpy(users); // clears calls and configured answers
});
```

**Put `mock.module()` in the preload too.** By the time a test file calls `mock.module()`, its imports
have already run, and values computed on import stay real:

```ts
// greet.ts
export const greet = (): string => 'real';
```

```ts
// greeting.ts
import { greet } from './greet';

export const greeting = greet(); // computed once, when greeting.ts is imported
```

```ts
// bun-test-setup.ts (the preload)
import { mock } from 'bun:test';

mock.module('./greet', () => ({ greet: () => 'mocked' }));
```

With the mock in the preload, `greeting` is `'mocked'`. The same `mock.module()` inside a test file
comes too late: `greeting` is already `'real'`. `mock.restore()` does not undo `mock.module()`: the
mock stays for the rest of the process.

## Bun 1.4 test-runner flags

None of these flags needs configuration in this package. Two of them change how spies behave between
test files.

| Flag                             | What it does                                            | Effect on your spies                                                             |
| -------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `--isolate`                      | a fresh JavaScript global per test file, in one process | like Vitest's default: patches and mock lists cannot leak between files          |
| _(no flag)_                      | one shared global for the whole run                     | be careful: a property patch or a mock list outlives the file that made it       |
| `--parallel[=N]`                 | spreads files over worker processes                     | none: each worker has its own mock list                                          |
| `--shard=M/N`                    | splits files across CI runners                          | none                                                                             |
| `--changed[=ref]`                | runs only the files your diff touches                   | none                                                                             |
| `--timings` / `--update-timings` | balances shards by recorded time                        | none                                                                             |
| `--retry <N>` / `{ repeats: n }` | re-runs a flaky or stress-tested test                   | a spy that is not reset between runs accumulates calls: reset it in `beforeEach` |

Without `--isolate`, restore what you patch. `restoreMockedProps()`
in an `afterEach` covers the property helpers; `resetAutoSpy(spy)` clears a spy that outlives a test.

::: tip Which mode to run
`--isolate` is the safer default and costs little. `--parallel` makes a big test run fast. Use both:
`bun test --isolate --parallel`.
:::

## Compatibility

Tested on **Bun 1.4**; CI also runs the latest Bun release.
