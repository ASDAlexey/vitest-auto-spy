---
title: Component provider overrides
description: overrideComponentProvider and overrideAutoSpy — replace a dependency a component declares for itself, and get told when the override did not apply.
---

# Component provider overrides

```ts
import { overrideAutoSpy, overrideComponentProvider } from 'vitest-auto-spy/angular';

const menu = overrideComponentProvider(CatalogPageComponent, NavigationBuilderService); // → Spy<NavigationBuilderService>

menu.build.mockReturnValue([]);

const fixture = TestBed.createComponent(HostComponent); // ← the override is verified here
```

`provideAutoSpy` registers a provider on the testing module, and a testing-module provider **loses**
to one the component declares in its own `@Component({ providers: [...] })` — route-scoped services,
per-component stores, `provideX()` helpers. The background on that trap, and on the two ways to fix
it, is on the [Angular adapter page](/adapters/angular#overriding-a-provider-the-component-declares-for-itself).
This page is about the part that comes after: **proving the override landed.**

## `overrideComponentProvider(component, Class, config?)`

Does three things, in order:

1. queues `component` with the TestBed compiler — as an `imports` entry when it is standalone, as a
   `declarations` entry otherwise — because `overrideProvider` is applied while a component is
   compiled, and a component the testing module never mentions is never compiled by it;
2. calls `TestBed.overrideProvider(Class, { useValue: spy })`;
3. queues a verification against the next `TestBed.createComponent`.

It returns the `Spy<T>` directly, so there is nothing to unwrap.

Do **not** reach for `TestBed.overrideComponent` for this. It forces a JIT recompilation, and under
an AOT test bundle that recompilation resolves the component's directives and pipes from a runtime
scope the bundler has stripped, leaving it with none of them — see
[`assertNgModuleScopes`](#assertngmodulescopes) below.

## The verification

Queuing the component removes the _usual_ cause of a silent no-op. It does not prove the override
landed, so the helper checks.

**What is queued.** Each call pushes one entry — component, token, spy — and wraps
`TestBed.createComponent` **once**. On the next fixture the wrapper runs every queued entry, then
puts the original method back and empties the queue. It fires on the first fixture and gets out of
the way, because the check belongs to the fixture that call built; a wrapper left installed would
run against a later spec's unrelated component.

**How the token is resolved.** Through the component's _own_ injector, not the testing module's:

- if `fixture.debugElement.componentInstance` is an instance of the overridden component, its
  injector is the one asked;
- otherwise the fixture root is queried with a plain predicate —
  `element.componentInstance instanceof component` — and the hosting debug element's injector
  answers.

No `@angular/platform-browser` import is involved. `By.directive` would have been the idiomatic
predicate and would have added an import to a package this entry does not otherwise need; the
`DebugElement` surface is read structurally instead.

**Why the nested case works at all.** On Angular 21.2.17, a child placed by a parent's template is
already instantiated at `createComponent` time — before any `detectChanges()`. That is a measured
fact, not an inference: the verification finds the nested component's injector on the fixture the
call returns, with no change detection run in between.

The failure names all three parties:

```
[vitest-auto-spy] overrideComponentProvider(CatalogPageComponent, NavigationBuilderService): the override did not apply.
CatalogPageComponent resolved NavigationBuilderService to a NavigationBuilderService instance, not the spy this call created — so every assertion about that spy is about an object the component never used.
Check that NavigationBuilderService is the token CatalogPageComponent injects (a component that injects a base class or an InjectionToken needs *that* token here, not the implementation class), and that nothing re-configured the testing module with a competing provider afterwards.
Docs: https://asdalexey.github.io/vitest-auto-spy/adapters/angular-overrides
```

A non-object answer is printed as it is (`resolved … to not-a-service`), and a class instance is
named by its constructor.

### Why it is always on

This is the design argument, and it is the whole reason the check is not a member of
[`enableAngularDiagnostics`](/adapters/angular-diagnostics):

- **The helper exists because the documented alternative fails silently.** An override that did not
  apply is a bug in the helper, not an optional extra. Shipping the helper with its own correctness
  check behind a flag would mean shipping the silent failure the helper was written to remove.
- **It cannot fire in a spec that never called `overrideComponentProvider`.** Nothing is queued, so
  `createComponent` is never wrapped. A suite that does not use the helper is untouched.
- **It stays silent when the component was not rendered.** No injector, no check.

Those are exactly the two properties the diagnostics group lacks — that group applies to every spec
in a suite, including ones written long before it existed, which is why turning a passing suite red
there is a project's decision rather than a library import's.

### Limitations

- **The first `createComponent` only.** The wrapper unhooks itself after one fixture. A spec that
  creates a throwaway fixture before the one that renders the overridden component is verified
  against the throwaway — where the component is absent, so the check is silent, not wrong.
- **Absent component means silence, not a guess.** When the fixture does not contain the component —
  behind an `@if`, on a lazy route, or simply a different host — there is nothing to check yet, and
  guessing would fail a correct spec.
- **A later competing override still wins.** `TestBed.overrideProvider(Token, …)` called _after_
  this helper replaces the spy. The check reports that (it is the throw shown above) but cannot
  prevent it.
- **No `createComponent` to hook, no verification.** On a `TestBed` without that method nothing is
  queued at all, so the helper degrades to "no verification" rather than to a stale check on some
  later fixture. The override itself still applies.

## `overrideAutoSpy(Class, config?)`

The `{ useValue }` shape `TestBed.overrideProvider` expects, carrying an auto-spy:

```ts
const payments = overrideAutoSpy(PaymentMethodService);

TestBed.configureTestingModule({ imports: [CheckoutComponent] }).overrideProvider(PaymentMethodService, payments);
payments.useValue.charge.resolveWith({ ok: true });
```

Use it when the component is **already** in the testing module and only the provider needs replacing;
use `overrideComponentProvider` when the component has to be queued as well. It takes the same second
argument as [`createSpyFromClass`](/core/create-spy-from-class).

`overrideAutoSpy` carries no verification of its own — the queue and the `createComponent` wrapper
belong to `overrideComponentProvider`.

## `assertNgModuleScopes(...modules)`

Also exported from this module, and covered in full on the
[Angular adapter page](/adapters/angular#an-ngmodule-that-contributes-nothing): it fails early when
an NgModule imported into the TestBed has an empty runtime scope, which under an AOT test bundle
means `ɵɵsetNgModuleScope` was stripped and the import contributes no directives, components or
pipes at all.

```ts
assertNgModuleScopes(DirectivesModule, PipesModule);
TestBed.configureTestingModule({ imports: [DirectivesModule, PipesModule] });
```

Pass only modules you import **for their declarations** — a providers-only module is legitimately
scope-empty and would be reported as a false positive. The
[`ngModuleScopes` diagnostic](/adapters/angular-diagnostics#ngmodulescopes) is the automatic form,
and it filters much harder for exactly that reason.

## `assertComponentDefIntact(...components)`

The other half of the same bundle problem. A component's providers and its compiled scope are
**baked into `ɵcmp` when the component's module executes** — not read at `createComponent` time. When
a bundler splits a barrel into a chunk that has not run yet, the definition is built with `undefined`
in those lists, and Angular discovers it much later, from inside itself:

```text
TypeError: Cannot read properties of undefined (reading 'provide')
  ❯ resolveProvider render3/di_setup.ts:95
```

The stack names neither the barrel, nor the symbol, nor the component. Worse, the spec it breaks is
usually one nobody touched: chunk boundaries move with file *contents*, so editing a type in a
neighbouring file is enough to move a symbol across one. Both obvious cures fail for the same reason
— an `await import()` at the top of `beforeEach` is already too late, and a static import at the top
of the spec does not fix the order this bundler emits.

```ts
assertComponentDefIntact(HoverMenuComponent);
const fixture = TestBed.createComponent(HoverMenuComponent);
```

```text
[vitest-auto-spy] HoverMenuComponent.ɵcmp.providers[0] is undefined.
A component bakes its providers and its scope into the definition when its module executes, so a
hole there means the chunk holding that symbol had not run at that moment — an uninitialised barrel
chunk.
```

It walks `providers`, `viewProviders` and `dependencies`, including lists nested inside them and the
thunk Angular emits for a forward reference. The same call answers the related
`Cannot read properties of undefined (reading 'ɵcmp')` from `imports: [Cmp]`, where the class
reference itself is what never arrived — there the message names the argument position instead.
Directives work too: a type carrying `ɵdir` is checked the same way.

This does not fix the build; that is a bundler configuration question. It replaces a half-hour
investigation with one line, and points it away from the spec.

## Related

- [Angular adapter](/adapters/angular) — why a component-level provider beats a module-level one.
- [Angular diagnostics](/adapters/angular-diagnostics) — the opt-in group, and why this check is not
  part of it.
