---
title: Auto-mock by type
description: createAutoMock, mockDeep and createMock — build a double from a type or interface, with no class at runtime.
---

# Auto-mock by type

`vitest-auto-spy` picks each method's helper surface from its **return type**: sync methods get
`mockReturnValue` / `calledWith` / `mustBeCalledWith`, `Promise`-returning methods get
`resolveWith` / `rejectWith` / `resolveWithPerCall`, and `Observable`-returning methods/properties
get `nextWith` and friends.

## From a type — `createAutoMock`

`createAutoMock<T>(overrides?)` builds a `Spy<T>` from a **type or interface** alone —
no runtime class needed. Each accessed method becomes a spy with the full helper surface;
seed concrete values through `overrides`.

```ts
import { createAutoMock } from 'vitest-auto-spy';

interface UserService {
  getName(id: number): string;
  load(id: number): Promise<User>;
}

const users = createAutoMock<UserService>();
users.getName.calledWith(1).mockReturnValue('Ada');
users.load.resolveWith({ id: 1 });
```

## From a type, without spies — `createMock`

`createAutoMock` is built for a collaborator the code under test **calls**: every un-seeded member
comes back as a spy. For a double it only **reads** — a DTO, a route snapshot, a config object —
that is the wrong trade. `createMock<T>(partial?)` returns a plain `T` assembled from the fields you
seed, with no spies anywhere.

```ts
import { createMock } from 'vitest-auto-spy';

const route = createMock<ActivatedRouteSnapshot>({ data: { title: 'Report' } });
const config = createMock<ServerConfig>({ baseUrl: 'https://example.test' });
```

|                   | `createMock<T>()`                          | `createAutoMock<T>()`                   |
| ----------------- | ------------------------------------------ | --------------------------------------- |
| Returns           | `T`                                        | `Spy<T>`                                |
| Un-seeded members | `undefined`                                | a lazily created, decorated spy         |
| Reach for it when | the double is **read** — data shapes       | the double is **called** — collaborators |

`partial` is a `Partial<T>`, so the seeded fields stay type-checked: an unknown key, or a known key
with the wrong type, is still a compile error. It is also the single place the `as` lives, so a
suite under a `no-type-assertion` lint rule stops sprinkling `eslint-disable` over its fixtures.

## Recursive deep mocks — `mockDeep`

`mockDeep<T>(overrides?)` is the recursive counterpart of `createAutoMock`. Nested object
access auto-creates chainable spies, so a deep call like `mock.repo.user.find()` works with
no manual seeding — every hop is itself a callable spy carrying `calledWith` / `mockReturnValue`
/ `resolveWith`.

```ts
import { mockDeep } from 'vitest-auto-spy';

interface Api {
  repo: { user: { find(id: number): Promise<User> } };
}

const api = mockDeep<Api>();
api.repo.user.find.calledWith(1).resolveWith({ id: 1 });
await expect(api.repo.user.find(1)).resolves.toEqual({ id: 1 });

// seed concrete values on the root via overrides, or by assignment
const seeded = mockDeep<Api>({ repo: { user: { find: () => Promise.resolve({ id: 9 }) } } });
```

Seeded values (via `overrides` or `mock.x = …`) shadow the auto-generated child for that key.
Nodes are intentionally **not** thenable, so awaiting a node never treats it as a promise.
