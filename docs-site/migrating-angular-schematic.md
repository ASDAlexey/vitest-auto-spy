---
title: After Angular's refactor-jasmine-vitest
description: Angular's refactor-jasmine-vitest schematic turns jasmine.createSpyObj into hand-written vi.fn() literals and leaves three TODOs. createSpyFromClass closes all three in one line; this page shows the real output beside the fix.
---

# After Angular's `refactor-jasmine-vitest`

You ran Angular's `refactor-jasmine-vitest` schematic, and your specs now contain hand-written
objects of `vi.fn()` plus `// TODO: vitest-migration:` comments. This page replaces each
`jasmine.createSpyObj` leftover with one line that reads the class instead of a method list:

```ts
import { createSpyFromClass } from 'vitest-auto-spy';

api = createSpyFromClass(Api); // every method of Api, typed, with helpers per return type
```

The schematic moves the **syntax** from Jasmine to Vitest, and it does that well. Where it cannot
decide, it leaves a TODO. The three TODOs it leaves on `createSpyObj` are covered
[below](#the-three-todos-and-the-line-beside-each).

This is **not** [the codemod](/utilities/codemod). `npx vitest-auto-spy codemod --from jasmine`
moves a `jasmine-auto-spies` project; this page starts from the schematic's output. If your project
uses `jasmine-auto-spies`, start at [Migrating from jasmine-auto-spies](/migrating-jasmine) instead.

## What the schematic does to `createSpyObj`

Below is the real output of `@schematics/angular` **22.1.6** on a one-file project. The command was
`npx schematics @schematics/angular:refactor-jasmine-vitest --project=app --no-dry-run`
(`@angular-devkit/schematics-cli` 22.x). Only the imports were removed afterwards.

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

For literal arguments, the rewrite is correct:

- `jasmine.SpyObj<Api>` becomes `MockedObject<Api>`;
- `.and.returnValue(v)` becomes `.mockReturnValue(v)`;
- each `vi.fn()` gets a name like `Api.get` for failure messages;
- `spyOn(o, 'm').and.callThrough()` becomes a bare `vi.spyOn(o, 'm')`. That is right: `vi.spyOn`
  calls through by default, while Jasmine's `spyOn` replaces the method
  ([the inverted default](/migrating-jasmine#spyon-means-the-opposite-thing-on-the-two-sides)).

It reprints the file with the TypeScript printer, so indentation becomes four spaces and quotes
change; Prettier restores them. `vi` is not imported, because `addImports` defaults to `false` and the
`@angular/build:unit-test` builder turns Vitest globals on.

It counts what it skipped in the console summary and in the `jasmine-vitest-<date>.md` report in the
project root:

```
- 3 TODO(s) added for manual review:
  - 1x createSpyObj-single-argument
  - 1x createSpyObj-dynamic-variable
  - 1x createSpyObj-dynamic-property-map
```

## The three TODOs, and the line beside each

The messages below are quoted from `@schematics/angular` 22.1.6. All three point to `vi.fn()`. Here
all three have the same answer: [`createSpyFromClass`](/core/create-spy-from-class) needs no method
list, because it reads the class.

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

`jasmine.createSpyObj('Api')` gives a name and no methods, so there is nothing to expand. The
schematic leaves the call as it is, and under Vitest it fails with
`ReferenceError: jasmine is not defined`. `createSpyFromClass(Api)` is the one-argument form that
works: you pass the class, and the spy gets every method the class has.

### `createSpyObj-dynamic-variable`

> Cannot transform jasmine.createSpyObj with a dynamic variable. Please migrate this manually.

Here `methods` is declared somewhere else: a shared `const`, a helper's parameter, or a list built by
`Object.keys`. A tool that sees only this call cannot expand it. `createSpyFromClass(Api)` needs no
list: it spies on every method of the class. If the list was there to _limit_ the spy, use
[`onlyMethodsToSpyOn`](/core/create-spy-from-class#configuration). It can stay a variable, typed as
the class's method names instead of `string[]`:

```ts
const methods = ['get'] satisfies Array<keyof Api>;

api = createSpyFromClass(Api, { onlyMethodsToSpyOn: methods });
```

### `createSpyObj-dynamic-property-map`

> Cannot transform jasmine.createSpyObj with a dynamic property map. Please migrate this manually.

Read the diff carefully for this one. The schematic **does** rewrite the call, but it drops the
third argument. `jasmine.createSpyObj('Api', ['get'], props)` became
`{ get: vi.fn().mockName('Api.get') }`, so `withProps.baseUrl` on the next line is now `undefined`.
Where `MockedObject<Api>` is declared, that is a compile error; elsewhere it is a silent `undefined`.
Only the TODO comment tells you.

The fix depends on what the property is on the class:

- a **plain field** keeps its type on `Spy<Api>`. Assign it, or pass the map to `overrides` in the
  provider: `provideAutoSpy(Api, { overrides: props })`;
- a **`readonly` field** or a **signal**: use
  [`mockReadonlyProp(api, 'baseUrl', '/api')`](/adapters/angular#signal-readonly-property-mocking).
  It remembers what it replaced, so `restoreMockedProps()` can undo it;
- a **getter**: use
  [`gettersToSpyOn: ['baseUrl']`](/core/create-spy-from-class#accessor-spies-—-accessorspies) and set
  the value with `api.accessorSpies.getters.baseUrl.mockReturnValue('/api')`. The property itself
  keeps the type the class declares.

## Why the two dynamic cases cannot exist here

The schematic rewrites the **call site**. It must see the method names as a literal array or object
in the arguments, because a variable could hold anything. So a non-literal list cannot be rewritten,
and a call with no list has nothing to rewrite.

`createSpyFromClass` reads the **class**. At runtime it walks `Api.prototype` and its parents and
spies on what it finds. At compile time, `Spy<Api>` is built from the same class. There is no list at
the call site, so nothing can be dynamic. A method added to `Api` next month is on the spy at the next
test run. A removed method is a compile error on the line that still calls it.

[`vitest-auto-spy/jasmine`](/migrating-jasmine) also has a `createSpyObj`, for specs that are not
ready to name a class. It keeps Jasmine's call shape and reads the names at runtime, so a variable
list works there. Its return type uses whatever names the compiler can see: a `string[]` variable
gives `string` keys. It refuses the one-argument form with an error that names the fix. Where a
class exists, prefer the class.

## What the literal costs afterwards

The literal the schematic writes is what
[angular.dev's testing guide](https://angular.dev/guide/testing/services) recommends writing by hand.
Nothing is wrong with it. It just costs more to maintain:

- **You edit it on every change to the class.** `MockedObject<Api>` requires every member of `Api`.
  Add a method to the service, and every spec with the literal fails to compile until you add another
  `name: vi.fn().mockName('Api.name')` line. `Spy<Api>` follows the class.
- **No helpers per return type.** A `vi.fn()` knows only `api.get.mockReturnValue(of([...]))`. Here
  `api.get` returns an `Observable`, so it has
  [`nextWith` / `throwWith`](/core/control-helpers#observable-methods-properties-—-nextwith) and
  `calledWith('/orders').nextWith([...])`. A method returning a `Promise` has
  [`resolveWith` / `rejectWith`](/core/control-helpers#promise-returning-methods-—-resolvewith).
  Every method has [`mustBeCalledWith`](/core/control-helpers#synchronous-methods), which fails the
  test on wrong arguments instead of returning `undefined`.
- **An unconfigured method is silent in both.** `vi.fn()` returns `undefined`, and so does an
  unconfigured spy here. [`strict: true`](/core/strict-mode) makes such a call fail, for one spy or
  for all tests.
- **Names are about equal.** With a base name, the schematic names each mock `Api.get`, which reads
  well in failures. Without a base name (`jasmine.createSpyObj(['get'])`) you get bare `vi.fn()`s.
  Here every method spy is named after its method, on every runner that supports names.

## If you would rather stop at jasmine syntax first

This is the alternative to running the schematic on your spies at all. The test runner changes, the
specs stay as they are, and you rewrite the spies later, one at a time.
[`vitest-auto-spy/jasmine`](/migrating-jasmine#jasmine-s-own-globals) makes that possible:

```ts
import { jasmine } from 'vitest-auto-spy/jasmine';

const api = jasmine.createSpyObj('Api', ['get', 'post']); // unchanged, runs under Vitest
api.get.and.returnValue(of([])); // .and, .calls, .withArgs are back
```

Nothing is added to `globalThis`: you import it in each file, and [the codemod](/utilities/codemod)
removes the import at the end. On `bun test` or `node --test`, where this entry cannot load, call
`enableJasmineCompat()` from `vitest-auto-spy/jasmine-compat` in a setup file instead; see
[On Bun and `node:test`](/migrating-jasmine#on-bun-and-node-test).

## The record, with versions

A few common claims about this migration are not quite accurate. Each line below was checked against
a primary source on 2026-09-02.

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
  Stabilised is a statement about its coverage of test patterns, not its listing: in 22.1.6, and
  still in 22.2.0, the collection entry reads
  `[EXPERIMENTAL] Refactors Jasmine tests to use Vitest APIs.` and is `"hidden": true`, so it does
  not appear in `ng generate --help` and has to be named in full.
- **22.2.0 makes a new project a Vitest 5 project** (checked against the `@schematics/angular`
  22.2.0 tarball on 2026-09-26). `ng new` pins `vitest` at `^5.0.0` — 22.1.x pinned `^4.0.8` —
  the Karma-to-Vitest migration and the `vitest-browser` schematic add `@vitest/coverage-*` and the
  browser providers at the same range, and `ng generate config vitest` writes
  `vitest-base.config.mts` where it used to write `vitest-base.config.ts`.
