# vitest-auto-spy — `createSpyFromClass` configuration

Part of the agent reference [`AGENTS.md`](../AGENTS.md), which maps every section to its file. Section numbers are shared with it.

## 5. `createSpyFromClass` configuration

```ts
createSpyFromClass(MyService); // every method on the prototype chain
createSpyFromClass(MyService, ['reload', 'count']); // those two ADDED to the discovered ones
createSpyFromClass(MyService, {
  methodsToSpyOn: ['reload'], // ADDS (jest-auto-spies semantics)
  onlyMethodsToSpyOn: ['getName'], // RESTRICTS — skips prototype discovery
  instanceMethodsToSpyOn: ['reload'], // ADDS; same behaviour, clearer name
  observablePropsToSpyOn: ['products$'],
  gettersToSpyOn: ['userName'],
  settersToSpyOn: ['userName'],
  autoSpyAccessors: true, // discover every accessor on the prototype chain
  lazySpies: true, // build each method spy on first access ('proxy' for very wide classes)
  returns: { getProducts: of([]) }, // what a spied METHOD answers
  selfReturning: ['where'], // a method that answers the double itself, for a chained call
  overrides: { products$: subject }, // a member that is not a method result
});
```

| Key | Semantics |
| --- | --- |
| `methodsToSpyOn` | **Additive**, as in `jest-auto-spies`. Same behaviour as `instanceMethodsToSpyOn`. |
| `onlyMethodsToSpyOn` | **Exhaustive whitelist.** Skips discovery; anything not listed is absent. |
| `instanceMethodsToSpyOn` | **Additive.** The name to prefer in new code (see below). |
| `autoSpyAccessors` | Merged with the explicit getter/setter lists. |
| `lazySpies` | Behaviour-identical; only changes _when_ each spy is built. `'proxy'` also changes _what holds the name_. |
| `strict` | Throw on a method nobody configured, instead of answering `undefined` (below). |
| `onUnstubbedCall` | The general form of `strict`; its return value becomes the call's return value. |
| `selfReturning` | The named methods answer the double itself — a default like `returns`; a name in both answers `returns`. |

**`instanceMethodsToSpyOn` is not an edge case — it is a top-5 option** (103 of ~370 spec files in
the reference suite). Method discovery walks the _prototype chain_; a callable assigned to an
**instance field** is invisible to it:

- an Angular `signal()` / `computed()` field — the dominant case in a signals codebase
- an arrow-function property — `readonly reload = (): void => {}`
- anything on an ngrx `signalStore()`, which puts **everything** on the instance
- **members Angular's own classes moved onto the instance** — `Router.currentNavigation` in
  Angular 20 is `currentNavigation = this.navigationTransitions.currentNavigation.asReadonly()`

```ts
createSpyFromClass(TaskStore, { instanceMethodsToSpyOn: ['count', 'reload'] });
provideAutoSpy(ProjectStore, { instanceMethodsToSpyOn: ['current', 'isEmpty'] });
provideAutoSpy(Router, { instanceMethodsToSpyOn: ['currentNavigation'] });
```

**The failure this produces says nothing about any of it.** The member is simply not on the spy, so
the next line reads `undefined` and configuring it throws:

```
TypeError: Cannot read properties of undefined (reading 'mockReturnValue')
```

There is no better message to be had at runtime, and it is worth saying why rather than leaving it
looking like an oversight. Instance fields do not exist until a constructor has run, and this
library never constructs the class — that is what makes a spy safe to build from a service whose
constructor talks to the network. The only alternative would be to answer an unknown member with
_something_, and that something would be truthy: `if (service.optionalThing)` in the code under test
would then take the wrong branch, silently, which is the exact failure mode the protocol deny-list
in §2 exists to remove. A loud `TypeError` on the spec's own line is the better of the two.

For an ngrx `signalStore()`, prefer `createAutoMock<T>()` over listing every member: it mocks from
the type, needs no prototype, and the list cannot fall behind the store. Its **signal** members want
`mockSignalProp`, not a method spy — a store's state is read during the first render, so a method spy
there answers `undefined` to the template.

The symptom of getting this wrong is **a spy that is never called and no warning at all**: the
additive lists exist precisely to name things the prototype does not have, so a typo in one cannot
be told apart from an instance field and stays silent.

Only `onlyMethodsToSpyOn` warns, because only a restricting list can be silently destructive — a
misspelling there leaves the real method unspied, and the code under test then calls something that
is not there:
`[vitest-auto-spy] createSpyFromClass(CartService): onlyMethodsToSpyOn names 'lod' (did you mean 'load'?), not a method of CartService.`
A name with nothing close gets `instanceMethodsToSpyOn: ['x']` as the fix instead.

Also true, and worth not re-deriving:

- **Inherited methods are spied** — discovery walks the whole chain (`Object.prototype` excluded).
- **Constructor bodies never run.** The spy is assembled from the prototype.
- **Abstract classes are accepted**, type and runtime both — `ClassType<T>` carries an abstract
  construct signature, and when the prototype turns out to be empty (abstract members are erased
  before emit) the factory hands back the `createAutoMock` proxy instead of an empty object. Do
  **not** pass a concrete subclass instead; this file used to say so, and it was wrong twice over.
- **An overloaded method is not collapsed.** The worry that `Spy<T>` types every generated
  `api-gateway` client against its last signature does not hold: a four-overload
  `ContentApiService.getItemsBySlug` types as it should, and hand-written `{ m: vi.fn() }` doubles
  for those services convert with no changes to the assertions. When the _first_ signature is the
  useful one, name it on the **declaration only** — the factory's result assigns to it, so the type
  argument is not written twice:

  ```ts
  let mapping: Spy<ContentMappingService, { overload: 'first' }>;

  mapping = createSpyFromClass(ContentMappingService); // no second type argument here
  ```

  **The symptom that leads here says nothing about overloads**, which is why the option is hard to
  find from the error. A stub of the real response shape is rejected on the spec's own line —
  `TS2345: Argument of type 'Page' is not assignable to parameter of type 'HttpEvent<Page>'` — on
  `nextWith(body)`, `resolveWith(body)`, `calledWith(…).returnValue(body)` or
  `mockReturnValue(of(body))` against a generated `observe` client. Neither the double nor the stub
  is wrong; both are being checked against the signature nobody calls. Reach for `overload`, never
  for `@ts-expect-error`: one migration wrote sixty of those across twenty-five files before anyone
  found this option, and each one stops checking the response shape that line exists to describe.

  **Name the method rather than the whole double.** `'first'` on the type moves _every_ overloaded
  member, and on a wide type that breaks the ones nobody was fixing — `Spy<Response, { overload:
'first' }>` for one method collected five `TS2769`s on `download`. `overload` also takes a map:

  ```ts
  let perf: Spy<Performance, { overload: { getEntriesByType: 'first' } }>;
  ```

  A name the type does not have never matches, so a rename leaves a dead entry rather than a red
  build. The default stays `'last'` because "the useful signature" is not decidable from the type: on
  a generated `observe` client it is the first, on a four-overload `api-gateway` client the last, and both
  live in one suite. And **overload order is not always the author's** — `declare global` in a
  third-party package appends to a global interface (`web-vitals` does exactly this to
  `Performance.getEntriesByType`), so which signature is last depends on which packages are in the
  program and can move on a dependency bump.

**A getter that returns a `Signal<T>` goes in `instanceMethodsToSpyOn`**, not in `gettersToSpyOn`.
`get isSafeMode(): Signal<boolean> { return this._isSafeMode.asReadonly(); }` is read as a property
and called as a function, and the accessor route makes you write
`accessorSpies.getters.isSafeMode.mockReturnValue(signal(false))` — two levels deeper than the value
in question. Naming it as an instance method puts a plain spy at that key (the spy object has no
class prototype, so nothing is being shadowed), and
`service.isSafeMode.mockReturnValue(false)` reads like every other member. `mockSignalProp` is the
other answer when the value has to change during the test.

### The composition belongs to the class — `registerAutoSpyDefaults`

A class is doubled the same way in every file that doubles it, so register that once instead of
repeating it:

```ts
// vitest.setup.ts, once
registerAutoSpyDefaults(Router, { observablePropsToSpyOn: ['events'], gettersToSpyOn: ['url'] });

// every spec, from then on
provideAutoSpy(Router);
provideAutoSpy(Router, { instanceMethodsToSpyOn: ['currentNavigation'] }); // ADDS to the registration
```

The call site is **merged** into the registration, not substituted for it: lists unioned
(registration first, no repeats), `returns` / `overrides` merged key by key with the call site
winning, scalars decided by the call site when it names the key. The bare-array form counts as
`{ methodsToSpyOn: [...] }`. Registration is by class identity, so a subclass inherits nothing —
walking the prototype chain would let one registration change doubles in files nobody was looking at.
A second registration for the same class replaces the first, because two of them in one suite is the
drift this removes rather than a merge to perform. `clearAutoSpyDefaults(Class)` drops one,
`clearAutoSpyDefaults()` the lot. `createSpyFromInstance(obj)` reads the registration of the class
`obj.constructor` names, merged the same way; an object literal resolves none. One exception, because
an instance is real: when the call site lists `onlyMethodsToSpyOn`, the rest of the object stays real,
so the registration contributes only `strict`, `onUnstubbedCall`, `onUnstubbedRead` and the
`returns` / `selfReturning` entries of the listed methods — not its accessor lists, its other method
lists or its `overrides`. `registerAutoSpyDefaults(Router, { gettersToSpyOn: ['url'] })` therefore
leaves `router.url` live under `createSpyFromInstance(router, { onlyMethodsToSpyOn: ['navigateByUrl'] })`.
A `returns` or `selfReturning` name the call site itself wrote for a method it left real is reported
as a misconfiguration and skipped.

A setup file that registers more than a handful of classes can say them as one table instead of one
call each. Rows apply in order, and each is checked against **its own** class — a key `Router` does
not carry fails on that row, naming `Router`'s members and nothing else:

```ts
registerAutoSpyDefaults([
  [Router, { observablePropsToSpyOn: ['events'], gettersToSpyOn: ['url'] }],
  [AppEventsService, { instanceMethodsToSpyOn: ['announce'] }],
  [BaseLocalStorage, { instanceMethodsToSpyOn: ['getItem', 'setItem'] }],
]);
```

A later row for a class an earlier row already named replaces it, exactly as a second call would.
`AutoSpyDefaultEntry<T>` is the row type, for a row built outside the literal.

**An `InjectionToken` is a key too — import `registerAutoSpyDefaults` from `vitest-auto-spy/angular`
for it.** Same registry, same merge; the core export takes a class only, because the core entry may
not mention Angular's types. `provideAutoSpyForToken(TOKEN)` reads the registration exactly as
`provideAutoSpy(Class)` reads a class's — both of its arguments are merged over it, and a registered
`returns` stays a default a later `calledWith` / `resolveWith` wins over:

```ts
import { registerAutoSpyDefaults } from 'vitest-auto-spy/angular';

registerAutoSpyDefaults(LOGGER, { returns: { info: undefined, err: undefined }, selfReturning: ['channel'] });
registerAutoSpyDefaults(NAVIGATION, { overrides: { activeRow$: of({}) }, returns: { setFocus: undefined } });

providers: [provideAutoSpyForToken(LOGGER), provideAutoSpyForToken(NAVIGATION, { activeRow$: rows$ })];
```

A token row holds `AutoSpyTokenDefaults<T>`: what `createAutoMock` takes (`returns`, `selfReturning`,
`observablePropsToSpyOn`, `strict`, `name`) plus `overrides`, the seeds `provideAutoSpyForToken` takes
second. Keys are checked against the token's `T`; a table may mix class rows and token rows;
`clearAutoSpyDefaults(TOKEN)` from the same entry drops one. Handing a token to the **core**
`registerAutoSpyDefaults` fails with `TS2345 … 'InjectionToken<X>' is not assignable to parameter of
type 'ClassType<unknown>'` — the fix is the import, not a cast.

**`selfReturning` names the methods that answer the double itself.** `returns` cannot say it — the
double does not exist when the literal is written — and without it a chained call dies on
`undefined`. It works on every factory and in a registration; a registered chain takes a link back out
through the call site's `returns`, since lists only ever union.

### `strict` — a method nobody configured throws instead of answering `undefined`

```ts
const users = createSpyFromClass(UserService, { strict: true });

users.load.resolveWith([]);
users.currentTenant(); // throws here, not four frames later inside the component
```

```
[vitest-auto-spy] Cart.checkout(1, 'now') was called; this strict double has nothing configured for it.
Called from src/app/cart.component.ts:41:12
Configure it in the test: cart.checkout.calledWith(1, 'now').mockReturnValue(…) for these arguments, or .mockReturnValue(…) for any — .resolveWith(…) / .nextWith(…) when it returns a Promise / Observable.
Docs: https://asdalexey.github.io/vitest-auto-spy/core/strict-mode#the-message
```

Also on `createAutoMock`, `provideAutoSpy`, and suite-wide as `setupAutoSpy({ strict: true })` — which
reaches a double whichever bundle of the package built it: the default lives on `globalThis`. Before
this release it lived in module scope, and a setup file's `strict: true` reached no double a spec built.
Precedence, first one set wins: the double's `onUnstubbedCall` → the double's explicit **`strict: false`**
(the only way to exempt one double from a suite-wide default, a global handler included) → the global
`onUnstubbedCall` → the double's `strict: true` → the global `strict`.

- **It is not argument-level.** A `calledWith(1, 'now')` chain says the method is stubbed, so
  `checkout(9, 'later')` still answers `undefined`. Use `mustBeCalledWith` for that.
- **`returns:` is a default in the spy's own container**: a `calledWith` / `resolveWith` / `failWith`
  configured later wins for its arguments or supersedes it, every other call still gets it, and
  `undefined` counts as configured. `returns: { save: undefined }` is how a `void` call is expected.
  `selfReturning: ['channel']` is the same kind of default, and counts as configured too.
- **`mockReturnValue` / `mockImplementation` replace the dispatch**, so they never reach the guard —
  and a `calledWith` configured after them is never consulted. After the last `mockReturnValueOnce`
  the queue empties back onto the library dispatch and the next call **is** reported as unstubbed —
  seed `mockReturnValue(...)` too when a `Once` sequence is meant to run out.
- **That pair is reported, in both orders.** `mockReturnValue` after a `calledWith` erases it;
  `calledWith` after a `mockReturnValue` is dead on arrival. Neither fails on its own — the spec goes
  green on a branch nobody configured — so the library says so as a misconfiguration (warn, or throw
  under the `strict` preset). The whole family replaces: `mockImplementation`, `mockReturnValue`,
  `mockReturnThis`, `mockThrow`, `mockResolvedValue`, `mockRejectedValue`. When both a fallback and a
  per-argument value are wanted, the fallback goes in the spy's container — `returns:` where the
  double is built, or `resolveWith` / `nextWith` / `failWith` — which a `calledWith` still wins over.
  The report is this library's own spy engine's, so Vitest and Rstest have it; Bun, `node:test` and
  `setSpyEngine('runner')` do not. The `Once` family is never reported.
- **A throw something swallowed still fails the test.** Under `setupAutoSpy({ strict: true })` every
  strict throw is recorded, and one that a `try`/`catch` in the code under test or an RxJS error with
  no handler (its rethrow waits on a fake clock) kept from the test fails it after the test
  (`swallowedStrictCalls`, `'throw'` by default with `strict: true`). The report quotes each call
  with its arguments and the line that made it, and says what swallowed it — a `catch` in the code
  under test, or an RxJS subscriber with no error callback. Provoking one on purpose:
  `expect(() => cart.total()).toThrow(…)` then `expect(takeStrictViolations()).toHaveLength(1)`.
- **It does not reach** accessor spies, observable-property spies, `mockDeep` nodes, `console-spy`,
  `mockResourceProp`'s `reload` or a standalone `createFunctionSpy`. A strict double still answers
  `undefined` for an unconfigured getter or `items$`. `fillMissing` members **are** covered.
- **The getter and the stream are reported after the test instead** — a read cannot throw, because a
  failure diff that prints the double reads it. `setupAutoSpy({ unconfiguredReads: 'warn' | 'throw' })`
  (default `'off'`, not in the preset) reports a strict double's getter read that reached no
  configuration and a subscription to a stream nothing fed **by the end of the test** — subscribe in
  `beforeEach`, `nextWith` in the test is fine. Counted from setup's `beforeEach` to its `afterEach`,
  so the spec's own hooks count. Configured means `accessorSpies.getters.x.mockReturnValue(…)` /
  `mockImplementation`, `overrides: { x }` (call site or registration — a registered _list_ alone is
  not), `mockReadonlyProp`; for a stream any of `nextWith` / `throwWith` / `complete` /
  `returnSubject`. `undefined` meant: `mockReturnValue(undefined)`. `onUnstubbedRead({ className,
member, kind, count })` — suite-wide or per double, same precedence as `onUnstubbedCall` — takes the
  findings instead of the report, from every double not `strict: false`: survey with it first.
- **Angular lifecycle hooks are exempt.** `ngOnDestroy`, `ngOnInit`, `ngOnChanges`, `ngDoCheck` and the
  `ngAfter…` hooks answer `undefined` on a strict double: Angular calls `ngOnDestroy` itself on every
  provided value at teardown (a `createAutoMock` / `provideAutoSpyForToken` double always has one), and
  a throw there broke the teardown for every test after it. The calls are still recorded.
- A class instance or DOM node in the call the message quotes prints as `[ClassName]`, data up to 200
  characters per argument; `provideAutoSpyForToken` names the token (`createAutoMock` takes `name`).
- Use `onUnstubbedCall` to survey a suite before turning the throw on — it is handed
  `{ className, method, args }` and whatever it returns is what the call answers, so a handler that
  pushes to an array records the gap without failing anything.

### Getters and setters live in `accessorSpies`

```ts
const settings = createSpyFromClass(SettingsService, { gettersToSpyOn: ['theme'], settersToSpyOn: ['theme'] });

settings.accessorSpies.getters.theme.mockReturnValue('dark');
expect(settings.theme).toBe('dark'); // the property itself stays typed as `string`

settings.theme = 'light';
expect(settings.accessorSpies.setters.theme).toHaveBeenCalledWith('light');
```

**Naming one half gets you the pair, when the class declares a pair.** `gettersToSpyOn: ['theme']`
on a class with both a getter and a setter installs both spies — mirroring reads the prototype
descriptor, so it only ever adds what the class already has, and a read-only member stays read-only.
Before 3.5.0 the assignment landed on the no-op setter the scaffolding installs: the write vanished,
`accessorSpies.setters.theme` was `undefined`, and the failure read
`Cannot read properties of undefined` three steps from the configuration behind it.

The bag is typed over every key of `T` unless the lists are repeated in the options type argument —
`createSpyFromClass<Settings, { gettersToSpyOn: ['theme'] }>(Settings, { gettersToSpyOn: ['theme'] })`
keys both halves by exactly the configured names, so `accessorSpies.setters.other` is a compile error
instead of an `undefined` at run time. Use it when a spec reaches into the bag by name; a
non-literal `string[]` falls back to the every-key bag.

Only spy a getter when the spec asserts that it was **read**. To make one _answer_ something, on a
spy that already exists, the pair above is one line — and it needs no `gettersToSpyOn` at the
factory, which is the part that is otherwise found by trial:

```ts
mockReadonlyProp(settings, 'theme', 'dark'); // no gettersToSpyOn, no accessorSpies
```

For a signal-valued property that is not merely convenience: a spied getter answers `undefined`
until it is configured, while `mockReadonlyProp(component, 'items', signal([]))` keeps every
`computed()` and `effect()` downstream of it reactive (§9).
