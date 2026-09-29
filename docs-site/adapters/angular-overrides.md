---
title: Component provider overrides
description: overrideComponentProvider and overrideAutoSpy — replace a dependency a component declares for itself, and get told when the override did not apply.
---

# Component provider overrides

Use `overrideComponentProvider` when a component lists a service in its own
`@Component({ providers: [...] })`. A `provideAutoSpy` in `TestBed.configureTestingModule` does not
reach such a service: the component's own provider wins, and the component quietly gets the real
one. `overrideComponentProvider` replaces it with a spy and checks, on the next render, that the
component really received that spy.

```ts
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { overrideComponentProvider } from 'vitest-auto-spy/angular';

import { ProfileComponent } from './profile.component';
import { UserService } from './user.service';

// @Component({ providers: [UserService], … }) class ProfileComponent — ngOnInit calls userService.load()
it('loads the user', () => {
  TestBed.configureTestingModule({ imports: [ProfileComponent] }); // the rest of the module, as usual

  const users = overrideComponentProvider(ProfileComponent, UserService, {
    returns: { load: of({ name: 'Ada' }) }, // load(): Observable<User>
  });

  const fixture = TestBed.createComponent(ProfileComponent); // the override is checked here
  fixture.detectChanges(); // runs ngOnInit

  expect(users.load).toHaveBeenCalledTimes(1);
});
```

Call it after `configureTestingModule` and **before** anything reads the injector: `TestBed.inject`,
`injectSpy` or `createComponent`. `configureTestingModule` does not read the injector. Why a
module-level provider loses, and the other fix (removing the component's provider), is on the
[Angular page](/adapters/angular#overriding-a-provider-the-component-declares-for-itself).

## `overrideComponentProvider(component, Class, config?)`

Replaces the provider `Class` that `component` declares for itself with an auto-spy, and returns the
spy. Use it for a service in the component's own `providers`.

```ts
const menu = overrideComponentProvider(CatalogPageComponent, NavigationBuilderService, {
  returns: { build: [] },
});

const fixture = TestBed.createComponent(AppShellComponent); // CatalogPageComponent renders inside it
```

The component does not have to be in `imports`; listing it there too is harmless. The helper adds
it to the testing module for you: as an import when it is standalone, as a declaration otherwise. So it also works for a child
that only a parent's template renders.

| Argument    | Type                                   | Meaning                                                     |
| ----------- | -------------------------------------- | ----------------------------------------------------------- |
| `component` | component class                        | the component that declares the provider                    |
| `Class`     | service class                          | the provider to replace                                     |
| `config`    | same as `createSpyFromClass`'s 2nd arg | an options object such as `{ returns: { load: of(user) } }` |
| returns     | `Spy<Class>`                           | the spy the component will get                              |

**Common mistake:** calling it after something has already read the injector. Angular accepts no
override past that point, and the helper says so:

```text
[vitest-auto-spy] overrideComponentProvider(ProfileComponent, DeleteAccountService) ran after the testing module was instantiated, and Angular accepts no override past that point. Something read the injector first — a `TestBed.inject`, an `injectSpy`, a `createComponent` — earlier in this test or in the same `beforeCreate`. Override first, then inject.
```

(`beforeCreate` is an option of `renderShallow`, a hook that runs before the component is created.)

Move the call above the first `TestBed.inject`, `injectSpy` or `createComponent`. The lint rule
[`no-inject-before-override`](/utilities/eslint-rules#no-inject-before-override) reports the wrong
order before you run the test.

Do not use `TestBed.overrideComponent` for this. It recompiles the component at runtime, and in an
ahead-of-time (AOT) test bundle, such as the one `@angular/build:unit-test` builds, the recompiled component loses its directives and pipes
(see [`assertNgModuleScopes`](#assertngmodulescopes-modules)).

## The verification

On the next `TestBed.createComponent`, the helper asks the component's own injector for the service.
If the answer is not the spy it returned, the test fails and names the component, the service and
the cause:

```text
[vitest-auto-spy] overrideComponentProvider(CatalogPageComponent, NavigationBuilderService): the override did not apply — CatalogPageComponent resolved NavigationBuilderService to a NavigationBuilderService instance, not the spy this call returned.
It got the real service because something configured NavigationBuilderService again after this call — a later TestBed.overrideProvider or configureTestingModule. Keep overrideComponentProvider as the last word on it.
```

Only a later call that names **the same service** breaks the override: a `TestBed.overrideProvider(UserService, …)`
or a `configureTestingModule` whose `providers` list `UserService`. Remove it, or move
`overrideComponentProvider` after it.

The check is always on and needs no setup. It runs only in a test that called
`overrideComponentProvider`, so other specs are not affected.

What it does and does not check:

- **Only the first fixture.** The check runs on the first `createComponent` after the call, then
  switches itself off for good. If that first fixture does not contain the component, the test
  passes without a check: the helper does not wait for a later fixture.
- **A component that did not render is skipped.** Behind an `@if`, on a lazy route, or when the fixture
  renders some other component, there is no injector to ask yet, so the check does nothing rather than guess.
- **It reports a later override but cannot stop it.** A `TestBed.overrideProvider(Class, …)` after
  this call still replaces the spy; the check then fails with the message above.
- **Nothing carries over between tests.** A test that called the helper but never rendered leaves no
  pending check behind for the next test.
- `getTestBed().createComponent(…)` is checked the same way as `TestBed.createComponent(…)`.

## `overrideAutoSpy(Class, config?)`

Returns the `{ useValue: spy }` object that `TestBed.overrideProvider` expects. Unlike `providers` in
`configureTestingModule`, `TestBed.overrideProvider` also replaces a component's own provider. Use
`overrideAutoSpy` when the component is already in the testing module and you do not need the check;
use `overrideComponentProvider` otherwise.

```ts
import { TestBed } from '@angular/core/testing';
import { overrideAutoSpy } from 'vitest-auto-spy/angular';

const payments = overrideAutoSpy(PaymentMethodService);

TestBed.configureTestingModule({ imports: [CheckoutComponent] }).overrideProvider(PaymentMethodService, payments);
payments.useValue.charge.resolveWith({ ok: true });
```

The second argument is the same as for [`createSpyFromClass`](/core/create-spy-from-class). The spy
is `payments.useValue`.

**Common mistake:** expecting a check. `overrideAutoSpy` does not verify that the override applied;
only `overrideComponentProvider` does. `overrideProvider(X, provideAutoSpy(X))` also works, but
`overrideAutoSpy` says what it does.

## `assertNgModuleScopes(...modules)`

Fails early, naming the module, when an `NgModule` you import into `TestBed` brings no components,
directives or pipes. Use it when a spec imports a module for its declarations and the template
fails with `NG0303` or `NG0304`.

```ts
import { TestBed } from '@angular/core/testing';
import { assertNgModuleScopes } from 'vitest-auto-spy/angular';

assertNgModuleScopes(DirectivesModule, PipesModule);
TestBed.configureTestingModule({ imports: [DirectivesModule, PipesModule] });
```

Why it happens: the test bundle of `@angular/build:unit-test` is compiled ahead of time (AOT) and
drops the runtime record of what a module declares. `TestBed` reads that record, so the imported
module is empty there. Angular then reports it in ways that do not name the module:

```text
NG0303: Can't bind to 'appTruncate' since it isn't a known property of 'div'
NG0301: Export of name 'focusable' not found!
NG0304: 'ui-smart-row' is not a known element
(or nothing at all — an attribute directive simply never runs)
```

The fix is to import the components, directives and pipes the spec needs directly, or declare them
in `TestBed`.

**Common mistake:** passing a providers-only module. It declares nothing on purpose, so it is
reported too; leave it out of the call. The
[`ngModuleScopes` diagnostic](/adapters/angular-diagnostics#ngmodulescopes) does the same check for
every testing module automatically, and skips providers-only modules.

## `assertComponentDefIntact(...components)`

Fails early, naming the component and the list, when a component was compiled with `undefined` in
its `providers`, `viewProviders` or compiled `imports`. Use it when `createComponent` fails with
`Cannot read properties of undefined (reading 'provide')` and the stack points into Angular.

```ts
import { TestBed } from '@angular/core/testing';
import { assertComponentDefIntact } from 'vitest-auto-spy/angular';

assertComponentDefIntact(HoverMenuComponent);
const fixture = TestBed.createComponent(HoverMenuComponent);
```

```text
[vitest-auto-spy] HoverMenuComponent.ɵcmp.providers[0] is undefined.
HoverMenuComponent baked that list in when its file ran, before the chunk holding the symbol had run — an uninitialised barrel chunk, which Angular reports later as "Cannot read properties of undefined (reading 'provide')".
In HoverMenuComponent's source, import the symbol at that position from its own file rather than through the barrel.
```

Why it happens: Angular fixes a component's lists when the component's file runs. If the bundler put
an imported symbol in a chunk that has not run yet — usually one imported through a barrel
(`index.ts`) — the list gets `undefined` in its place. Editing a neighbouring file can move chunk
boundaries, so the spec that breaks is often one nobody touched.

The fix is in the component's source: import that symbol from its own file, not through the barrel.
Importing it earlier in the spec does not help.

The same call also catches `Cannot read properties of undefined (reading 'ɵcmp')` from
`imports: [Cmp]`, where the class itself arrived as `undefined`; the message then names the argument
position. Directives are checked the same way.

## Related

- [Angular](/adapters/angular) — `provideAutoSpy`, `injectSpy` and why a component's own provider
  wins over a module-level one.
- [Angular diagnostics](/adapters/angular-diagnostics) — opt-in checks that run on every testing
  module.
