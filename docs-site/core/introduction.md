---
title: Introduction
description: What vitest-auto-spy does — a typed spy of every method of a class, on Vitest, Bun or node:test.
---

# Introduction

`vitest-auto-spy` reads a class and generates a typed spy for **every** method, powered by your
test runner's mock primitive (`vi.fn()` on Vitest, and the equivalents on Bun and `node:test`).
It is a drop-in successor to [`jest-auto-spies`](https://www.npmjs.com/package/jest-auto-spies):
the same API, but spying on Vitest-compatible runners instead of Jest.

Manually mocking a service is tedious and brittle — one `vi.fn()` line per method, kept in sync
by hand. Instead:

```ts
import { type Spy, createSpyFromClass } from 'vitest-auto-spy';

let userService: Spy<UserService>;

beforeEach(() => {
  userService = createSpyFromClass(UserService);
});
```

`Spy<UserService>` exposes each method as a mock **plus** the right helpers based on the method's
return type: `resolveWith` / `rejectWith` for `Promise`s, `nextWith` / `throwWith` for RxJS
`Observable`s, and `calledWith` / `mustBeCalledWith` for argument matching.

No class to hand? Mock straight from a **type or interface** with `createAutoMock<T>()`, or build a
recursive, self-seeding mock with `mockDeep<T>()`. For a double the code under test only **reads** —
a DTO, a route snapshot, a config object — `createMock<T>(partial?)` returns a plain, spy-free `T`
instead, and `createFixtureFactory<T>(defaults)` is where the model a whole suite shares gets written
out and checked once. See [Auto-mock by type](./auto-mock-by-type) and
[Fixtures without casts](/utilities/fixtures).

## Where it runs

The core never imports your test runner directly: `vi.fn()` and its equivalents sit behind a
`MockAdapter` that each entry point registers on import. Pick the one that matches your runner and
the rest of the API is identical.

```ts
import { createSpyFromClass } from 'vitest-auto-spy'; // Vitest (default, zero-config)
import { createSpyFromClass } from 'vitest-auto-spy/bun'; // Bun — bun:test
import { createSpyFromClass } from 'vitest-auto-spy/node'; // node:test
```

Angular's `TestBed` runs on Bun too, which nothing else offers — see
[Angular on Bun](/runtimes/bun-angular).

Next: [Installation](./installation) for the wiring, or
[`createSpyFromClass`](./create-spy-from-class) for the full configuration surface.
