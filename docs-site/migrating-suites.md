---
title: Migrating from @suites/unit
description: A spec-by-spec translation from TestBed.solitary and TestBed.sociable to createNestUnit — the API shapes side by side, what each side refuses, and what the move costs.
---

# Migrating from `@suites/unit`

[`@suites/unit`](https://github.com/suites-dev/suites) is the NestJS unit-test builder the Nest
documentation points at, and it is downloaded close to half a million times a month. It is also the
package this one borrowed from: `createNestUnit` on
[`vitest-auto-spy/nestjs`](/adapters/nestjs#building-the-unit-from-its-metadata) is Suites' solitary
/ sociable model, deliberately. This page is the translation, not the argument — the argument is in
the [comparison](/comparison#nestjs).

## What Suites gets right

Two ideas, and both survive the move.

**The unit is built from its own DI metadata.** A Nest provider already declares its collaborators;
`@Injectable()` and `emitDecoratorMetadata` already write that declaration down. A spec that repeats
it as a list of `{ provide, useValue }` entries is a second copy of the constructor, and every
constructor change edits both. Suites reads the metadata instead, so the spec does not have a
provider list to go stale.

**Solitary and sociable are the two real shapes of a unit test.** Solitary is every collaborator
doubled. Sociable is a named few built for real, everything past them still doubled — the seam moved
one class outwards, deliberately, rather than a testing module that grows until it is the
application. Suites made that a first-class distinction instead of a comment in the spec, and it is
the right distinction.

`createNestUnit` keeps both. What changes is the double behind each token, the dependency count, and
where the thing can run.

## Install and remove

```bash
npm remove @suites/unit @suites/di.nestjs @suites/doubles.vitest
npm i -D vitest-auto-spy
```

Three direct packages become one. `@suites/unit` also pulls four `@suites/*` runtime dependencies of
its own — `core.unit`, `types.common`, `types.di`, `types.doubles` — and `@suites/di.nestjs` imports
`@nestjs/common/constants` at runtime, so `@nestjs/common` is a hard peer of the test tooling.
`vitest-auto-spy` has **zero runtime dependencies** and imports nothing from `@nestjs/*`; the Nest
entry reads the metadata keys as strings.

Your `tsconfig` does not change. `reflect-metadata` and `emitDecoratorMetadata: true` are mandatory
for Suites and equally mandatory here — they are Nest's own requirements, and a Nest app that boots
already meets them. Neither package adds one.

One file you can delete: the `global.d.ts` that references `@suites/doubles.vitest/unit` to augment
`Mocked<T>` and `unitRef.get()` with Vitest's mock types. `Spy<T>` is a plain exported type; there is
nothing to augment.

## The translation

| Suites                                              | `vitest-auto-spy/nestjs`                             |
| --------------------------------------------------- | ---------------------------------------------------- |
| `await TestBed.solitary(S).compile()`               | `createNestUnit(S)`                                  |
| `await TestBed.sociable(S).expose(D).compile()`     | `createNestUnit(S, { expose: [D] })`                 |
| `const { unit, unitRef } = …`                       | `const { unit, spies } = …`                          |
| `unitRef.get(Dep)`                                  | `spies.get(Dep)`                                     |
| `unitRef.get<T>('TOKEN')`, `unitRef.get<T>(SYMBOL)` | `spies.get<T>('TOKEN')`, `spies.get<T>(SYMBOL)`      |
| `.mock(Dep).impl((stub) => ({ … }))`                | `spies.get(Dep).method.mockReturnValue(…)`           |
| `.mock('TOKEN').final({ … })`                       | `providers: [{ provide: 'TOKEN', useValue: { … } }]` |
| `Mocked<Dep>`                                       | [`Spy<Dep>`](/core/spy-typing)                       |

### Solitary

```ts
// Before
import { TestBed } from '@suites/unit';

const { unit, unitRef } = await TestBed.solitary(CartService).compile();

unitRef.get(PricingService).total.mockReturnValue(100);
unitRef.get(TaxService).rate.mockReturnValue(0.5);

expect(unit.checkout(3)).toBe(150);
```

```ts
// After
import { createNestUnit } from 'vitest-auto-spy/nestjs';

const { unit, spies } = createNestUnit(CartService);

spies.get(PricingService).total.mockReturnValue(100);
spies.get(TaxService).rate.mockReturnValue(0.5);

expect(unit.checkout(3)).toBe(150);
```

**The `await` disappears.** `compile()` returns a promise because Suites resolves its DI and doubles
adapters dynamically, at compile time, from what it finds installed. `createNestUnit` has no
adapters to find: it reads the metadata and calls `new`, synchronously. A `beforeEach` that existed
only to hold the `await` can become a plain assignment, and a `describe` body can build the unit
directly.

One instance per token, as Nest's default singleton scope gives — a collaborator two classes share
is one spy on both sides of the migration.

### Sociable — `expose`

```ts
// Before
const { unit, unitRef } = await TestBed.sociable(CheckoutFacade).expose(CartService).compile();

unitRef.get(PricingService).total.mockReturnValue(10);
```

```ts
// After
const { unit, spies } = createNestUnit(CheckoutFacade, { expose: [CartService] });

spies.get(PricingService).total.mockReturnValue(10);
```

`expose` takes the whole list at once instead of chaining, which is the only shape change.
`sociable()` in Suites is typed as `Pick<SociableTestBedBuilder, 'expose'>`, so at least one
`.expose()` is required before `.compile()` exists; `{ expose: [] }` here is legal and simply means
solitary.

Both sides refuse to hand you an exposed class as a spy — Suites throws a
`DependencyResolutionError` that says the identifier "is marked as an exposed dependency", and
`spies.get(CartService)` throws with the same reasoning and the two fixes. `spies.exposedTokens()`
lists what the graph actually built, so an `expose` entry nothing asked for shows up as absent
rather than as silence.

### Configuring a double

Suites configures before `compile()`, because the unit does not exist until then:

```ts
// Before
const { unit, unitRef } = await TestBed.solitary(CartService)
  .mock(TaxService)
  .impl((stub) => ({ rate: stub().mockReturnValue(0.2) }))
  .compile();
```

`createNestUnit` builds the unit when you call it, so the usual translation is to configure the spy
afterwards, with the [control helpers](/core/control-helpers) rather than a partial object:

```ts
// After
const { unit, spies } = createNestUnit(CartService);

spies.get(TaxService).rate.mockReturnValue(0.2);
spies.get(ApiService).fetchUser.calledWith(7).resolveWith(user);
```

There is one case where "afterwards" is too late: a constructor that calls a collaborator. For that,
hand the configured spy in through `providers`, which wins over the auto-spies:

```ts
import { createNestUnit, provideAutoSpy } from 'vitest-auto-spy/nestjs';

const { unit, spies } = createNestUnit(CartService, {
  providers: [provideAutoSpy(TaxService, { returns: { rate: 0.2 } })],
});
```

`.final(value)` — Suites' "this is not a double, it is the value" — is a `providers` entry:

```ts
// Before
await TestBed.solitary(CartService).mock('CONFIG').final({ currency: 'EUR' }).compile();

// After
createNestUnit(CartService, { providers: [{ provide: 'CONFIG', useValue: { currency: 'EUR' } }] });
```

with one behavioural difference in your favour. Suites treats a faked dependency as unreadable:
`unitRef.get('CONFIG')` throws `DependencyResolutionError`, because "faked dependencies are not
intended for direct retrieval". Here `spies.get('CONFIG')` returns the value you provided, as is.

`providers` also takes `{ provide: Abstract, useClass: Impl }` — built like an exposed class, its own
dependencies spied — and `{ provide: TOKEN, useFactory }`, a zero-argument factory that runs once,
when the token is first asked for.

### Tokens with no class

Both packages reach a string or symbol token by passing it straight to `get`:

```ts
unitRef.get<AppConfig>('CONFIG'); // Suites
spies.get<AppConfig>('CONFIG'); //  here
spies.get<Flags>(FLAGS); //          symbols too
```

The token comes from the same place on both sides — `@Inject('CONFIG')` records it in
`self:paramtypes`, which is the metadata key both packages read first. What comes back differs: a
token with no class has no prototype to read, so this package answers it with
[`createAutoMock()`](/core/auto-mock-by-type), a type mock. That is right for a service behind an
interface and wrong for a config literal, where `config.currency` would be a function spy rather
than `'EUR'`. Provide those, as above.

### `@Optional()` and property injection

Property injection (`@Inject(Logger) logger!: Logger`) works on both sides; both read
`self:properties_metadata` plus `design:type` and assign after construction.

`@Optional()` does not work on both sides. `@suites/di.nestjs` reads three metadata keys —
`design:paramtypes`, `self:paramtypes` and `self:properties_metadata` — and `optional:paramtypes` is
not one of them, so the decorator changes nothing about what the unit receives. `createNestUnit`
reads it: an `@Optional()` parameter or property whose token cannot be injected at all receives
`undefined`, which is what Nest itself would hand it. An optional dependency with an injectable
token still gets its spy, because in this graph every token is available.

```ts
class ReportService {
  constructor(
    readonly logger: Logger,
    @Optional() @Inject('AUDIT') readonly audit?: AuditSink,
  ) {}
}

const { unit, spies } = createNestUnit(ReportService);

expect(unit.logger).toBe(spies.get(Logger));
```

## The difference that will change a spec

**A Suites double answers every property name.** `@suites/doubles.vitest` builds the mock as a
`Proxy` whose `get` trap creates what is missing:

```js
// @suites/doubles.vitest 3.1.0, mock.static.js
get: (obj, property) => {
  if (!(property in obj)) {
    // …
    if (property !== 'calls') {
      obj[property] = new Proxy(vi.fn(), handler());
      obj[property]._isMockObject = true;
    }
  }
  return obj[property];
};
```

The mock starts from `{}` — nothing is read off the class — so the trap answers every name, and
there is no name it can refuse. Rename `getUser` to `fetchUser` in the service and the spec that
still stubs `getUser` keeps passing: the stub configures a function nothing calls, the assertion
against it never runs, and the suite stays green over a method that no longer exists.

```ts
unitRef.get(Api).getUserz.mockResolvedValue(user); // a working mock, of nothing
```

Here the double is built from the real prototype by
[`createSpyFromClass`](/core/create-spy-from-class), so the same line is a `TypeError` on
`undefined`:

```ts
spies.get(Api).getUserz; // undefined — `getUserz` is not on Api.prototype
spies.get(Api).getUserz.mockResolvedValue(user); // TypeError, at the line that is wrong
```

Ask for the method explicitly and the message names it instead:
`createSpyFromClass(Api, { onlyMethodsToSpyOn: ['getUserz'] })` reports that `getUserz` was not
found on the class prototype. Both are the same rule: the wrong stub should fail at the stub.

This is worth a pass over the suite after the migration rather than a trust exercise. A spec that
was quietly stubbing a renamed method will now fail, and that failure is the migration paying for
itself.

### What each side refuses

| Situation                                 | Suites                                       | `createNestUnit`                                        |
| ----------------------------------------- | -------------------------------------------- | ------------------------------------------------------- |
| A misspelt method on a double             | a working mock                               | `undefined`, or a named error with `onlyMethodsToSpyOn` |
| `get` of a token the unit never asked for | `DependencyResolutionError`                  | throws, **and lists the auto-spied tokens**             |
| `get` of an exposed class                 | `DependencyResolutionError`                  | throws, with both fixes                                 |
| `get` of a provided constant              | throws — "faked dependencies"                | returns the value                                       |
| A parameter typed as an interface         | takes the emitted `Object` as the identifier | throws, naming the class, the slot and both fixes       |
| A cycle among classes built for real      | `forwardRef` guidance in the error           | names the cycle as `A -> B -> A`                        |

The second row is the one that saves time. Both packages refuse a token the unit does not use, which
is correct — a spy the unit will never see is a spec that cannot fail. This one also prints what it
_did_ ask for, so a `spies.get(OldService)` after a refactor tells you the new name in the same
message.

## What you give up

Four things, honestly.

- **Inversify.** Suites ships `@suites/di.inversify` alongside `@suites/di.nestjs`, and its adapter
  registry also names `tsyringe` (`@suites/di.tsyringe` is not on npm today). There is no Inversify
  adapter here and none planned; `createNestUnit` reads Nest's metadata keys specifically. An
  Inversify suite should stay on Suites.
- **Jest.** There is no Jest entry point. The core never imports a test runner directly — it talks
  to one through an internal `MockAdapter`, and Vitest, `bun:test` and `node:test` have shipped
  adapters — but that interface is not exported from any public entry, so a Jest project cannot
  register one without reaching into internals. If the suite is Jest and staying Jest,
  `@suites/doubles.jest` is the working answer and this move is not for you.
- **`identifierMetadata`.** Every Suites `get` and `mock` takes an optional metadata object as a
  second argument, for a DI container that distinguishes bindings by more than a token. There is no
  equivalent here; a token is a token.
- **Configuring a double before construction is a different call.** Suites' `.mock(…).impl(…)` runs
  before the unit exists, so it covers a constructor that calls a collaborator for free. Here that
  case needs `providers: [provideAutoSpy(Dep, config)]` rather than a line after the fact — one more
  thing to notice while migrating, and the only place the `await` you removed was doing work.

## What you get

- **Zero runtime dependencies**, against four transitive `@suites/*` packages plus two adapters you
  install directly plus a runtime `@nestjs/common` import in the DI adapter.
- **A typo fails.** The single largest behavioural difference, above.
- **Three runtimes.** The same spec runs on Vitest, [`bun:test`](/runtimes/bun) and
  [`node:test`](/runtimes/node); Suites describes itself as backend-only and ships doubles adapters
  for Jest, Vitest and sinon.
- **The rest of your suite on the same core.** [Angular](/adapters/angular) — which Suites
  structurally cannot do, because it discovers collaborators from constructor `design:paramtypes`
  and `readonly #x = inject(X)` emits no such metadata — plus [React](/adapters/react),
  [Vue](/adapters/vue) and [Svelte](/adapters/svelte), from one dependency.
- **Getter and setter spies**, [observable spies](/core/observable-assertions), `calledWith` /
  `resolveWith` / `mustBeCalledWith`, [strict mode](/core/strict-mode) and
  [fixtures](/core/create-spy-from-class) — the helper layer a Nest spec ends up writing by hand.
- **Synchronous construction**, and a `spies.get` failure that names what the unit actually asked
  for.

## Versions this was written against

`@suites/unit` 3.1.1, published 2026-05-08, with `@suites/di.nestjs` and `@suites/doubles.vitest` at
3.1.0. `4.0.0-beta.0` was published on 2025-11-04 and nothing has shipped on the 4.x line since; the
3.1.x releases that followed are on the 3.x line. Everything on this page was read out of those
published tarballs rather than from the documentation site.
