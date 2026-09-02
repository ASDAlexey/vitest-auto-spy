---
title: After Angular's refactor-jasmine-vitest
description: Angular's own ng generate @schematics/angular:refactor-jasmine-vitest rewrites jasmine.createSpyObj into a hand-written object literal of vi.fn() and emits three TODO comments it cannot resolve. createSpyFromClass closes all three by construction — it reads the class prototype, not the call site — and this page shows the schematic's real output beside the one line that replaces it, plus the Karma and Vitest record with version numbers.
---

# After Angular's `refactor-jasmine-vitest`

`ng generate @schematics/angular:refactor-jasmine-vitest` moves an Angular suite's **syntax** from
jasmine to Vitest. It does that job well, and it is honest about the parts it cannot do: it leaves a
`// TODO: vitest-migration:` comment on every call it declined. This page is for the diff that comes
out of it — specifically the `jasmine.createSpyObj` lines, which it expands into a hand-written
object literal, and the three shapes it leaves untouched.

It is **not** [the codemod](/utilities/codemod). `npx vitest-auto-spy codemod --from jasmine` takes
a `jasmine-auto-spies` suite onto this library; this page takes the output of Angular's schematic
onto it. Different input, same destination. If the suite is on `jasmine-auto-spies`, start at
[Migrating from jasmine-auto-spies](/migrating-jasmine) instead.

## What the schematic does to `createSpyObj`

Everything below is the real output of `@schematics/angular` **22.1.6**, run on a one-file project
with `npx schematics @schematics/angular:refactor-jasmine-vitest --project=app --no-dry-run`
(`@angular-devkit/schematics-cli` 22.x). Nothing was edited afterwards except stripping the imports.

Before:

```ts
const methods = ['get'];
const props = { baseUrl: '/api' };

describe('Orders', () => {
  let api: jasmine.SpyObj<Api>;

  beforeEach(() => {
    api = jasmine.createSpyObj('Api', ['get', 'post']);
    api.get.and.returnValue(of([{ id: 1 }]));
    TestBed.configureTestingModule({ providers: [Orders, { provide: Api, useValue: api }] });
  });

  it('spies on a real instance', () => {
    spyOn(orders, 'refresh').and.callThrough();
  });

  it('single argument', () => {
    const bare = jasmine.createSpyObj('Api');
  });

  it('method list in a variable', () => {
    const dynamic = jasmine.createSpyObj('Api', methods);
  });

  it('property map in a variable', () => {
    const withProps = jasmine.createSpyObj('Api', ['get'], props);
    expect(withProps.baseUrl).toBe('/api');
  });
});
```

After:

```ts
import type { MockedObject } from 'vitest';

const methods = ['get'];
const props = { baseUrl: '/api' };

describe('Orders', () => {
  let api: MockedObject<Api>;

  beforeEach(() => {
    api = {
      get: vi.fn().mockName('Api.get'),
      post: vi.fn().mockName('Api.post'),
    };
    api.get.mockReturnValue(of([{ id: 1 }]));
    TestBed.configureTestingModule({ providers: [Orders, { provide: Api, useValue: api }] });
  });

  it('spies on a real instance', () => {
    vi.spyOn(orders, 'refresh');
  });

  it('single argument', () => {
    // TODO: vitest-migration: jasmine.createSpyObj called with a single argument is not supported for transformation. See: https://vitest.dev/api/vi.html#vi-fn
    const bare = jasmine.createSpyObj('Api');
  });

  it('method list in a variable', () => {
    // TODO: vitest-migration: Cannot transform jasmine.createSpyObj with a dynamic variable. Please migrate this manually. See: https://vitest.dev/api/vi.html#vi-fn
    const dynamic = jasmine.createSpyObj('Api', methods);
  });

  it('property map in a variable', () => {
    // TODO: vitest-migration: Cannot transform jasmine.createSpyObj with a dynamic property map. Please migrate this manually. See: https://vitest.dev/api/vi.html#vi-fn
    const withProps = {
      get: vi.fn().mockName('Api.get'),
    };
    expect(withProps.baseUrl).toBe('/api');
  });
});
```

The rewrite of the literal case is correct and carefully done: `jasmine.SpyObj<Api>` becomes
`MockedObject<Api>`, `.and.returnValue(v)` becomes `.mockReturnValue(v)`, each `vi.fn()` is named
`Api.get` for failure output, and `spyOn(o, 'm').and.callThrough()` becomes a bare `vi.spyOn(o, 'm')`
— which is right, because `vi.spyOn` calls through by default where jasmine's `spyOn` stubs
([the inverted default](/migrating-jasmine#spyon-means-the-opposite-thing-on-the-two-sides)). It
reprints the file through the TypeScript printer, so indentation moves to four spaces and quotes
flip; Prettier puts that back. `vi` is not imported because `addImports` defaults to `false` — the
`@angular/build:unit-test` builder turns Vitest globals on.

The summary it prints, and the `jasmine-vitest-<date>.md` report it writes to the project root, count
what it declined:

```
- 3 TODO(s) added for manual review:
  - 1x createSpyObj-single-argument
  - 1x createSpyObj-dynamic-variable
  - 1x createSpyObj-dynamic-property-map
```

## The three TODOs, and the line beside each

The messages are quoted verbatim from `refactor/jasmine-vitest/utils/todo-notes.js` in
`@schematics/angular` 22.1.6, and all three link to `vi.fn()` as the way forward. Every one of them
has the same answer here, because [`createSpyFromClass`](/core/create-spy-from-class) never sees a
method list — it reads the class.

```ts
import { createSpyFromClass } from 'vitest-auto-spy';

api = createSpyFromClass(Api); // every prototype method, typed, with the return-type helpers
```

In a `TestBed`, the same thing as a provider, with
[`provideAutoSpy` / `injectSpy`](/adapters/angular):

```ts
TestBed.configureTestingModule({ providers: [Orders, provideAutoSpy(Api)] });
api = injectSpy(Api);
```

### `createSpyObj-single-argument`

> jasmine.createSpyObj called with a single argument is not supported for transformation.

`jasmine.createSpyObj('Api')` names the double and lists nothing, so there is no method list to
expand. The schematic leaves the call alone, and the line fails at runtime under Vitest with
`ReferenceError: jasmine is not defined`. `createSpyFromClass(Api)` is the single-argument form
that works: the name is the class, and the methods are whatever its prototype has.

### `createSpyObj-dynamic-variable`

> Cannot transform jasmine.createSpyObj with a dynamic variable. Please migrate this manually.

`jasmine.createSpyObj('Api', methods)` with `methods` declared elsewhere — a shared `const`, a
helper's parameter, a list built by `Object.keys` — cannot be expanded by a transformer that only
sees this call. Here there is nothing to expand: `createSpyFromClass(Api)` spies on every method the
prototype has. If the list existed to _restrict_ the double, that is
[`onlyMethodsToSpyOn`](/core/create-spy-from-class#configuration), and it can stay a variable, typed
as the class's method keys rather than `string[]`:

```ts
const methods = ['get'] satisfies Array<keyof Api>;

api = createSpyFromClass(Api, { onlyMethodsToSpyOn: methods });
```

### `createSpyObj-dynamic-property-map`

> Cannot transform jasmine.createSpyObj with a dynamic property map. Please migrate this manually.

This is the one to read the diff for, because the schematic **does** rewrite the call and drops the
third argument on the floor: `jasmine.createSpyObj('Api', ['get'], props)` became
`{ get: vi.fn().mockName('Api.get') }`, and `withProps.baseUrl` on the next line is now `undefined`
— a compile error where `MockedObject<Api>` is declared, and a silent `undefined` where it is not.
The comment is the only thing that says so.

The honest answer depends on what the property is on the class:

- a **plain field** keeps its declared type on `Spy<Api>`, so assign it, or hand the map to
  `overrides` in the provider — `provideAutoSpy(Api, { overrides: props })`;
- a **`readonly` field** or a **signal** is
  [`mockReadonlyProp(api, 'baseUrl', '/api')`](/adapters/angular#signal-readonly-property-mocking),
  which records the descriptor it replaced so `restoreMockedProps()` can undo it;
- a **getter** is
  [`gettersToSpyOn: ['baseUrl']`](/core/create-spy-from-class#accessor-spies-—-accessorspies), and
  the value is set on `api.accessorSpies.getters.baseUrl.mockReturnValue('/api')` — the property
  itself stays typed as the class declares it.

## Why the two dynamic cases cannot exist here

The schematic transforms the **call site**: it has to see the method names as a literal array or
object in the argument list, because a string in a variable could come from anywhere. So a list that
is not a literal is not transformable, and there is no single-argument form to transform at all.

`createSpyFromClass` reads the **prototype**: it walks `Api.prototype` (and its chain) at runtime
and spies on what it finds, and `Spy<Api>` is a mapped type over the same class at compile time.
There is no list at the call site — literal or otherwise — for anything to be dynamic. A method added
to `Api` next month is on the double the next time the test runs; a method removed is a compile
error on the line that still calls it.

The same holds for `createSpyObj` on the [`vitest-auto-spy/jasmine`](/migrating-jasmine) entry, which
keeps jasmine's call shape for a suite that is not ready to name a class yet: it reads the names at
runtime, so a variable list works there, and the object it returns is typed by whatever names the
compiler can see — a `string[]` variable gives it `string` keys. It also refuses the single-argument
form with a message that names the fix. Prefer the class where there is one.

## What the literal costs afterwards

The literal the schematic writes is exactly what
[angular.dev's testing guide](https://angular.dev/guide/testing/services) recommends by hand, so
nothing about it is wrong. It is a maintenance shape, and the bill arrives later:

- **It is edited on every change to the class.** `MockedObject<Api>` demands every member of `Api`,
  so adding a method to the service is a compile error in every spec that carries the literal, and
  each one is fixed by typing another `name: vi.fn().mockName('Api.name')` line. `Spy<Api>` follows
  the class.
- **No return-type helpers.** `api.get.mockReturnValue(of([...]))` is the only shape a `vi.fn()`
  knows. Here `api.get` returns an `Observable`, so it has
  [`nextWith` / `throwWith`](/core/control-helpers#observable-methods-properties-—-nextwith) and
  `calledWith('/orders').nextWith([...])`; a `Promise`-returning method has
  [`resolveWith` / `rejectWith`](/core/control-helpers#promise-returning-methods-—-resolvewith); every
  method has [`mustBeCalledWith`](/core/control-helpers#synchronous-methods), which fails the test on
  an argument mismatch instead of returning `undefined`.
- **An unconfigured method is silent in both.** `vi.fn()` returns `undefined`, and so does an
  unconfigured spy here; [`strict: true`](/core/strict-mode) turns that into a failure on the call
  that produced it, per double or for the whole suite.
- **Naming is a wash, in one direction.** With a base name the schematic names each mock `Api.get`,
  which is good failure output; the form without a base name (`jasmine.createSpyObj(['get'])`) gets
  bare `vi.fn()`s. Here every method spy is named after its method on every runner that supports a
  name.

## If you would rather stop at jasmine syntax first

The schematic's own output is already past jasmine's syntax, so this is the alternative to running
it on the spies at all — the runner moves, the specs do not, and the doubles are rewritten later,
one at a time. [`vitest-auto-spy/jasmine`](/migrating-jasmine#jasmine-s-own-globals) is that
step:

```ts
import { jasmine } from 'vitest-auto-spy/jasmine';

const api = jasmine.createSpyObj('Api', ['get', 'post']); // unchanged, runs under Vitest
api.get.and.returnValue(of([])); // .and, .calls, .withArgs are back
```

Nothing is installed on `globalThis` — it is an import per file, which
[the codemod](/utilities/codemod) deletes at the end. On `bun test` or `node --test`, where the
entry cannot be loaded, `enableJasmineCompat()` from `vitest-auto-spy/jasmine-compat` turns the
namespaces on from a setup file instead; see
[On Bun and `node:test`](/migrating-jasmine#on-bun-and-node-test).

## The record, with versions

Three things are repeated about this migration that are not quite what happened. Each line below was
checked against a primary source on 2026-09-02.

- **Angular did not deprecate Karma. Karma's own maintainers did, in 2023.** The notice — "Karma is
  deprecated and is not accepting new features or general bug fixes" — was added to the Karma README
  by commit `450fdfda` on 2023-04-27 in `karma-runner/karma`. The Angular CLI changelog contains no
  entry deprecating Karma; what **22.0.0** deprecated is the builder family — "Webpack builders in
  build-angular are deprecated. Use @angular/build builders instead." — and `@angular/build:karma`
  is one of those replacements, not one of the deprecations.
- **Vitest became the `ng new` default in 21.0.0** (2025-11-19). The changelog line is "configure
  Vitest for new projects and allow runner choice" (`2ffc527b`), whose commit message reads
  "configure Vitest as the default unit testing runner, replacing Karma and Jasmine", with a
  `testRunner` option to choose `karma` instead. The same release introduced the schematic:
  "introduce initial jasmine-to-vitest unit test refactor schematic" (`58474ec7`).
- **22.0.0** (2026-06-03) removed the experimental builders — "The experimental
  `@angular-devkit/build-angular:jest` and `@angular-devkit/build-angular:web-test-runner` builders
  have been removed." — and shipped "stabilize refactor-jasmine-vitest schematic" (`de630c2f`).
  Stabilised is a statement about its coverage of test patterns, not its listing: in 22.1.6 the
  collection entry still reads `[EXPERIMENTAL] Refactors Jasmine tests to use Vitest APIs.` and is
  `"hidden": true`, so it does not appear in `ng generate --help` and has to be named in full.
