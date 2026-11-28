---
title: Migrating from @suites/unit
description: Move your NestJS tests from TestBed.solitary or TestBed.sociable to createNestUnit. See what to replace and which tests need more than an import change.
---

# Migrating from `@suites/unit`

Use this guide to move a NestJS unit test from [`@suites/unit`](https://github.com/suites-dev/suites)
to [`createNestUnit`](/adapters/nestjs#building-the-unit-from-its-metadata) from `vitest-auto-spy/nestjs`.
Both read the dependencies Nest records for the class and replace them with spies by default.
Replace the `TestBed` chain with `createNestUnit()` and use `spies.get()` instead of `unitRef.get()`:

```ts
// After
import { createNestUnit } from 'vitest-auto-spy/nestjs';

const { unit, spies } = createNestUnit(CartService);
spies.get(PricingService).total.mockReturnValue(100);
```

```ts
// Before
import { TestBed } from '@suites/unit';

const { unit, unitRef } = await TestBed.solitary(CartService).compile();
unitRef.get(PricingService).total.mockReturnValue(100);
```

Two changes can break an existing test:

- [A stub for a method that no longer exists](#the-difference-that-will-change-a-spec) now fails.
- If the constructor calls a dependency, [configure its spy through `providers`](#configuring-a-double).

Still deciding whether to switch? See the [NestJS comparison](/comparison#nestjs).

## Install and remove

```bash
npm remove @suites/unit @suites/di.nestjs @suites/doubles.vitest
npm i -D vitest-auto-spy
```

- **Keep your `tsconfig`.** Both packages need `reflect-metadata` and `emitDecoratorMetadata: true`, as does Nest itself.
- **Keep your Vitest config.** Vite's esbuild transform doesn't write `design:paramtypes`, the metadata Nest uses for constructor types. Keep the SWC plugin (`unplugin-swc`) you already use to write it.
- **Remove `global.d.ts` if it only references `@suites/doubles.vitest/unit`.** That reference adds Vitest's mock types to `Mocked<T>` and `unitRef.get()`. `Spy<T>` is a direct export and needs no patch.

Suites also tries to add the mock types by patching the `@suites/unit` declarations in `node_modules`.
Its `postinstall` cannot do that when install scripts are disabled (pnpm 10 by default or `--ignore-scripts`).

You replace three direct packages with one. `@suites/unit` pulls in four more runtime packages:
`@suites/core.unit`, `types.common`, `types.di`, and `types.doubles`. The Nest adapter imports
`@nestjs/common/constants` at runtime, so the test tooling requires `@nestjs/common`.
`vitest-auto-spy` has **no runtime dependencies** or `@nestjs/*` imports. Its Nest entry reads the metadata keys as strings.

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

A solitary test replaces every dependency with a spy. A sociable test keeps selected dependencies real and spies on the rest, including their dependencies.

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

**Drop the `await`.** Suites finds its adapters in `compile()`, which returns a promise.
`createNestUnit` reads the metadata and calls `new` right away. If `beforeEach` only awaited
`compile()`, you can assign the result synchronously. Keep the hook if each test needs fresh spies.

Both packages use one instance per token, like Nest's default singleton scope. If two classes use the same dependency, they share one spy.

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

Pass an array to `expose` instead of chaining calls. Suites requires at least one `.expose()` in a
sociable test. In `createNestUnit`, `{ expose: [] }` is the same as a solitary test.

`CartService` is real, so neither `get` call returns a spy for it. Suites throws
`DependencyResolutionError` with "is marked as an exposed dependency". `spies.get(CartService)`
throws and tells you what to do: get the spies for its dependencies or remove it from `expose`.
If `spies.exposedTokens()` leaves out a class you listed, nothing needed that class.

### Configuring a double

In Suites, set up the mock before `.compile()` creates the class under test:

```ts
// Before
const { unit, unitRef } = await TestBed.solitary(CartService)
  .mock(TaxService)
  .impl((stub) => ({ rate: stub().mockReturnValue(0.2) }))
  .compile();
```

With `createNestUnit`, configure the spies after creating the class:

```ts
// After
const { unit, spies } = createNestUnit(CartService);

spies.get(TaxService).rate.mockReturnValue(0.2);
spies.get(ApiService).fetchUser.calledWith(7).resolveWith(user);
```

Use Vitest's `mockReturnValue` or `mockResolvedValue`, or use the library's [control helpers](/core/control-helpers).
`resolveWith(v)` is the typed shortcut for a promise result. With `calledWith(7)`, that answer applies only to calls with `7`.

**If the constructor calls a dependency, configure its spy in `providers`.** That spy takes precedence over the automatic one.
`returns` sets a result for each named method, regardless of its arguments ([spy options](/core/create-spy-from-class)):

```ts
import { createNestUnit, provideAutoSpy } from 'vitest-auto-spy/nestjs';

const { unit, spies } = createNestUnit(CartService, {
  providers: [provideAutoSpy(TaxService, { returns: { rate: 0.2 } })],
});
```

To supply a value instead of a mock, replace `.final(value)` with a `useValue` provider:

```ts
// Before
await TestBed.solitary(CartService).mock('CONFIG').final({ currency: 'EUR' }).compile();

// After
createNestUnit(CartService, { providers: [{ provide: 'CONFIG', useValue: { currency: 'EUR' } }] });
```

`spies.get('CONFIG')` returns the value you supplied. Suites throws `DependencyResolutionError`:
"faked dependencies are not intended for direct retrieval".

`providers` also accepts:

- `{ provide: Abstract, useClass: Impl }`: builds a real `Impl`, with spies for its dependencies.
- `{ provide: TOKEN, useFactory }`: calls a zero-argument factory once, when the token is first needed.

### Tokens with no class

Pass a string or symbol token directly to `get` in either library:

```ts
unitRef.get<AppConfig>('CONFIG'); // Suites
spies.get<AppConfig>('CONFIG'); // createNestUnit
spies.get<Flags>(FLAGS); // A symbol token
```

Both libraries read the token from `self:paramtypes`, where `@Inject('CONFIG')` records it.
With no class to read methods from, `createNestUnit` uses [`createAutoMock()`](/core/auto-mock-by-type).
That works for a service behind an interface. For a config object, use `providers` instead:
otherwise `config.currency` is a spy function, not `'EUR'`.

### `@Optional()` and property injection

Both libraries support property injection (`@Inject(Logger) logger!: Logger`). They read
`self:properties_metadata` and `design:type`, then set the property after construction.

`@suites/di.nestjs` reads `design:paramtypes`, `self:paramtypes`, and `self:properties_metadata`.
It skips `optional:paramtypes`, so `@Optional()` has no effect. `createNestUnit` honors it:

- If `createNestUnit` cannot inject the token, the optional parameter or property gets `undefined`, as in Nest.
- If it can inject the token, the dependency still gets a spy by default.

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

**Suites creates a mock for any property name.** If you rename `getUser` to `fetchUser`, a test that still stubs `getUser` can pass. The same goes for typos:

```ts
unitRef.get(Api).getUserz.mockResolvedValue(user); // Stubs a method that doesn't exist
```

[`createSpyFromClass`](/core/create-spy-from-class) builds the spy from the real class. A typo or old name fails where you set the stub:

```ts
spies.get(Api).getUserz; // undefined: `getUserz` is not on Api.prototype
spies.get(Api).getUserz.mockResolvedValue(user); // TypeError
```

If you explicitly list a method, the error names it:
`createSpyFromClass(Api, { onlyMethodsToSpyOn: ['getUserz'] })` reports that `getUserz` is not on the class prototype.
If a test fails this way after migration, check the method name before you change the rest of the test.

Why the old stub worked: `@suites/doubles.vitest` starts with an empty `Proxy` instead of reading the class.
Its `get` handler fills in missing properties:

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

### What each side refuses

| Situation                          | Suites                                 | `createNestUnit`                                                                      |
| ---------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------- |
| Misspelled method name             | Creates a mock                         | `undefined`, or an error naming the method with `onlyMethodsToSpyOn`                  |
| `get` of an unused token           | `DependencyResolutionError`            | Throws and lists the auto-spied tokens                                                |
| `get` of a class in `expose`       | `DependencyResolutionError`            | Throws and suggests getting the class's dependency spies or removing it from `expose` |
| `get` of a provided constant       | Throws: "faked dependencies"           | Returns the value                                                                     |
| Parameter typed as an interface    | Uses the emitted `Object` as the token | Throws, names the class and parameter index, and suggests fixes                       |
| Cycle among classes built for real | Mentions `forwardRef` in the error     | Shows the cycle as `A -> B -> A`                                                      |

Both reject unused tokens so you don't configure a spy the class never sees. If `spies.get(OldService)` fails after a refactor, check the token list in the error for the replacement.

## What you give up

- **Inversify.** Keep Suites if you use `@suites/di.inversify`. `createNestUnit` reads only Nest's metadata, and Inversify support is not planned. Suites also lists a `tsyringe` adapter that wasn't on npm when checked.
- **Jest.** There is no Jest entry or public way to plug in another runner. If you stay on Jest, use `@suites/doubles.jest`.
- **`identifierMetadata`.** Suites lets you pass extra metadata to `get` and `mock` to distinguish bindings. `createNestUnit` identifies each binding by its token alone.
- **Pre-construction setup via `.mock(…).impl(…)`.** If the constructor calls a dependency, pass `providers: [provideAutoSpy(Dep, config)]` instead.

## What you get

- **No runtime dependencies.** Drop the four transitive `@suites/*` packages, the two direct adapters, and the runtime `@nestjs/common` import from your test tooling.
- **Tests catch typos.** [Stubbing a method that doesn't exist](#the-difference-that-will-change-a-spec) fails.
- **Runner choice.** Use the same test pattern on Vitest, [`bun:test`](/runtimes/bun), and [`node:test`](/runtimes/node). Suites is backend-only and ships adapters for Jest, Vitest, and Sinon.
- **Frontend support in the same package.** Test [Angular](/adapters/angular), [React](/adapters/react), [Vue](/adapters/vue), or [Svelte](/adapters/svelte). Suites reads constructor `design:paramtypes`, so it can't pick up Angular dependencies declared as `readonly #x = inject(X)`.
- **Streams and accessors.** Suites gives you a `vi.fn()` when you read a getter and no stream helpers for `Observable` methods. Here those methods get [`nextWith` and other stream helpers](/core/control-helpers#observable-methods-properties-—-nextwith), and getters and setters get [their own spies](/core/create-spy-from-class#accessor-spies-—-accessorspies).
- **More tools for Nest tests.** Use [observable spies](/core/observable-assertions), `calledWith`, `resolveWith`, `mustBeCalledWith`, [strict mode](/core/strict-mode), and [fixtures](/core/create-spy-from-class).
- **Synchronous setup.** Drop `await`, and use the token list in a `spies.get` error to see what the class actually requested.

## What Suites gets right

The Nest docs recommend Suites. It gets close to half a million downloads a month.
`createNestUnit` keeps two ideas from Suites:

- **Read the dependencies Nest already records.** `@Injectable()` and `emitDecoratorMetadata` record the types. You don't repeat them as `{ provide, useValue }` entries or update a second list when the constructor changes.
- **Choose which dependencies stay real.** Use a solitary test to replace them all, or a sociable test to include specific classes without building the whole app.

Angular's `TestBed` lets you make the same choice in the provider list. Use `provideAutoSpy(Dep)` for every dependency in a solitary test. For a sociable test, keep a dependency real by relying on its existing provider or listing the real class. You don't need a separate builder.

## Versions this was written against

- `@suites/unit` 3.1.1 (published 2026-05-08), with `@suites/di.nestjs` and `@suites/doubles.vitest` at 3.1.0.
- `4.0.0-beta.0` came out on 2025-11-04. At the time of the check, no newer 4.x release had shipped. The later 3.1.x releases belong to the 3.x line.
- There were no releases between 3.0.1 (2025-01-02) and `4.0.0-alpha.0` (2025-10-27).

The comparison uses the published packages, not the documentation site. A registry check on
2026-09-19 confirmed the versions and dates. At that point, 3.1.1 was still `latest`. In the week
ending 2026-09-18, `@suites/unit` had 80 249 downloads and `@suites/doubles.vitest` had 25 353.
