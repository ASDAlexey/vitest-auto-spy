---
title: Vitest
description: The default zero-config entry — setup-file wiring, the rxjs and Angular subpaths, and what shared-environment runs need.
---

# Vitest

The default, zero-config entry point. Importing `vitest-auto-spy` registers the Vitest mock
adapter (`vi.fn()` / `vi.spyOn()`) and exposes the full core API.

```ts
import { createSpyFromClass } from 'vitest-auto-spy'; // Vitest (default, zero-config)
```

The core is runner-agnostic behind a `MockAdapter`; the Vitest entry registers the default adapter
on import, so existing usage stays unchanged. Native mock methods (e.g. `mockReturnValue`) remain
Vitest's own — only the auto-spy helpers are normalised across runtimes.

## A spec, start to finish

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { type Spy, createSpyFromClass } from 'vitest-auto-spy';

import { UserService } from './user.service';
import { Greeter } from './greeter';

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
import 'vitest-auto-spy/rxjs'; // once — enables nextWith / observablePropsToSpyOn everywhere
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

## The Angular subpath

An Angular suite imports from `vitest-auto-spy/angular` instead — it registers the same Vitest
adapter and adds the `TestBed` helpers:

```ts
import { injectSpy, provideAutoSpy, renderShallow, stable } from 'vitest-auto-spy/angular';
```

It needs an Angular-aware Vitest setup (for example `@analogjs/vite-plugin-angular` plus a
`setupTestBed()` call). See [Angular](/adapters/angular) — and
[Angular on Bun](/runtimes/bun-angular) for the same suite under `bun test`.
