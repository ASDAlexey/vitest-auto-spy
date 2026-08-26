---
title: Bun
description: Run vitest-auto-spy on Bun's bun:test, including Bun 1.4's --isolate, --parallel, --shard and --changed.
---

# Bun (`bun:test`)

The `vitest-auto-spy/bun` entry runs the exact same core on Bun's `bun:test` mocks instead of
Vitest.

```ts
import { createSpyFromClass } from 'vitest-auto-spy/bun'; // Bun — bun:test
```

The public API (`createSpyFromClass`, `calledWith`, `resolveWith`, `nextWith`, …) is **identical**
to the Vitest entry. Only **native** mock methods stay the runner's own; the auto-spy helpers are
normalised. Import the entry matching your runner — it registers the Bun adapter on import.

Testing Angular under `bun test` has its own entry, [`vitest-auto-spy/bun-angular`](/runtimes/bun-angular).

## A runnable example

```ts
// user.test.ts
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

describe('UserService spy', () => {
  it('returns per-argument values and resolves promises', async () => {
    const users: Spy<UserService> = createSpyFromClass(UserService);

    users.getName.calledWith(7).mockReturnValue('seven');
    users.load.resolveWith('ok');

    expect(users.getName(7)).toBe('seven');
    await expect(users.load(1)).resolves.toBe('ok');
    expect(users.getName).toHaveBeenCalledWith(7);
  });
});
```

```bash
bun test
```

The optional rxjs layer works the same way — `import 'vitest-auto-spy/rxjs'` once, and
`nextWith` / `nextWithValues` / `observablePropsToSpyOn` are available on Bun too.

## What differs from Vitest

Everything the library normalises reads the same on both runners; what is left is Bun's own mock
behaviour, and it is worth knowing which is which.

| Behaviour                     | Vitest                       | Bun                                                     | Who handles it                                     |
| ----------------------------- | ---------------------------- | ------------------------------------------------------- | -------------------------------------------------- |
| `mock.settledResults`         | native                       | not tracked                                             | polyfilled — reads identically on both              |
| `mockReset()`                 | keeps the spy, clears calls  | also drops the implementation                           | the adapter restores it, so auto-spies survive      |
| `spyOn(obj, 'prop', 'get')`   | supported                    | throws — accessors are not supported yet                | accessor spies go through property redefinition     |
| Spy names in failure messages | `vi.fn()` names              | `mockName()`                                            | set for you                                         |
| Fake timers                   | `vi.useFakeTimers()`         | `jest.useFakeTimers()`                                  | not normalised — `vitest-auto-spy/setup` is Vitest-only |

`mock.settledResults` is documented under
[Control helpers → Inspecting promise outcomes](/core/control-helpers#settled-results).

## Bun 1.4 test-runner flags

Bun 1.4 turned `bun test` into a runner with the scheduling controls a large suite needs. Nothing in
this package has to be configured for them — they are listed here because two of them change how a
suite behaves, and the library's answer differs per flag.

| Flag                          | What it does                                                        | Effect on your spies                                                                                            |
| ----------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `--isolate`                   | a fresh JavaScript global per test file, in one process             | matches Vitest's default. Registries and property patches cannot leak between files                              |
| _(no flag)_                   | one shared global for the whole run                                 | the mode to be careful in — a property patch or a leftover registry outlives the file that made it                |
| `--parallel[=N]`              | spreads files over worker processes                                 | none: each worker is its own process, so each has its own registry                                                |
| `--shard=M/N`                 | splits files across CI runners                                      | none                                                                                                              |
| `--changed[=ref]`             | only the files your diff touches                                    | none                                                                                                              |
| `--timings` / `--update-timings` | balances shards by recorded wall-clock time                      | none                                                                                                              |
| `--retry <N>` / `{ repeats: n }` | re-runs a flaky or stress-tested test                            | a spy that is not reset between runs accumulates calls — reset in `beforeEach`                                     |

Without `--isolate`, treat a Bun run the way you would treat Vitest's `isolate: false`: restore what
you patch. `restoreMockedProps()` in an `afterEach` covers the property helpers; `resetAutoSpy(spy)`
clears a spy that outlives one test.

::: tip Which mode to run
`--isolate` is the safer default and costs little; `--parallel` is the one that makes a big suite
fast. They compose: `bun test --isolate --parallel`.
:::

## Compatibility

This package is verified on **Bun 1.4** and tracks `latest` in CI. Its own Bun suite lives in
`src/bun-tests/` and runs on the real `bun:test` — the Vitest suite can only exercise the Bun
adapter against a stub, since `bun:test` does not resolve outside Bun.
