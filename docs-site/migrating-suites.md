---
title: Migrating from @suites/unit
description: A spec-by-spec translation from TestBed.solitary and TestBed.sociable to createNestUnit — the API shapes side by side, what each side refuses, and what the move costs.
---

# Migrating from `@suites/unit`

This page moves NestJS unit tests from [`@suites/unit`](https://github.com/suites-dev/suites) to
[`createNestUnit`](/adapters/nestjs#building-the-unit-from-its-metadata) from
`vitest-auto-spy/nestjs`. Both build the class under test from its DI metadata and replace every
dependency with a spy. Most specs change like this:

```ts
// Before
import { TestBed } from '@suites/unit';

const { unit, unitRef } = await TestBed.solitary(CartService).compile();
unitRef.get(PricingService).total.mockReturnValue(100);

// After
import { createNestUnit } from 'vitest-auto-spy/nestjs';

const { unit, spies } = createNestUnit(CartService);
spies.get(PricingService).total.mockReturnValue(100);
```

Two things to watch: a stub of a method that does not exist now fails
([details](#the-difference-that-will-change-a-spec)), and a constructor that calls a dependency needs
the spy configured through `providers` ([details](#configuring-a-double)). Why pick one or the other
is on the [comparison page](/comparison#nestjs).

## Install and remove

```bash
npm remove @suites/unit @suites/di.nestjs @suites/doubles.vitest
npm i -D vitest-auto-spy
```

Three direct packages become one.

- `@suites/unit` also pulls four runtime dependencies: `@suites/core.unit`, `types.common`,
  `types.di` and `types.doubles`.
- `@suites/di.nestjs` imports `@nestjs/common/constants` at runtime, so your test tooling hard-depends
  on `@nestjs/common`.
- `vitest-auto-spy` has **zero runtime dependencies** and imports nothing from `@nestjs/*`. The Nest
  entry reads the metadata keys as plain strings.

**Your `tsconfig` does not change.** Both packages need `reflect-metadata` and
`emitDecoratorMetadata: true`. Nest itself needs them, so a working Nest app already has them.

**Your Vitest config does not change.** esbuild (and so Vite) does not emit `design:paramtypes`, so a
Nest project on Vitest already runs specs through SWC (`unplugin-swc`). `createNestUnit` reads the
same metadata, so the plugin stays.

**You can delete one file:** the `global.d.ts` that references `@suites/doubles.vitest/unit`. It adds
Vitest's mock types to `Mocked<T>` and `unitRef.get()`. Suites also tries to do this with a
`postinstall` script that edits `@suites/unit`'s `.d.ts` files inside `node_modules`. That script does
nothing where install scripts do not run (pnpm 10 by default, `--ignore-scripts`). Here, `Spy<T>` is a
plain exported type, so there is nothing to patch.

## The translation

| Suites                                              | `vitest-auto-spy/nestjs`                                                                                                           |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `await TestBed.solitary(S).compile()`               | `createNestUnit(S)`                                                                                                                |
| `await TestBed.sociable(S).expose(D).compile()`     | `createNestUnit(S, { expose: [D] })`                                                                                               |
| `const { unit, unitRef } = …`                       | `const { unit, spies } = …`                                                                                                        |
| `unitRef.get(Dep)`                                  | `spies.get(Dep)`                                                                                                                   |
| `unitRef.get<T>('TOKEN')`, `unitRef.get<T>(SYMBOL)` | `spies.get<T>('TOKEN')`, `spies.get<T>(SYMBOL)`                                                                                    |
| `.mock(Dep).impl((stub) => ({ … }))`                | `spies.get(Dep).method.mockReturnValue(…)`; if the constructor calls `Dep`, `providers: [provideAutoSpy(Dep, { returns: { … } })]` |
| `.mock('TOKEN').final({ … })`                       | `providers: [{ provide: 'TOKEN', useValue: { … } }]`                                                                               |
| `Mocked<Dep>`                                       | [`Spy<Dep>`](/core/spy-typing)                                                                                                     |

"Solitary" means every dependency is a spy. "Sociable" means a few named dependencies are real
classes, and everything behind them is still a spy.

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

**The `await` goes away.** Suites finds its adapters at compile time, so `compile()` returns a
promise. `createNestUnit` reads the metadata and calls `new` synchronously. A `beforeEach` that only
held the `await` can become a plain assignment.

Each token gets one instance, like Nest's default singleton scope. A dependency shared by two classes
is one spy, before and after the migration.

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

`expose` takes the whole list at once instead of a chain. In Suites, `sociable()` requires at least
one `.expose()` before `.compile()`. Here `{ expose: [] }` is allowed and means solitary.

Neither side gives you an exposed class as a spy. Suites throws `DependencyResolutionError` saying the
identifier "is marked as an exposed dependency". `spies.get(CartService)` throws too, and names both
fixes. `spies.exposedTokens()` lists what was actually built, so an `expose` entry nothing needed
shows up as missing.

### Configuring a double

Suites configures a dependency before `compile()`, because the unit does not exist until then:

```ts
// Before
const { unit, unitRef } = await TestBed.solitary(CartService)
  .mock(TaxService)
  .impl((stub) => ({ rate: stub().mockReturnValue(0.2) }))
  .compile();
```

`createNestUnit` builds the unit immediately. Configure the spy afterwards with the
[control helpers](/core/control-helpers). Vitest's own `mockReturnValue` and `mockResolvedValue` work
too; `resolveWith(v)` is the typed shortcut, and `calledWith(arg).resolveWith(v)` answers one
argument only:

```ts
// After
const { unit, spies } = createNestUnit(CartService);

spies.get(TaxService).rate.mockReturnValue(0.2);
spies.get(ApiService).fetchUser.calledWith(7).resolveWith(user);
```

**If the constructor calls a dependency**, "afterwards" is too late. Pass a configured spy through
`providers`; it wins over the automatic spies. `returns` sets what each named method returns, for
any arguments ([all options](/core/create-spy-from-class)):

```ts
import { createNestUnit, provideAutoSpy } from 'vitest-auto-spy/nestjs';

const { unit, spies } = createNestUnit(CartService, {
  providers: [provideAutoSpy(TaxService, { returns: { rate: 0.2 } })],
});
```

Suites' `.final(value)` ("this is the value, not a mock") becomes a `providers` entry:

```ts
// Before
await TestBed.solitary(CartService).mock('CONFIG').final({ currency: 'EUR' }).compile();

// After
createNestUnit(CartService, { providers: [{ provide: 'CONFIG', useValue: { currency: 'EUR' } }] });
```

One difference helps you. In Suites, `unitRef.get('CONFIG')` throws `DependencyResolutionError`,
because "faked dependencies are not intended for direct retrieval". Here `spies.get('CONFIG')` returns
the value you provided.

`providers` also accepts:

- `{ provide: Abstract, useClass: Impl }`: built like an exposed class, with its own dependencies
  spied;
- `{ provide: TOKEN, useFactory }`: a zero-argument factory that runs once, when the token is first
  requested.

### Tokens with no class

Both packages reach a string or symbol token by passing it to `get`:

```ts
unitRef.get<AppConfig>('CONFIG'); // Suites
spies.get<AppConfig>('CONFIG'); //  here
spies.get<Flags>(FLAGS); //          symbols too
```

Both read the token from the same metadata: `@Inject('CONFIG')` records it in `self:paramtypes`.
What you get back differs. A token with no class has no methods to read, so this package answers it
with [`createAutoMock()`](/core/auto-mock-by-type), a mock built from the type. That suits a service
behind an interface. It does not suit a config object: `config.currency` would be a spy function, not
`'EUR'`. Provide such values through `providers`, as above.

### `@Optional()` and property injection

Property injection (`@Inject(Logger) logger!: Logger`) works on both sides. Both read
`self:properties_metadata` plus `design:type` and assign the value after construction.

`@Optional()` works only here. `@suites/di.nestjs` reads `design:paramtypes`, `self:paramtypes` and
`self:properties_metadata`, but not `optional:paramtypes`, so the decorator changes nothing.
`createNestUnit` reads it:

- an `@Optional()` parameter or property whose token cannot be injected gets `undefined`, as in Nest;
- an optional dependency with an injectable token still gets its spy.

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

**A Suites mock answers every property name.** `@suites/doubles.vitest` builds the mock as a `Proxy`
whose `get` trap creates anything missing:

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

The mock starts empty and reads nothing from the class, so it accepts any name. Rename `getUser` to
`fetchUser` in the service, and the spec that still stubs `getUser` keeps passing. The stub configures
a function nobody calls, and the tests stay green for a method that no longer exists.

```ts
unitRef.get(Api).getUserz.mockResolvedValue(user); // a working mock of nothing
```

Here the spy is built from the real class by [`createSpyFromClass`](/core/create-spy-from-class), so
the same line fails:

```ts
spies.get(Api).getUserz; // undefined: `getUserz` is not on Api.prototype
spies.get(Api).getUserz.mockResolvedValue(user); // TypeError, at the line that is wrong
```

If you list the method explicitly, the error names it:
`createSpyFromClass(Api, { onlyMethodsToSpyOn: ['getUserz'] })` reports that `getUserz` is not on the
class prototype. Either way, a wrong stub fails at the stub.

After the migration, expect some specs to fail this way. Each one was stubbing a renamed method, and
finding it is part of what you gain.

### What each side refuses

| Situation                                 | Suites                                       | `createNestUnit`                                        |
| ----------------------------------------- | -------------------------------------------- | ------------------------------------------------------- |
| A misspelt method on a mock               | a working mock                               | `undefined`, or a named error with `onlyMethodsToSpyOn` |
| `get` of a token the unit never asked for | `DependencyResolutionError`                  | throws, **and lists the auto-spied tokens**             |
| `get` of an exposed class                 | `DependencyResolutionError`                  | throws, with both fixes                                 |
| `get` of a provided constant              | throws: "faked dependencies"                 | returns the value                                       |
| A parameter typed as an interface         | takes the emitted `Object` as the identifier | throws, naming the class, the slot and both fixes       |
| A cycle among classes built for real      | `forwardRef` guidance in the error           | names the cycle as `A -> B -> A`                        |

The second row saves the most time. Both refuse a token the unit does not use: a spy the unit never
sees makes a test that cannot fail. Here the error also lists what the unit _did_ ask for. So after a
refactor, `spies.get(OldService)` tells you the new name in the same message.

## What you give up

- **Inversify.** Suites has `@suites/di.inversify` next to `@suites/di.nestjs`, and its adapter list
  also names `tsyringe` (not on npm today). There is no Inversify support here and none is planned.
  `createNestUnit` reads Nest's metadata keys only. Keep an Inversify project on Suites.
- **Jest.** There is no Jest entry point. The package supports Vitest, `bun:test` and `node:test`, and
  offers no public way to plug in another runner. If your project stays on Jest, use
  `@suites/doubles.jest`.
- **`identifierMetadata`.** Every Suites `get` and `mock` takes an optional metadata object, for DI
  containers that tell bindings apart by more than a token. There is nothing like it here; a token is
  a token.
- **Configuring a dependency before construction is a different call.** Suites' `.mock(…).impl(…)`
  runs before the unit exists, so it handles a constructor that calls a dependency. Here that case
  needs `providers: [provideAutoSpy(Dep, config)]`.

## What you get

- **Zero runtime dependencies**, instead of four transitive `@suites/*` packages, two adapters you
  install yourself, and a runtime `@nestjs/common` import.
- **A typo fails.** See [the difference above](#the-difference-that-will-change-a-spec).
- **Three runtimes.** The same spec runs on Vitest, [`bun:test`](/runtimes/bun) and
  [`node:test`](/runtimes/node). Suites is backend-only and ships mock adapters for Jest, Vitest and
  sinon.
- **The rest of your frontend tests on the same library:** [Angular](/adapters/angular),
  [React](/adapters/react), [Vue](/adapters/vue) and [Svelte](/adapters/svelte). Suites cannot cover
  Angular: it finds dependencies through constructor `design:paramtypes`, and
  `readonly #x = inject(X)` emits no such metadata.
- **Streams and accessors.** A Suites mock answers every name with a `vi.fn()`. A method that returns
  an `Observable` gets no stream helpers, and reading a getter returns a mock function. Here an
  `Observable` method gets [`nextWith` and the rest](/core/control-helpers#observable-methods-properties-—-nextwith),
  and getters and setters get [their own spies](/core/create-spy-from-class#accessor-spies-—-accessorspies).
- **The helpers a Nest spec otherwise writes by hand:** getter and setter spies,
  [observable spies](/core/observable-assertions), `calledWith` / `resolveWith` / `mustBeCalledWith`,
  [strict mode](/core/strict-mode) and [fixtures](/core/create-spy-from-class).
- **Synchronous construction**, and a `spies.get` error that names what the unit actually asked for.

## What Suites gets right

Suites is the unit-test builder the Nest documentation points to, downloaded close to half a million
times a month. `createNestUnit` borrows its model on purpose, and both of its core ideas carry over.

**The unit is built from its own DI metadata.** A Nest provider already declares its dependencies:
`@Injectable()` and `emitDecoratorMetadata` write them down. A spec that repeats them as
`{ provide, useValue }` entries is a second copy of the constructor, and every constructor change
edits both. Suites reads the metadata instead, so the spec has no provider list to go stale.

**Solitary and sociable are the two real shapes of a unit test.** A sociable test moves the boundary
one class outwards on purpose. It does not grow a testing module until it becomes the whole app.
Suites made this a first-class choice, and it is the right one. `createNestUnit` keeps both shapes.

The same two words work outside Nest. An Angular `TestBed` makes the same choice one provider at a
time:

- `provideAutoSpy(Dep)` for every dependency is a solitary spec;
- leaving one real (not listing it, or listing the real class) makes it sociable.

No builder is needed there, because the provider list already is one.

## Versions this was written against

- `@suites/unit` 3.1.1 (published 2026-05-08), with `@suites/di.nestjs` and `@suites/doubles.vitest`
  at 3.1.0.
- `4.0.0-beta.0` was published on 2025-11-04. Nothing has shipped on the 4.x line since; the later
  3.1.x releases are on the 3.x line.
- Before them, nothing was published between 3.0.1 (2025-01-02) and `4.0.0-alpha.0` (2025-10-27).

Everything here was read from the published tarballs, not from the documentation site. Versions and
dates were re-checked in the registry on 2026-09-19: unchanged, 3.1.1 still `latest`. In the week to
2026-09-18, `@suites/unit` was downloaded 80 249 times and `@suites/doubles.vitest` 25 353 times.
