# Introduction

`vitest-auto-spy` reads a class and generates a typed spy for **every** method, powered by your
test runner's mock primitive (`vi.fn()` on Vitest, and the equivalents on Bun and `node:test`).
It is a drop-in successor to [`jest-auto-spies`](https://www.npmjs.com/package/jest-auto-spies):
the same API, but spying on Vitest-compatible runners instead of Jest.

Manually mocking a service is tedious and brittle — one `vi.fn()` line per method, kept in sync
by hand. Instead:

```ts
import { createSpyFromClass, type Spy } from 'vitest-auto-spy';

let userService: Spy<UserService>;

beforeEach(() => {
  userService = createSpyFromClass(UserService);
});
```

`Spy<UserService>` exposes each method as a mock **plus** the right helpers based on the method's
return type: `resolveWith` / `rejectWith` for `Promise`s, `nextWith` / `throwWith` for RxJS
`Observable`s, and `calledWith` / `mustBeCalledWith` for argument matching.

No class to hand? Mock straight from a **type or interface** with `createAutoMock<T>()`, or build a
recursive, self-seeding mock with `mockDeep<T>()` — see [Auto-mock by type](./auto-mock-by-type).
