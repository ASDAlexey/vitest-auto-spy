# vitest-auto-spy — Helpers a spied method earns from its return type

Part of the agent reference [`AGENTS.md`](../AGENTS.md), which maps every section to its file. Section numbers are shared with it.

## 4. Helpers a spied method earns from its return type

Every spied method is a real runner mock, so `mockReturnValue`, `mockImplementation`,
`toHaveBeenCalledWith` and the rest all work as usual. On top of that:

| Return type | Helpers added |
| --- | --- |
| anything | `calledWith(...args)` → `.mockReturnValue(v)` / `.returnValue(v)` / `.failWith(err)`, `mustBeCalledWith(...args)` → same, `failWith(err)`. On a `Promise` or `Observable` method the handle carries that row's helpers instead — `calledWith(id).nextWith(v)`, `.resolveWith(v)`; `.mockReturnValue` there is a `TS2339` |
| `Promise<T>` | `resolveWith(v)`, `rejectWith(v)`, `resolveWithPerCall([{ value }, …])` |
| `Observable<T>` | `nextWith(v)`, `nextOneTimeWith(v)`, `nextWithValues(configs)`, `nextWithPerCall(configs)`, `throwWith(v)`, `complete()`, `returnSubject()` |

`Observable` **properties** (not just methods) get the same helpers — list them in
`observablePropsToSpyOn`. The prop spy is a plain `Observable`: a `BehaviorSubject` member loses
`.value` / `getValue()`, and code that reads them gets `undefined`. Seed a real one instead —
`overrides: { isActive$: new BehaviorSubject(false) }` — and drive it with `.next()`; the same holds
for a stream the test pushes into itself.

**What counts as an `Observable` is structural, and no declaration names rxjs (4.0.0).** A member
earns the observable bundle when its type satisfies the exported `ObservableLike<T>` — `subscribe`
plus a promise-returning `forEach(next)`:
rxjs's `Observable`, every `Subject`, Angular's `EventEmitter` — and, new in 4.0.0, an `Observable`
from a _second copy_ of rxjs in the tree, which used to fall through to the plain-spy branch and
produce `nextWith is not a function` with nothing pointing at the duplicate. `Promise`, arrays,
`Signal` and Angular's `OutputEmitterRef` are not observables and do not earn it.

`returnSubject()` and `nextWithPerCall()` return `SubjectOf<T>` — rxjs's own `Subject<T>` wherever
`import 'vitest-auto-spy/rxjs'` is in the TypeScript program, the structural `SubjectLike<T>`
(`next` / `error` / `complete` / `asObservable` / `closed`) where it is not. The switch is one
augmentable interface, `AutoSpyRxjsTypes<T>`, which `/rxjs` fills in with `subject: Subject<T>`;
augment it yourself only to plug in a different subject type. If
`const s: Subject<T> = spy.m.returnSubject()` fails to compile, the import is missing from the
program the specs are checked in — usually a Vitest `setupFiles` entry that no `tsconfig`
`include` covers, or, from `@angular/build:unit-test` 22.2.0, a plain `.ts` that only the spec
`tsconfig`'s `include` lists: that builder's program is the specs, the setup files and the `.d.ts`
files (angular-cli#34134), so put the import in one of those. That is the _only_ breaking change in
4.0.0; the reason for it is that `dist/types-*.d.ts` used to open with
`import { Observable, Subject } from 'rxjs'` and load 189 rxjs `.d.ts` files into every consumer's
program (303 files against 114 without it), `import type` included — TypeScript resolves a type-only import the same way.

```ts
// argument dispatch — other arguments return undefined
users.getName.calledWith(1).mockReturnValue('Ada');
// argument enforcement — other arguments throw
users.getName.mustBeCalledWith(1).mockReturnValue('Ada');
// asymmetric matchers work in both, at any depth
users.save.calledWith(expect.objectContaining({ id: 1 })).mockReturnValue(true);
users.save.calledWith({ id: expect.any(Number), tags: [expect.any(String)] }).mockReturnValue(true);
// re-registering the same arguments replaces the answer — matcher arguments included
users.save.calledWith(expect.objectContaining({ id: 1 })).mockReturnValue(false);

// promises
users.load.resolveWith({ id: 1 });
users.load.rejectWith('FAKE ERROR');
users.load.resolveWithPerCall([{ value: a }, { value: b }]);
expect(users.load.mock.settledResults).toEqual([{ type: 'fulfilled', value: { id: 1 } }]);

// observables — requires `import 'vitest-auto-spy/rxjs'` once
feed.items$.nextWith([item]); // emit, stream stays open
feed.items$.nextOneTimeWith([item]); // emit once, then complete
feed.items$.nextWithValues([{ value: a }, { value: b, delay: 100 }, { complete: true }]);
const [first$, second$] = feed.watch$.nextWithPerCall([{ value: 'a' }, { value: 'b', doNotComplete: true }]);
feed.items$.throwWith('FAKE ERROR');
const subject = feed.items$.returnSubject(); // ReplaySubject, for anything the helpers miss

// throwing — `failWith`, on a spy of any return type
cart.checkout.failWith(new HttpErrorResponse({ status: 500 })); // every call throws
cart.checkout.calledWith(BAD_ID).failWith(new Error('unknown cart')); // only these arguments throw
```

`failWith` is the sync counterpart of `rejectWith`, and it is **not** called `throwWith` — that name
belongs to the observable helper above, which errors the stream. At runtime every spy carries every
bundle; only the return type in `Spy<T>` tells them apart, so one name for both would mean whichever
is attached last silently wins.

On Vitest, `mockThrow` / `mockThrowOnce` (4.1) do the spy-level half of this too. `failWith` exists
because Bun and `node:test` ship neither, and because **no** runtime can make one `calledWith` chain
throw while its siblings answer normally — `mockImplementation` replaces the whole dispatch, which is
the opposite of configuring one set of arguments. A `failWith` supersedes a `resolveWith` /
`nextWith` / per-call batch configured before it, and is superseded by one configured after, so the
outcome never depends on the order the spec happens to be written in.

An exact argument list is matched before the asymmetric configs, and those are tried in
registration order — a narrow config written first keeps its calls. Two matchers count as the same
argument when they accept the same values (same matcher class, sample and inversion), which is what
makes a second `calledWith(1, expect.anything())` an override rather than a second config sitting
behind the first. A hand-rolled `{ asymmetricMatch }` object is compared by identity instead: its
verdict is a closure, so only re-registering that same instance overrides.

**A matcher counts wherever it sits, not only at the top level.** A config argument holding a
matcher — or a function — anywhere inside it is compared structurally rather than as data:
`calledWith({ id: expect.any(Number) })`, `calledWith([expect.any(String)])`, a matcher inside a
`Map` value or a `Set` member. The same comparison decides the rest of an argument's shape, so it is
worth knowing what it treats as equal: `Map` and `Set` are compared **without regard to insertion
order**, a `Date` by its time, a `RegExp` by its source and flags, an `Error` by its `name` and
`message` plus its own enumerable fields, a function by identity, and symbol-keyed properties
participate like string ones. Cycles are handled, so a component graph with a back-edge is a legal
argument. `mustBeCalledWith` uses the same map, and its `Wanted:` line renders a matcher as
`Any<Number>` rather than as the object it serialises to. With one config set up, its first line
names the first argument that differs — `argument 2: expected 'eu', got 'us'` — and it names the
class only on a strict double (`UserService.getName`), the method alone otherwise.

Each `calledWith(...)` / `mustBeCalledWith(...)` call hands back **its own** handle, so a chain kept
in a variable stays attached to the arguments it was written with:

```ts
const found = users.load.calledWith(1);
users.load.calledWith(2).mockReturnValue(undefined);

found.mockReturnValue({ id: 1 }); // configures 1, not 2
```

`new` on a method spy works: `new sdk.Client()` — the shape `createAutoMock<{ Client: typeof Client }>()`
and `mockDeep` produce — hands back the instance, or the object a `calledWith(...).mockReturnValue(...)`
configured for those arguments.

`mock.settledResults` is native on Vitest and polyfilled on Bun / `node:test`, so it is identical on
all three. Entries are `{ type: 'fulfilled' | 'incomplete' | 'rejected', value }`.

When the argument worth asserting on is one the **code under test built** — a callback, a config
object, an `AbortSignal` — describing its shape is the wrong tool. `expect.any(Function)` says a
function was passed; `captureArg` hands it to you so the test can call it:

```ts
import { captureArg } from 'vitest-auto-spy';

const onDone = captureArg<() => void>();

expect(notifier.subscribe).toHaveBeenCalledWith('ready', onDone);

onDone.value(); // and now exercise what was passed
expect(component.finished()).toBe(true);
```

`.values` holds every value the captor was **offered**, oldest first — candidates, not matches. A
captor in position 0 of `toHaveBeenCalledWith(captor, 3)` is asked about the first argument of every
call the runner tries, including the ones the `3` then rejects, so `.values` can be longer than the
set of calls the assertion accepted. `.captured` asks whether anything was recorded without
triggering the "nothing was captured" throw that reading `.value` raises; `.reset()` lets one captor
serve two phases.

`captureArg({ where })` narrows both halves at once — the filter decides what is recorded **and**
whether that position matches at all, so a rejected candidate leaves no entry in `.values` and the
whole expectation fails on it:

```ts
const config = captureArg<RequestInit>({ where: (value) => (value as RequestInit)?.method === 'POST' });

expect(fetchSpy).toHaveBeenCalledWith(url, config); // only the POST call satisfies this
expect(config.value.headers).toEqual({ 'x-trace': '1' });
```

The filter receives the raw argument as `unknown`, so narrow it yourself. **Assertions only** — a
captor without `where` matches every value, so putting one in `calledWith` would configure a return
for every call, which is `mockReturnValue` spelled less clearly, and `calledWith` is typed to the
method's own parameters so it will not compile anyway.

**The observable helpers are backed by a `ReplaySubject(1)` that belongs to the spy, and it is
configuration — so it must be reset with the rest of it.** Two failures used to come out of that
buffer outliving the test that filled it, and both were silent:

```ts
// test 1
service.createTransition.nextWith(uri); // buffered

// test 2 — the failure path is the point of this test
service.createTransition.throwWith(error); // subscriber gets `uri` FIRST, then the error
```

The code under test therefore ran the **success** branch on stale data, and the error branch arrived
one emission late. The second: `error()` and `complete()` close a Subject permanently, so a later
`nextWith` on that spy pushed into a dead subject and emitted nothing at all. Both are fixed —
`resetAutoSpy(spy)` now drops the subject, and a terminated one is replaced on the next
configuration. That holds for a subject a spec closed **itself**, too:
`spy.items$.returnSubject().complete()` marks the stream closed, so the next `nextWith` opens a new
one rather than disappearing.

`nextWithValues` on an observable **property** builds a new stream, which a subscriber that already
holds the old one never sees — the spec's values go nowhere and the assertion below reads the
initial state. That case is reported rather than passing silently —
`Feed.items$.nextWithValues() ran after something subscribed to Feed.items$` on a strict double, the
member name alone otherwise — once per property as a warning, and at every such call as a throw under
`setupAutoSpy({ misconfiguration: 'throw' })`. `nextWith` pushes into the subject the current
subscriber is on and is the one to reach for mid-test.

What that does **not** change: `vi.clearAllMocks()` and `clearMocks: true` still cannot reach it,
for the same reason they cannot reach a `calledWith` chain — that state lives in this library's
closures, not on the runner's mock. So when a spy outlives a test — a TestBed built in `beforeAll`,
a spy hoisted to `describe` scope — put `resetAutoSpy(spy)` in `beforeEach`. Inside one test the
sequence `nextWith(a)` then `throwWith(e)` still means "emit a, then fail"; only a reset or a
terminal call starts a new stream.
