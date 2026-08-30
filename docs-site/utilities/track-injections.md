---
title: Tracking injections
description: trackInjections — which collaborators an entry point actually asked for, recorded through DI provider factories instead of a barrel module mock. Angular and NestJS, one implementation.
---

# Tracking injections

```ts
// the same function is exported from 'vitest-auto-spy/nestjs'
import { trackInjections } from 'vitest-auto-spy/angular';

const collaborators = trackInjections([FeatureFlagService, ANALYTICS_TOKEN]);

TestBed.configureTestingModule({ providers: [CheckoutFacade, ...collaborators.providers] });
collaborators.get(FeatureFlagService).isOn.mockReturnValue(true);

TestBed.inject(CheckoutFacade).start();

expect(collaborators.names()).toEqual(['FeatureFlagService']); // analytics was never asked for
```

## The question it answers

The assertion behind most `vi.mock('@app/services')` calls is not "this module was replaced". It is
**which collaborators did this entry point actually ask for** — and that question is answerable
without touching the module boundary at all, because a provider factory runs exactly when something
injects its token. Register the collaborators as factories, run the entry point, read back the
tokens whose factories fired, in order.

That matters because the module boundary is the part a bundler is free to remove. Under
`@angular/build:unit-test` a barrel or a workspace alias is already inlined by the time the mock
would be installed, and `vi.mock` becomes a silent no-op —
[the whole first half of the module-mocks page](/utilities/module-mocks). DI is a seam the build has
to keep.

Written by hand this is the same nine lines every time — a `providers.map(token => ({ provide: token,
useFactory: … }))` pushing into an array declared just above it. On one real suite it got written
twice in a single afternoon and was wanted a third time. The hand-written version also always stops
at the record, so the spec still needs a second mechanism to stub what each collaborator answers.
This builds both: the providers carry auto-spies, and the log says which of them DI constructed.

## `trackInjections(tokens, options?)`

Returns an `InjectionLog`:

| Member               | What it gives                                                            |
| -------------------- | ------------------------------------------------------------------------ |
| `providers`          | the `{ provide, useFactory }` list to spread into a testing module       |
| `injectedTokens()`   | the tokens DI asked for, in the order their factories ran — a copy       |
| `names()`            | the same list as names, which is what makes a failing `toEqual` readable |
| `wasInjected(token)` | whether DI ever constructed `token`                                      |
| `get<D>(token)`      | the double registered for `token`, typed as `Spy<D>`                     |
| `reset()`            | forget the record; the doubles are untouched                             |

`injectedTokens()` hands back a copy, so mutating it changes nothing. `names()` reads the class name
off the token rather than off a literal, because the Angular plugin's decorator downlevelling renames
compiled classes; an `InjectionToken`, or a class a minifier stripped the name from, is named by its
`String` form.

`reset()` clears the record only. The doubles survive it — reset those with `resetAutoSpy` if the
spec needs their call history cleared too.

### The doubles

By default each token gets a double built the same way `createWithAutoSpies` builds one: a class spy
(`createSpyFromClass(token, { lazySpies: true })`) when the token is a function, and
[`createAutoMock()`](/core/auto-mock-by-type) otherwise — an `InjectionToken` carries no runtime
shape, so a type-level mock is the only honest stand-in.

```ts
collaborators.get<{ retries: number }>(CONFIG).retries = 3;
collaborators.get(FeatureFlagService).isOn.mockReturnValue(true);
```

Pass `double` when a collaborator has to be a real object — a `FormBuilder`, a config literal:

```ts
const collaborators = trackInjections([CONFIG], { double: () => ({ retries: 7 }) });
```

### The timing contract

The doubles are built **eagerly**, when `trackInjections` is called, so a spec can stub one before
the entry point runs. The _record_ fills in only as DI constructs them:

```ts
expect(collaborators.injectedTokens()).toEqual([]); // nothing asked yet
injector.get(CheckoutFacade).start();
expect(collaborators.injectedTokens()).toEqual([FeatureFlagService]);
```

A factory runs once per injector, so a token appears once per injector that asked for it — not once
per injection site.

### `get` on a token that is not tracked

```
[vitest-auto-spy] trackInjections(...).get(AnalyticsService): that token is not tracked by this log.
Tracked here: FeatureFlagService. Add it to the trackInjections([...]) list, or read it from the injector directly — `get` only answers for the tokens whose providers this log created.
Docs: https://asdalexey.github.io/vitest-auto-spy/utilities/track-injections
```

With an empty token list the same message reads `Tracked here: (none)`.

## Not Angular-specific

`{ provide, useFactory }` is literally the same object in both frameworks: Angular's `deps` and
NestJS's `inject` are both optional, and this helper's factories take no dependencies, so neither key
is written.

```ts
// NestJS
const collaborators = trackInjections([MailerService, ConfigService]);

const moduleRef = await Test.createTestingModule({
  providers: [OrdersService, ...collaborators.providers],
}).compile();

moduleRef.get(OrdersService).place(order);

expect(collaborators.wasInjected(MailerService)).toBe(true);
```

One implementation is re-exported from both `vitest-auto-spy/angular` and `vitest-auto-spy/nestjs`
rather than written twice and left to drift. The core imports **no framework at all** — which is
what keeps the [NestJS entry](/adapters/nestjs) dependency-free, since `@nestjs/common` and
`@nestjs/testing` are optional peers it never imports.

## Related

- [Provide a real seam](/utilities/module-mocks#provide-a-real-seam) — the constructive advice this
  helper is the tooling for. That section says to inject the dependency rather than mock the module;
  `trackInjections` is what you assert with once you have.
- [`createWithAutoSpies`](/adapters/angular#building-a-class-with-auto-spied-dependencies) — when the
  question is "build this class with doubles" rather than "record what it asked for".
