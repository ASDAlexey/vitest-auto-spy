---
title: Vitest
description: The default zero-config entry — Vitest 5 support, setup-file wiring, the rxjs and Angular subpaths, and what shared-environment runs need.
---

# Vitest

The default, zero-config entry point. Importing `vitest-auto-spy` registers the Vitest mock
adapter (`vi.fn()` / `vi.spyOn()`) and exposes the full core API.

```ts
import { createSpyFromClass } from 'vitest-auto-spy';

// Vitest (default, zero-config)
```

The core is runner-agnostic behind a `MockAdapter`; the Vitest entry registers the default adapter
on import, so existing usage stays unchanged. Native mock methods (e.g. `mockReturnValue`) remain
Vitest's own — only the auto-spy helpers are normalised across runtimes.

## Vitest 5

**One install covers Vitest 2.1 through 5.x.** There is no second major of this package for the new
runner, no version-split type entry, no `@next` tag: the peer range stays `>=2.1.0`, so a monorepo
with one app on Vitest 4 and another on 5 depends on the same version of `vitest-auto-spy`, and a
spec file moves between them unchanged.

Two changes in Vitest 5 reach a spy library rather than a spec, and both are absorbed here.

`clearAllMocks()` no longer walks every mock ever created. Vitest 5 keeps registered mocks behind
`WeakRef`s and clears only the ones that were *called* since the last sweep — a real improvement,
and the reason a spy engine that is not `vi.fn()` has to announce itself to that sweep. This
library's own engine (the default since 4.1) does, so `vi.clearAllMocks()` and the new
`clearMocks: true` default clear these doubles exactly as they clear the runner's own.

The `Matchers` interface gained a second type parameter — `Matchers<T>` on Vitest 4,
`Matchers<R, T>` on Vitest 5 — and TypeScript refuses to merge a declaration whose parameter list
differs. The bundled matchers (`toHaveFocus`, `toHaveSignalValue`, `toBeLoading`,
`toHaveResourceValue`, `toHaveResourceError`, `toHaveDirectiveApplied` and the jasmine set) declare
themselves on Chai's `Assertion` instead, which carries no type parameters in either major, so they
keep typing on both without a second `.d.ts` for you to reference.

### What it costs, measured

40 spec files, 800 tests, 400 spied methods per file, v8 coverage on, Node v24.19.0, median of five
runs, measured 2026-09-06 on identical library source:

| suite | Vitest 4.1.11 | Vitest 5.0.0 |
| --- | --- | --- |
| this library's spy engine (default) | 1383 ms | **1276 ms** |
| every method built with `vi.fn()` (`setSpyEngine('runner')`) | 1473 ms | 1390 ms |

Changing nothing but the runner is **−7.7 %**. The engine is worth **−6.1 %** on Vitest 4 and
**−8.1 %** on Vitest 5 over handing each method to `vi.fn()`. Slowest pairing to fastest — Vitest 4
with runner mocks, against Vitest 5 with the default engine — is 1473 ms → 1276 ms, **−13.4 %**.

### The one thing that can still break your specs

`clearMocks` defaults to `true` in Vitest 5, so `vi.clearAllMocks()` runs before every test. That is
the runner's change, not this library's, and it breaks one pattern: a test asserting on a call that
an *earlier* test — or a `beforeAll` — recorded now reads zero calls. Count it in a plain variable
instead of reading the spy's history:

```ts
let initCalls = 0;
const init = vi.fn(() => {
  initCalls += 1;
});

beforeAll(() => {
  install({ init });
});

it('asked once for the whole file', () => {
  expect(initCalls).toBe(1); // not expect(init).toHaveBeenCalledTimes(1)
});
```

Setting `clearMocks: false` restores the Vitest 4 behaviour if you would rather not touch the specs.

## A spec, start to finish

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { type Spy, createSpyFromClass } from 'vitest-auto-spy';

import { Greeter } from './greeter';
import { UserService } from './user.service';

describe('Greeter', () => {
  let users: Spy<UserService>;
  let greeter: Greeter;

  beforeEach(() => {
    users = createSpyFromClass(UserService);
    greeter = new Greeter(users);
  });

  it('greets the name the service returns', () => {
    users.getName.calledWith(1).mockReturnValue('Ada');

    expect(greeter.greet(1)).toBe('Hello, Ada!');
    expect(users.getName).toHaveBeenCalledWith(1);
  });
});
```

## What belongs in the setup file

Nothing is required to create a spy. Two things are global by nature and belong in
`setupFiles` rather than in a spec:

```ts
// vitest.setup.ts
import 'vitest-auto-spy/rxjs';
// once — enables nextWith / observablePropsToSpyOn everywhere
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

- **`import 'vitest-auto-spy/rxjs'`** registers the observable layer. Without it, using an observable
  helper (`nextWith`, `observablePropsToSpyOn`, …) throws a message naming this exact import — a spy
  factory never pulls rxjs in on its own.
- **[`setupAutoSpy()`](/utilities/setup)** restores `mock*Prop` patches, resets the mock registry and
  fails the run on a duplicate installed copy of the package.

Registering [signal matchers](/adapters/angular) (`toHaveSignalValue`) is a third setup-file
candidate for Angular suites: `registerSignalMatchers()` from `vitest-auto-spy/angular`.

## Isolation

Vitest isolates each file by default, so a leftover property patch or a spy stored in a
module-scope variable dies with the file. Turning that off (`isolate: false`, a shared environment,
a single thread) is exactly the mode `setupAutoSpy()` exists for — this package runs its own suite
both ways in CI for that reason.

```ts
// vitest.config.ts — the mode to be careful in
export default defineConfig({
  test: {
    isolate: false,
    setupFiles: ['./vitest.setup.ts'], // now doing real work
  },
});
```

### A shared `TestBed` patch outlives the file that asked for it

The setup file is the natural place to append one DI provider to every `configureTestingModule`
call, installed once per worker behind a flag. Under `isolate: false` that patch does not end with
the file that wanted it: specs in unrelated libraries silently inherit a provider they never
declared, and they pass. They keep passing until the run isolates — which is the run CI makes,
because coverage forces isolation — and then they fail with `NG0201: No provider found`, in files
nobody touched.

The general shape is a spec that only passes because a _neighbour in the same worker_ configured the
container. It is cheap to check and there is no other way to find it: **run any suite with a shared
`TestBed` patch isolated once before trusting it.**

### A load-time failure is reported against every file in the worker

A file that dies while its module graph is being evaluated takes the worker's other files with it,
and the report says so in a way that reads backwards. Four consecutive full runs of one unchanged
tree reported **0, 95, 104 and 151 failed _files_** while the failed _test_ count stayed at **zero**:
the number tracks how many spec files happened to share the worker that died, not how much is
broken.

The tell is the intersection: across those four runs the failed lists had **no file in common**. No
file in any of them is the culprit.

Neither channel names it either. Vitest 4 collapses the identical unhandled error to a single
message line, with no stack and no originating module, and the `json` reporter carries the same bare
message with `assertionResults: []`. So the triage rule that does work is the narrow one:

> Fix only the files that failed on their **own** assertions, then re-run.

Everything else in the list is a bystander, and re-running is what tells you which was which.

## The Angular subpath

An Angular suite imports from `vitest-auto-spy/angular` instead — it registers the same Vitest
adapter and adds the `TestBed` helpers:

```ts
import { injectSpy, provideAutoSpy, renderShallow, stable } from 'vitest-auto-spy/angular';
```

It needs an Angular-aware Vitest setup (for example `@analogjs/vite-plugin-angular` plus a
`setupTestBed()` call). See [Angular](/adapters/angular) — and
[Angular on Bun](/runtimes/bun-angular) for the same suite under `bun test`.
