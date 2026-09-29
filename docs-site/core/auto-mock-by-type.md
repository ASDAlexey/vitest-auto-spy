---
title: Auto-mock by type
description: createAutoMock, mockDeep and createMock - build a spy or a test object from a TypeScript type or interface, with no class at runtime.
---

# Auto-mock by type

Build a spy from a TypeScript **type or interface** when there is no class to pass: an interface, a
generated API client, an injection token. Every method you touch becomes a spy with the usual
helpers (`calledWith`, `resolveWith`, `nextWith`, …).

```ts
import { asInstance, createAutoMock } from 'vitest-auto-spy';

interface PaymentGateway {
  charge(amount: number): Promise<Receipt>;
  refund(id: string): Promise<void>;
}

const gateway = createAutoMock<PaymentGateway>();

gateway.charge.resolveWith({ id: 'r-1', amount: 42 });

await checkout(asInstance(gateway), 42); // your code under test; asInstance types the spy as PaymentGateway
expect(gateway.charge).toHaveBeenCalledWith(42);
expect(gateway.refund).not.toHaveBeenCalled();
```

Pick the factory by what the code under test does with the object:

| The code under test…                                  | Use                   | You get                                        |
| ----------------------------------------------------- | --------------------- | ---------------------------------------------- |
| **calls** its methods (a service, a client)           | `createAutoMock<T>()` | `Spy<T>`: every member is a spy                |
| **reads** it as data (a DTO, a config, a route)       | `createMock<T>()`     | a plain `T` with the fields you pass, no spies |
| goes **several levels deep** (`api.repo.user.find()`) | `mockDeep<T>()`       | a spy at every level                           |

If you do have a class, [`createSpyFromClass`](./create-spy-from-class) is usually the better choice:
it knows which members are methods and fails when the class loses one.

## What each factory gives you by default

What each member returns before the test configures anything. "Spy" means a function that records its
calls and returns `undefined`. No spy returns a `Promise` or an `Observable` until `resolveWith` /
`nextWith` says what it emits.

| Member of `T`                       | `createSpyFromClass(C)`                                                  | `createAutoMock<T>()`                       | `mockDeep<T>()`                                | `createMock<T>()` |
| ----------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------- | ---------------------------------------------- | ----------------- |
| Method on the prototype             | spy                                                                      | spy                                         | spy                                            | `undefined`       |
| Method returning `Promise` / stream | spy returning `undefined`                                                | spy returning `undefined`                   | spy returning `undefined`                      | `undefined`       |
| Getter / setter                     | `undefined`; an accessor spy with `gettersToSpyOn` or `autoSpyAccessors` | spy; set a value up front                   | spy; set a value up front                      | `undefined`       |
| Data field (`count: number`)        | `undefined` (fields are not on the prototype)                            | spy; set a value up front                   | spy; set a value up front                      | `undefined`       |
| Array field (`items: Item[]`)       | `undefined`                                                              | spy; set an array up front                  | a real array of deep mocks, once read by index | `undefined`       |
| Nested object                       | `undefined`                                                              | spy; the level below it is `undefined`      | a deep mock at every level                     | `undefined`       |
| `Observable` property               | `undefined`; a stream with `observablePropsToSpyOn`                      | spy; a stream with `observablePropsToSpyOn` | a deep mock                                    | `undefined`       |
| `then`, symbols, protocol keys      | `undefined`                                                              | `undefined`                                 | `undefined`                                    | `undefined`       |
| A value set in `overrides`          | the value                                                                | the value                                   | the value                                      | the value         |

**Common mistake:** a spy standing in for a data field is a function, so it is **truthy**. Code like
`if (user.nickname)` takes the wrong branch until the test sets the field. Set data fields up front
through `overrides` (the first argument).

## From a type — `createAutoMock`

`createAutoMock<T>(overrides?, config?)` builds a `Spy<T>` from a type alone. Each method you read
becomes a spy. Set concrete values up front with `overrides`, the first argument.

```ts
import { createAutoMock } from 'vitest-auto-spy';

interface UserService {
  getName(id: number): string;
  load(id: number): Promise<User>;
  readonly region: string;
}

const users = createAutoMock<UserService>({ region: 'eu' });

users.getName.calledWith(1).mockReturnValue('Ada');
users.load.resolveWith({ id: 1 });
```

| Option (second argument) | Type                | Default | Meaning                                                                                               |
| ------------------------ | ------------------- | ------- | ----------------------------------------------------------------------------------------------------- |
| `returns`                | `{ method: value }` | none    | what a method answers; it stays a spy ([`returns` vs `overrides`](./returns-vs-overrides))            |
| `observablePropsToSpyOn` | member names        | `[]`    | build these members as streams (`nextWith` …) instead of function spies; needs `vitest-auto-spy/rxjs` |
| `selfReturning`          | method names        | `[]`    | these methods return the spy itself, for chained calls                                                |
| `returnsUndefined`       | method names        | `[]`    | these methods answer `undefined` and count as configured under `strict`                               |
| `strict`                 | `boolean`           | `false` | an unconfigured method throws ([Strict mode](./strict-mode))                                          |
| `onUnstubbedCall`        | `(call) => unknown` | none    | runs instead of returning `undefined` for an unconfigured method                                      |
| `name`                   | `string`            | none    | the name in strict-mode messages                                                                      |

`strict` makes a method nobody configured throw instead of returning `undefined`:

```ts
const users = createAutoMock<UserService>(undefined, { strict: true });

users.getName(1); // throws: createAutoMock(users.spec.ts:12).getName(1) was called; this strict double has nothing configured for it.
```

There is no class name to print, so the message names the spy after the file and line where you
created it, as in `createAutoMock(users.spec.ts:12)` (or `autoMocked(…)` for `autoMocked`). `className` in an `onUnstubbedCall` handler is the same string.
Pass `{ name: 'USERS' }` to choose the name. A member set in `overrides` is a plain value, not a spy,
so strict mode never checks it.

`createSpyFromClass` on a fully abstract class (all members `abstract`) returns this same kind of spy,
named after the class, and `strict` works there too.

**Common mistake:** an `Observable` property without `observablePropsToSpyOn`. A type does not say
which members are streams, so the member becomes a function spy, and the code under test subscribes to
a function. List the member in `observablePropsToSpyOn`, or pass a real `Subject` in `overrides`:

```ts
import 'vitest-auto-spy/rxjs';

// once per project, usually in the setup file
import { createAutoMock } from 'vitest-auto-spy';

interface StatusSource {
  status$: Observable<'up' | 'down'>;
}

const source = createAutoMock<StatusSource>(undefined, { observablePropsToSpyOn: ['status$'] });
source.status$.nextWith('up'); // subscribers receive 'up'
```

### `autoMocked` — one object typed as both `T` and `Spy<T>`

When you pass the spy to the code under test as an argument, TypeScript wants a `T` there, while the
assertion wants a `Spy<T>`. `autoMocked<T>(overrides?, config?)` builds the same spy as
`createAutoMock`, but its type is `T & Spy<T>`, so one variable works in both places.
`AutoMocked<T>` is that type, for a `let` assigned in `beforeEach`:

```ts
import { type AutoMocked, autoMocked } from 'vitest-auto-spy';

let logger: AutoMocked<Logger>;

beforeEach(() => {
  logger = autoMocked<Logger>();
});

it('logs the failure', () => {
  checkEndpoint('/health', logger); // accepted as a Logger
  expect(logger.error).toHaveBeenCalledOnce(); // and a spy here
});
```

### `using` — reset at the end of the block {#using}

Declare the spy with `using`, and its calls and configuration are reset when the block ends:

```ts
it('names the user', () => {
  using users = createAutoMock<UserService>();
  users.getName.calledWith(1).mockReturnValue('Ada');

  expect(users.getName(1)).toBe('Ada');
});
// calls and configuration are both gone here
```

`Symbol.dispose` does not show up in `Object.keys(users)` or in a spread of the spy; those list only
the members something touched. A value you set under that key wins, as for any other key. More
details, and why there is no `[Symbol.asyncDispose]`: [createSpyFromClass](./create-spy-from-class#using).

### `undefined` in `overrides` is a seed, not an omission

Writing a key with `undefined` in `overrides` sets that member to `undefined`. Leaving the key out
gives you a function spy instead, which is truthy and sends a guarded call site down the wrong branch:

```ts
createAutoMock<NavigationService>({ currentFocus: undefined, navRoot: undefined, selectors: 'button, a' });
//                                  ^ "this member is data, and there is none"
```

Write it even when it looks redundant. It says "the member exists and is empty", which is not the same
as saying nothing.

### A getter in `overrides` stays a getter

A getter you write in `overrides` is installed as a getter, like a patch from `mockAccessorsProp`. It
runs on every read, with the spy as `this`. A `{ set }` accessor receives the writes:

```ts
const platform = createAutoMock<PlatformSupport>({
  get transceiver(): never {
    throw new TypeError('RTCRtpTransceiver is not defined');
  },
});

expect(() => platform.transceiver).toThrow(); // throws where the code under test reads it
```

Creating the spy does not run the getter, and neither do `Object.keys`, `in`, a reset or a snapshot.
The same holds when `registerAutoSpyDefaults` merges its defaults with your `overrides`.

## From a type, without spies — `createMock`

`createMock<T>(partial?)` returns a plain `T` built from the fields you pass, with no spies anywhere.
Use it for objects the code under test only **reads**: a DTO, a route snapshot, a config object.

```ts
import { createMock } from 'vitest-auto-spy';

const route = createMock<ActivatedRouteSnapshot>({ data: { title: 'Report' } });
const config = createMock<ServerConfig>({ baseUrl: 'https://example.test' });
```

|                         | `createMock<T>()`            | `createAutoMock<T>()`              |
| ----------------------- | ---------------------------- | ---------------------------------- |
| Returns                 | `T`                          | `Spy<T>`                           |
| Members you did not set | `undefined`                  | a spy, created on first read       |
| Use it when             | the object is **read**: data | the object is **called**: services |

- `partial` is a deep partial of `T`, so the fields you pass are type-checked: an unknown key or a
  wrong type is a compile error.
- It keeps the `as T` cast in one place, so under a `no-type-assertion` lint rule your fixtures need no
  `eslint-disable` comments.
- `createMock<T>(undefined)` is the same as `createMock<T>()` and returns `{}`, not `undefined`. A
  helper that forwards an optional `overrides` parameter relies on that.

## Recursive deep mocks — `mockDeep`

`mockDeep<T>(overrides?, options?)` is `createAutoMock` at every level. Reading a nested property
creates the next level for you, so `api.repo.user.find()` works without setting anything up. Every
level is itself a spy with `calledWith`, `mockReturnValue` and `resolveWith`.

```ts
import { mockDeep } from 'vitest-auto-spy';

interface Api {
  repo: { user: { find(id: number): Promise<User> } };
}

const api = mockDeep<Api>();
api.repo.user.find.calledWith(1).resolveWith({ id: 1 });
await expect(api.repo.user.find(1)).resolves.toEqual({ id: 1 });

// set concrete values up front, or assign them later
const preset = mockDeep<Api>({ repo: { user: { find: () => Promise.resolve({ id: 9 }) } } });
```

| Option (second argument)     | Type                   | Default | Meaning                                             |
| ---------------------------- | ---------------------- | ------- | --------------------------------------------------- |
| `selfReturning`              | `boolean`              | `false` | a called node returns itself, so chained calls work |
| `fallbackMockImplementation` | `(...args) => unknown` | none    | answers every call nobody configured, at any depth  |

- A value you set (in `overrides` or with `mock.x = …`) replaces the generated level for that key.
- A node is never "thenable", so `await node` does not treat it as a promise.
- `using api = mockDeep<Api>()` works at every depth. `resetAutoSpy` resets the tree from the node you
  give it, so `using` on a sub-tree resets that sub-tree.
- `mockDeep` has no `strict` option, and `setupAutoSpy({ strict: true })` does not reach it. An
  unconfigured call returns `undefined` (or the node itself with `selfReturning`). To fail such calls,
  use [`fallbackMockImplementation`](#fallback).

### Depth comes from property access, not from calls

Read this before you use `mockDeep`, because the types do not show it. `api.repo.user.find()` works
because every step except the last is a property **read**. A node that is **called** returns what it
was configured to return, which is `undefined` by default. So a fluent API breaks at the second call:

```ts
import { mockDeep } from 'vitest-auto-spy';

const logger = mockDeep<AppLogger>();

logger.channel('app').info('started'); // TypeError: Cannot read properties of undefined
```

Pass `{ selfReturning: true }` for that shape. A called node then returns itself, and the chain goes
on:

```ts
const logger = mockDeep<AppLogger>({}, { selfReturning: true });

logger.channel('app').info('started');
expect(logger.channel('app').info).toHaveBeenCalledWith('started');
```

Configuration still wins: `mockReturnValue`, `calledWith(...).mockReturnValue(...)` and `resolveWith`
all apply, and only an _unconfigured_ call returns the node. The one case it gets wrong is a node you
deliberately configured to return `undefined`; assert on its calls there, not on its return value.
That is why the option is off by default.

Two type helpers, one for each direction:

- What a **call** returns is typed as the method's declared return type, not as a spy. Wrap it in
  `asSpy<T>(…)` to get the helpers.
- The **whole mock** is a `DeepMockProxy<T>`, which is not assignable to `T` (a mapped type cannot see
  private members). Wrap it in `asInstance(…)` to pass it where `T` is expected.

```ts
import { asInstance, asSpy } from 'vitest-auto-spy';

asSpy<QueryBuilder>(query.where('id')).limit.mockReturnValue(query);
boot(asInstance(mockDeep<AppLogger>({}, { selfReturning: true })));
```

When only one method chains, `createAutoMock<T>(undefined, { selfReturning: ['channel'] })` is
simpler. That method returns the spy itself, stays a spy and counts as configured under `strict`.

**Common mistake:** `selfReturning: true` on a `return this` builder. A called node returns _itself_,
not the object the method was read from, so every step of the chain goes one level deeper. For an API
whose methods all return the **same** object (tiptap's `ChainedCommands`, a query builder, anything
you would mock with `mockReturnThis()`), the calls land on nodes the test is not holding:

```ts
const editor = mockDeep<Editor>({}, { selfReturning: true });
const chain = editor.chain();

chain.focus().insertContent('text').run();

expect(chain.insertContent).toHaveBeenCalled(); // fails: the call landed on `chain.focus.insertContent`
```

Assert down the path the chain took (`asSpy<ChainedCommands>(chain.focus()).insertContent`), or build
the chain with `createAutoMock`, where `selfReturning` lists methods that return one shared spy:

```ts
import { asInstance, createAutoMock } from 'vitest-auto-spy';

const chain = createAutoMock<ChainedCommands>(undefined, { selfReturning: ['focus', 'insertContent'] });
const editor = createAutoMock<Editor>(undefined, { returns: { chain: asInstance(chain) } });

editor.chain().focus().insertContent('text').run();
expect(chain.insertContent).toHaveBeenCalledWith('text');
```

### Arrays

A member read with a numeric index is an array. The first index read turns it into a real `Array` of
deep mocks, so `Array.isArray`, `length`, `map`, `filter`, spreading and `for…of` work as the code under
test expects:

```ts
const page = mockDeep<Page>(); // `items: Item[]` on the type

page.items[0].load.mockReturnValue('first');
page.items[1].load.mockReturnValue('second');

render(page); // production code runs `page.items.map((item) => item.load())`

expect(page.items).toHaveLength(2);
expect(page.items[1].load).toHaveBeenCalled();
```

- Nested arrays work the same way: `page.matrix[0][1].inner = 'cell'` builds two real arrays.
- The array grows to one past the highest index read. A skipped index becomes a deep mock as soon as
  anything reaches it, `map` and `forEach` included.
- A value you set wins: `mockDeep<Page>({ items: [] })` stays empty.
- `resetAutoSpy` and `using` reset the elements with the tree; the array keeps its length.
- A reference taken **before** the first index read stays a node, not an array. It still answers its
  indices from the same array, but read the member again for `Array.isArray` or `toEqual`. For the
  same reason the root of `mockDeep<Item[]>()` is indexable but is not an array. Build a top-level list
  as `[mockDeep<Item>(), mockDeep<Item>()]`.
- A member typed as a dictionary with number keys (`Record<number, User>`) becomes an array on its
  first index read. Reads by key keep working; `Object.keys` and `Array.isArray` see an array.
- Under `noUncheckedIndexedAccess` the element type includes `| undefined`, as on any array. A deep
  mock always creates the element, so `page.items[0]!` is safe here.

### A call nobody configured — `fallbackMockImplementation` {#fallback}

`fallbackMockImplementation` answers every call on a node nobody configured, at any depth. It receives
the call's arguments, and its return value is what the call returns.

```ts
import { mockDeep } from 'vitest-auto-spy';

const db = mockDeep<Db>(
  {},
  {
    fallbackMockImplementation: () => {
      throw new Error('not mocked');
    },
  },
);

db.user.findUnique.calledWith({ where: { id: 1 } }).resolveWith(user);
db.user.count(); // throws: not mocked
```

The first match wins:

1. the node's own configuration: `mockReturnValue`, `mockImplementation`, `resolveWith`,
   `calledWith(...)`, `mustBeCalledWith(...)`;
2. the fallback;
3. `selfReturning`, which still returns the node when the fallback returned `undefined`. So a fallback
   that only records works with a chain, and one that throws stops it.

**Common mistake:** expecting the fallback for a call with other arguments. "Configured" is about the
node, not the call: a node with `calledWith({ id: 1 })` answers `{ id: 2 }` with `undefined`, not with
the fallback. To fail on other arguments, use `mustBeCalledWith`. After `resetAutoSpy` the node is
unconfigured, and the fallback answers again.

No suite-wide setting takes part. `setupAutoSpy({ strict: true })` does not reach a deep mock, with or
without a fallback, so neither option can switch the other off.

### `vi.spyOn` on a member

`vi.spyOn(api.repo, 'find')` finds a member nobody has read yet. Every node is already a spy, and
Vitest returns that spy instead of wrapping it. So `vi.spyOn(prisma.user, 'findMany').mockResolvedValue(rows)`
in a migrated test configures the node itself.

### A method that runs a callback with the client

A transaction API calls its callback with a client. A deep mock does not guess this: which argument is
the callback, whether to await it and what to pass it are the method's own contract. Configure it on
that one method:

```ts
import { asInstance } from 'vitest-auto-spy';

db.transaction.mockImplementation((run) => run(asInstance(db)));
db.user.count.resolveWith(3);

await expect(service.countInTransaction()).resolves.toBe(3);
```

`asInstance` turns the `DeepMockProxy<Db>` into the `Db` the callback expects. A
`fallbackMockImplementation` does not interfere: the method is configured, and anything the callback
reaches that the test did not configure still gets the fallback.

### A member the code under test calls with `new`

An SDK often has classes on it: `new sdk.Client(key)`, `new api.Session()`. Calling a mocked member with
`new` works. The call is recorded like any other, and it returns a new instance, or the object you
configured for those arguments:

```ts
const sdk = mockDeep<Sdk>(); // `Client: new (key: string) => Client` on the type

service.connect(); // production code runs `new this.sdk.Client(key)`

expect(sdk.Client).toHaveBeenCalledWith(key);
```

The types do not help with configuring one. A member the type declares as a constructor keeps that
type, so the helpers and a `new` written **in the test** need a cast
(`as unknown as new (key: string) => Client`). When the instances should be spies of a real class, use
[`createSpyClass`](/utilities/constructor-doubles), which is a constructor both by type and at runtime.

### How a node prints

In a snapshot, a node prints as `[MockFunction mockDeep.repo.find]` with its calls, and an array member
as a list of those. In an assertion diff, a node passed **as an argument** prints as
`[Function undefined]`: the diff labels a function by its `name`, and on a node `name` is a member of
the mocked type. The assertion itself works; only the label is empty.

### A helper the entry registers later is still a helper

`mockDeep` decides on **every read** whether a key is a spy helper (`mockReturnValue`, `calledWith`,
`nextWith`, …) or a member of your type. So helpers registered later still work: `vitest-auto-spy/rxjs`
and `vitest-auto-spy/jasmine` add theirs when imported, and `setSpyEngine` replaces the set.

```ts
import 'vitest-auto-spy/rxjs';

const api = mockDeep<Api>();

api.feed.items.nextWith([item]); // the Observable helper, not a child node
```

This matters with `isolate: false`, where one worker runs several files. If one file reads a deep mock
and another file imports `/rxjs` later, `nextWith` is still a helper in the second file. The setup file
is still the right place for the import.

## Limits of a type-based spy

`createAutoMock` and `mockDeep` build a JavaScript `Proxy`: an object that answers every property you
ask for, because at runtime a type has no list of its members. That has limits.

### What a Proxy-backed double cannot do

| Operation                              | What happens                                                                                                     |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `mockValueProp` and its three siblings | work; `restoreMockedProps()` undoes them                                                                         |
| `delete mock.optionalMethod`           | the member is absent until something writes to it again                                                          |
| `Object.assign(realInstance, mock)`    | copies only the members already **read**; everything else stays real (see below)                                 |
| `of(mock)` / `from(mock)`              | work: four protocol keys answer `undefined` ([next section](#it-answers-everything-so-it-must-not-answer-these)) |

**Common mistake:** installing the spy by **copying it onto a real instance**. A type has no member
list at runtime, so the copy gets only the members read so far, and every other call reaches the real
code silently. Use `createSpyFromClass` for that: it returns an ordinary object whose method keys are
enumerable, so the copy is complete.

### It answers everything, so it must not answer _these_

Some libraries decide what kind of object they got by checking for a key. A spy that answers every key
would pass those checks and be treated as a scheduler or a stream. So these four keys answer
`undefined` unless you set them, like `then` and every symbol:

| Key            | Checked by                                    | The spy would be taken for |
| -------------- | --------------------------------------------- | -------------------------- |
| `schedule`     | `popScheduler` in `of` / `from` / `merge` / … | a scheduler                |
| `lift`         | `isObservable`, together with `subscribe`     | an Observable              |
| `@@observable` | `isInteropObservable` in `innerFrom`          | an interop stream          |
| `getReader`    | `isReadableStreamLike` in `innerFrom`         | a ReadableStream           |

The case that prompted it:

```ts
of(autoMocked<AnimationItem>()); // without the list: an Observable that never emits
```

`of(...)` treats its **last argument** as a scheduler when `typeof x.schedule === 'function'`. The whole
spy was taken as a scheduler, `of()` got no values, and the failure showed up somewhere unrelated.

If your type really has one of the four, set it and it comes back:

```ts
createAutoMock<TaskScheduler>({ schedule: vi.fn() });
```

Without that, the member is absent, and the call fails at once with `TypeError: … is not a function`,
at the call site.

- `subscribe` is **not** on the list. It is an ordinary method name (a store, an Angular
  `OutputEmitterRef`, an event bus), and `expect(store.subscribe).toHaveBeenCalledWith(cb)` is a real
  assertion. Without `lift` and `@@observable`, `from(spy)` fails with rxjs's own _"You provided an
  invalid object where a stream was expected"_.
- `constructor` answers `Object`, like every plain object. Code that prints
  `${value.constructor.name}` in an error path reads `Object`. A value you set under `constructor`
  wins; `returns` cannot configure it, because it is not a spy.
- `toString` and `valueOf` answer the standard `Object.prototype` methods, so `` `${spy}` `` is
  `'[object Object]'` and printing the spy adds no keys to it. Set or assign either to mock it.
  `returns`, `selfReturning` and `returnsUndefined` naming them print a warning, since there is no spy
  to configure.

## In depth

### Why the deny list stays short

A key joins the list only when a real library is seen checking for it, never because the name sounds
like a protocol. Each entry takes away the ability to mock a member of that name without setting it
first.

### Why the first two table rows matter

The `mockValueProp` case broke two recommendations used together: the `no-object-define-property`
lint rule sends people to `mock*Prop`, and the factory guide sends them to `createAutoMock`. Before the
fix, the pair produced a spy that ignored the patch, and tests ended up building the spy by hand: real
getters plus a `createFunctionSpy` per method.
