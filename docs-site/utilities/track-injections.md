---
title: Tracking injections
description: trackInjections records which dependencies your code actually asked DI for, and gives each one an auto-spy. Works with Angular and NestJS.
---

# Tracking injections

`trackInjections(tokens)` replaces a list of dependencies with spies and records which of them your
code asked DI for, in order. Use it to assert "this entry point only uses these services", instead of
mocking a barrel module with `vi.mock`.

```ts
import { TestBed } from '@angular/core/testing';
import { trackInjections } from 'vitest-auto-spy/angular';

// also exported from 'vitest-auto-spy/nestjs'

it('starts checkout without analytics', () => {
  const collaborators = trackInjections([FeatureFlagService, ANALYTICS_TOKEN]);

  TestBed.configureTestingModule({ providers: [CheckoutFacade, ...collaborators.providers] });
  collaborators.get(FeatureFlagService).isOn.mockReturnValue(true);

  TestBed.inject(CheckoutFacade).start();

  expect(collaborators.names({ clean: true })).toEqual(['FeatureFlagService']); // analytics was never asked for
});
```

## The question it answers

Most `vi.mock('@app/services')` calls really ask: which dependencies did this code use? DI can answer
that directly. A provider factory runs exactly when something injects its token. So
`trackInjections` registers each dependency as a factory, and you read back the tokens whose
factories ran.

This keeps working under a bundler. Under `@angular/build:unit-test`, a barrel or a workspace alias
is already inlined, and `vi.mock` silently does nothing; see
[Module mocks that did nothing](/utilities/module-mocks). DI is a boundary the build has to keep.

A hand-written version (`providers.map(token => ({ provide: token, useFactory: … }))`) only records.
You would still need a second mechanism to stub what each dependency returns. `trackInjections` does
both: the providers carry auto-spies, and the log says which of them DI created.

## `trackInjections(tokens, options?)`

| Parameter        | Type                       | Default     | Meaning                                                       |
| ---------------- | -------------------------- | ----------- | ------------------------------------------------------------- |
| `tokens`         | array of classes or tokens | —           | The dependencies to replace and track                         |
| `options.double` | `(token) => unknown`       | an auto-spy | Builds the replacement for a token; see [below](#the-doubles) |

It returns a log:

| Member               | What it gives                                                      |
| -------------------- | ------------------------------------------------------------------ |
| `providers`          | the `{ provide, useFactory }` list to spread into a testing module |
| `injectedTokens()`   | the tokens DI asked for, in the order their factories ran (a copy) |
| `names(options?)`    | the same list as names, so a failing `toEqual` is readable         |
| `wasInjected(token)` | whether DI ever created `token`                                    |
| `get<D>(token)`      | the spy registered for `token`, typed as `Spy<D>`                  |
| `reset()`            | forgets the record; the spies are untouched                        |

**Use `names({ clean: true })`.** A bundler may rename classes: the Angular plugin compiles
`FeatureFlagService` to a class named `_FeatureFlagService`, and plain `names()` returns that name.
`clean: true` removes the bundler's rename (esbuild's leading `_`, Rollup's `$1` suffix), so the list
matches the names you wrote. An `InjectionToken`, or a class whose name a minifier removed, is named
by its `String` form.

`reset()` clears only the record. To clear the spies' call history as well, use `resetAutoSpy`.

### The doubles

By default, each token gets a spy built like `createWithAutoSpies` builds one:

- a class token gets a class spy, `createSpyFromClass(token)` with its default options;
- any other token, such as an `InjectionToken`, gets [`createAutoMock()`](/core/auto-mock-by-type),
  because such a token has no runtime shape to read.

```ts
collaborators.get<{ retries: number }>(CONFIG).retries = 3;
collaborators.get(FeatureFlagService).isOn.mockReturnValue(true);
```

Pass `double` when a dependency has to be a real object, such as a `FormBuilder` or a config object:

```ts
const collaborators = trackInjections([CONFIG], { double: () => ({ retries: 7 }) });
```

### The timing contract

The spies are created right away, when you call `trackInjections`, so you can stub one before your
code runs. The record fills in only when DI creates them:

```ts
expect(collaborators.injectedTokens()).toEqual([]); // nothing asked yet
TestBed.inject(CheckoutFacade).start();
expect(collaborators.injectedTokens()).toEqual([FeatureFlagService]);
```

DI creates each dependency once per injector. So a token appears once for each injector that asked
for it, not once for each place that injects it.

**Common mistake:** expecting the record to show what one method asked for. Most classes inject
their dependencies when they are created, so the record fills in at `TestBed.inject(CheckoutFacade)`,
before `start()` runs. To see only what `start()` asked for, call `collaborators.reset()` after
creating the class. A dependency created earlier is not recorded again. So if the class injects
its dependencies in the constructor or in fields, you can prove what the class asked for, but not
what one method asked for.

### `get` on a token that is not tracked

**Common mistake:** calling `get` with a token that is not in the list. It throws:

```
[vitest-auto-spy] trackInjections(...).get(AnalyticsService): that token is not tracked by this log.
Tracked here: FeatureFlagService. Add it to the trackInjections([...]) list, or read it from the injector directly — `get` only answers for the tokens whose providers this log created.
Docs: https://asdalexey.github.io/vitest-auto-spy/utilities/track-injections#get-on-a-token-that-is-not-tracked
```

With an empty token list, the message says `Tracked here: (none)`.

## Not Angular-specific

`{ provide, useFactory }` is the same object in Angular and NestJS, and the factories take no
dependencies. So the same `providers` list works in both.

```ts
// NestJS
import { Test } from '@nestjs/testing';
import { trackInjections } from 'vitest-auto-spy/nestjs';

const collaborators = trackInjections([MailerService, ConfigService]);

const moduleRef = await Test.createTestingModule({
  providers: [OrdersService, ...collaborators.providers],
}).compile();

moduleRef.get(OrdersService).place(order);

expect(collaborators.wasInjected(MailerService)).toBe(true);
```

It is one implementation, exported from both `vitest-auto-spy/angular` and `vitest-auto-spy/nestjs`.
It imports no framework, so the [NestJS entry](/adapters/nestjs) needs no dependency:
`@nestjs/common` and `@nestjs/testing` are optional peers it never imports.

## Related

- [Provide a real seam](/utilities/module-mocks#provide-a-real-seam): why to inject a dependency
  instead of mocking its module. `trackInjections` is how you assert once you have.
- [`createWithAutoSpies`](/adapters/angular#building-a-class-with-auto-spied-dependencies): when you
  want to build a class with spied dependencies rather than record what it asked for.
