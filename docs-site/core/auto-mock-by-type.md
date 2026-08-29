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

### What a Proxy-backed double cannot do

Both `createAutoMock` and `mockDeep` build a Proxy, and a Proxy answers only the operations its
handler traps. Three of them were missing, and each gave a **silent** wrong answer rather than an
error — a checking test quietly becoming a non-checking one, visible only by reading the proxy's
source. Two are fixed in 3.5.0; the third cannot be.

| Operation                          | Before                                             | Now                                                      |
| ---------------------------------- | -------------------------------------------------- | -------------------------------------------------------- |
| `mockValueProp` and its three siblings | patch landed on the Proxy target; the double ignored it | works, and `restoreMockedProps()` undoes it          |
| `delete mock.optionalMethod`       | deleted nothing — the next read remade the spy      | the member is absent until something writes to it again  |
| `Object.assign(realInstance, mock)` | copies only the keys already **read**              | unchanged — see below                                    |
| `of(mock)` / `from(mock)`          | the double was taken for a scheduler or a stream    | four protocol keys answer `undefined` — see below        |

The first was the worst of the three, because it broke the composition of two things the library
recommends at once: the `no-object-define-property` rule sends people to `mock*Prop`, and the
factory decision tree sends them to `createAutoMock`, and together they produced a double that
ignored the patch. Specs that hit it ended up building the double by hand — real getters plus a
`createFunctionSpy` per method.

`ownKeys` cannot be completed: a type has no key list at runtime, which is the premise of these two
factories in the first place. A spec that installs a double by **copying it onto a real instance**
therefore gets whichever members happened to be read first, and every other call reaches the real
implementation without a word. Use `createSpyFromClass` there — it returns an ordinary object whose
method keys are enumerable, so the copy is complete.

### It answers everything, so it must not answer *these*

The same premise cuts the other way. A library handed an object that has to decide **what kind of
thing it is** asks by probing a key, and a double that answers every property answers the probe too
— at which point it stops being a double of `T` and becomes whatever was being looked for. Four
names are answered with `undefined` unless the spec seeds them, alongside `then` and every symbol,
which always were:

| Key            | Probed by                                      | The double became  |
| -------------- | ---------------------------------------------- | ------------------ |
| `schedule`     | `popScheduler` in `of` / `from` / `merge` / …  | a scheduler        |
| `lift`         | `isObservable`, together with `subscribe`      | an Observable      |
| `@@observable` | `isInteropObservable` in `innerFrom`           | an interop stream  |
| `getReader`    | `isReadableStreamLike` in `innerFrom`          | a ReadableStream   |

The one that cost an afternoon reads like nothing at all:

```ts
of(autoMocked<AnimationItem>()); // an Observable that never emits
```

`of(...)` takes its **last argument** for a scheduler when `typeof x.schedule === 'function'`, so
the whole double was eaten as one, `of()` was left with an empty argument list, and the emission was
scheduled onto a spy that does nothing. The component under test kept its `null`, and the assertion
that failed was about an unrelated `emit()` three concerns away — nothing in the failure mentions
`of`. The workaround people arrive at is `from([double])`, and it is no longer needed.

`subscribe` is deliberately **not** on the list: it is an ordinary method name (a store, an Angular
`OutputEmitterRef`, an event bus) and `expect(store.subscribe).toHaveBeenCalledWith(cb)` is a real
assertion. Denying `lift` and `@@observable` already breaks the impersonation, so `subscribe` alone
fools nothing — `from(double)` fails with rxjs's own *"You provided an invalid object where a stream
was expected"*.

If your type genuinely has one of the four, seed it once and it comes back; the list is consulted
after the store.

```ts
createAutoMock<TaskScheduler>({ schedule: vi.fn() });
```

That is the trade: without a seed the member is absent and the failure is an immediate `TypeError:
… is not a function` at the call site, instead of a silent one in another file. A key joins the list
only with an observed mechanic behind it, never because the name sounds protocol-ish — each entry
costs somebody the ability to mock a member of that name without seeding it.

### `undefined` in `overrides` is a seed, not an omission

`createAutoMock` reads its seed with `Reflect.ownKeys`, so a key written out with an explicit
`undefined` **is** in the store and reads back as `undefined`. Leave it out and the same read
materialises a function spy — which is *truthy*, and sends a guarded call site down the branch the
spec was trying to close:

```ts
createAutoMock<NavigationService>({ currentFocus: undefined, navRoot: undefined, selectors: 'button, a' });
//                                  ^ "this member is data, and there is none"
```

Write it even when it looks redundant. It is the way to say "the member exists and is empty", and
on this double it is not the same as saying nothing.

### Depth comes from property access, not from calls

This is the one thing to know before reaching for `mockDeep`, and it is invisible in the types.
`api.repo.user.find()` chains because every hop but the last is a property **read**. A node that is
**called** returns whatever it was configured to return, and by default that is `undefined` — so a
fluent API breaks at the second call while `DeepMockProxy<T>` types it perfectly:

```ts
const logger = mockDeep<AppLogger>();

logger.channel('app').info('started'); // TypeError: Cannot read properties of undefined
```

Pass `{ selfReturning: true }` for that shape. A called node then hands itself back, so the chain
continues down the same path the reads would have taken:

```ts
const logger = mockDeep<AppLogger>({}, { selfReturning: true });

logger.channel('app').info('started');
expect(logger.channel('app').info).toHaveBeenCalledWith('started');
```

It never takes configuration away: `mockReturnValue`, `calledWith(...).mockReturnValue(...)` and
`resolveWith` all still win, and only an *unconfigured* call — the one that returned `undefined` —
returns the node. The exact cost is a node deliberately configured to return `undefined`; assert on
its calls rather than on its return value there, which is why this is opt-in.

Two bridges, one per direction. What a **call** hands back is typed as the declared return type, not
as a spy, so `asSpy<T>(…)` when the helpers are needed. The **whole mock** is a `DeepMockProxy<T>`,
not assignable to `T` for the same reason `Spy<T>` is not — a mapped type cannot see private
members — so `asInstance(…)` when it has to go to an API typed against the real thing:

```ts
asSpy<QueryBuilder>(query.where('id')).limit.mockReturnValue(query);
boot(asInstance(mockDeep<AppLogger>({}, { selfReturning: true })));
```

`asInstance` did not accept a deep mock before 3.5.0, which left one with nowhere to go: the factory
tree recommends `mockDeep` when the calls chain, and the result then fitted nothing expecting `T`.

When only one method chains, `createAutoMock<T>()` with `channel.mockReturnThis()` is the smaller
answer.
